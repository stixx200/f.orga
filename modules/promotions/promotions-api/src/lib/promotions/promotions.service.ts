import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import type { z } from 'zod';
import { assertVersion, Audit, type AuthenticatedUser, berlinDate, brigadeLogoDataUrl, type Certificate, DomainEvents, renderCertificatesPdf, SettingsService } from '@forga/core-api';
import type { BrigadeSettings } from '@forga/core-contracts';
import { ORGANIZATION, type Organization, PERSON_DIRECTORY, type PersonCareer, type PersonDirectory } from '@forga/masterdata-contracts';
import {
  addYears,
  type Candidate,
  type CareerFacts,
  type DecideInput,
  type EntryUpdate,
  type Evaluation,
  evaluatePerson,
  evaluateRule,
  type ExcludedCandidate,
  type Exclusion,
  type ExclusionInput,
  type ListEntry,
  type ListInput,
  type ManualEntryInput,
  type PersonPromotion,
  type PromotionList,
  type PromotionListSummary,
  PROMOTIONS_EVENTS,
  PromotionSettings,
  type RuleTestInput,
  type PromotionsExecutedEvent,
} from '@forga/promotions-contracts';
import { ExclusionEntity, PromotionListEntity } from '../promotions.entities.js';

export const READ = 'promotions.read';
export const PROPOSE = 'promotions.propose';
export const DECIDE = 'promotions.decide';
export const EXCLUDE = 'promotions.exclude';

const germanDate = (value: string) => value.split('-').toReversed().join('.');
const level = (attributes: Record<string, unknown>) => (typeof attributes['level'] === 'number' ? attributes['level'] : 0);

export function careerFacts(career: PersonCareer): CareerFacts {
  const last = career.ranks.at(-1);
  const qualifications = new Map<string, string>();
  for (const q of career.qualifications) {
    const known = qualifications.get(q.qualification);
    if (!known || q.acquiredOn < known) qualifications.set(q.qualification, q.acquiredOn);
  }
  return {
    rank: last?.rank ?? (career.status === 'probation' ? 'probation' : null),
    rankSince: last?.since ?? career.joinedOn,
    joinedOn: career.joinedOn,
    probationEndsOn: career.probationEndsOn,
    musician: career.musician,
    qualifications,
    offices: career.offices,
    restPeriods: career.restPeriods,
  };
}

export const toListDto = (l: PromotionListEntity): PromotionList => ({
  id: l.id,
  title: l.title,
  referenceDate: l.referenceDate,
  effectiveDate: l.effectiveDate,
  status: l.status,
  entries: l.entries,
  excluded: [],
  decidedOn: l.decidedOn ?? null,
  decidedBy: l.decidedBy ?? null,
  executedAt: l.executedAt?.toISOString() ?? null,
  notes: l.notes,
  version: l.version,
});

/** Promotion candidates, lists, exclusions and certificates. */
@Injectable()
export class PromotionsService {
  constructor(
    private readonly em: EntityManager,
    private readonly settings: SettingsService,
    private readonly events: DomainEvents,
    private readonly audit: Audit,
    @Inject(PERSON_DIRECTORY) private readonly persons: PersonDirectory,
    @Inject(ORGANIZATION) private readonly organization: Organization,
  ) {}

  async config(): Promise<PromotionSettings> {
    return PromotionSettings.parse((await this.settings.get('promotions.general')) ?? {});
  }

  /** Rank keys from lowest to highest (catalog level, then order). */
  async rankOrder(): Promise<string[]> {
    const ranks = await this.organization.catalog('rank');
    return ranks.toSorted((a, b) => level(a.attributes) - level(b.attributes) || a.sortOrder - b.sortOrder).map((r) => r.key);
  }

  /** Persons visible with the permission: brigade-wide or in the granted departments. */
  private visible(user: AuthenticatedUser, permission: string) {
    return (departmentIds: readonly string[]) => {
      const grant = user.grant(permission);
      return grant === 'brigade' || (grant !== null && departmentIds.some((d) => grant.includes(d)));
    };
  }

  private async activeExclusions(on: string): Promise<Map<string, ExclusionEntity[]>> {
    const list = await this.em.fork().find(ExclusionEntity, {
      from: { $lte: on },
      $or: [{ until: null }, { until: { $gte: on } }],
    });
    const byPerson = new Map<string, ExclusionEntity[]>();
    for (const e of list) byPerson.set(e.personId, [...(byPerson.get(e.personId) ?? []), e]);
    return byPerson;
  }

  /** Inhabitants of the district of a department if set, else of the municipality (population condition with `scope: 'department'`). */
  private async population(brigade: BrigadeSettings | null): Promise<(departmentId: string | null) => number | null> {
    const departments = new Map((await this.organization.departments()).map((d) => [d.id, d.population]));
    return (departmentId) => (departmentId ? departments.get(departmentId) : null) ?? brigade?.population ?? null;
  }

  /** The next possible promotion of each eligible person on the date. */
  async candidates(user: AuthenticatedUser, on: string, ids?: readonly string[]): Promise<Candidate[]> {
    const [config, order, brigade, careers, exclusions] = await Promise.all([
      this.config(),
      this.rankOrder(),
      this.settings.get<BrigadeSettings>('brigade'),
      this.persons.careers(ids),
      this.activeExclusions(on),
    ]);
    const until = addYears(on, config.previewMonths / 12);
    const population = await this.population(brigade);
    const visible = this.visible(user, READ);
    const seesExclusions = user.can(EXCLUDE);
    return careers
      .filter((c) => (config.eligibleStatuses as string[]).includes(c.status) && visible(c.departmentIds))
      .map((career) => {
        const facts = careerFacts(career);
        const evaluation = evaluatePerson(facts, config.rules, { population: brigade?.population ?? null, departmentPopulation: population(career.primaryDepartmentId) }, on, until, order);
        // An exclusion for one rank applies only when that is the next promotion.
        const exclusion = (exclusions.get(career.id) ?? []).find((e) => !e.targetRank || e.targetRank === evaluation?.rule.rank);
        return {
          personId: career.id,
          firstName: career.firstName,
          lastName: career.lastName,
          departmentId: career.primaryDepartmentId,
          rank: facts.rank,
          rankSince: facts.rankSince,
          targetRank: evaluation?.rule.rank ?? null,
          ruleKey: evaluation?.rule.key ?? null,
          state: exclusion ? 'excluded' : (evaluation?.state ?? 'missing'),
          ruleState: evaluation?.state ?? 'missing',
          metOn: evaluation?.metOn ?? null,
          missing: evaluation?.missing ?? [],
          explanation: evaluation?.explanation ?? null,
          exclusion: exclusion && seesExclusions ? this.toExclusion(exclusion, career) : null,
        } satisfies Candidate;
      })
      .toSorted((a, b) => a.lastName.localeCompare(b.lastName, 'de') || a.firstName.localeCompare(b.firstName, 'de'));
  }

  // ---- lists ----

  /** Lists with the counts of the entries the user may see (as in `list`). */
  async lists(user: AuthenticatedUser): Promise<PromotionListSummary[]> {
    const lists = await this.em.fork().find(PromotionListEntity, {}, { orderBy: { referenceDate: 'desc', createdAt: 'desc' } });
    return lists.map((l) => {
      const entries = this.visibleEntries(user, l.entries);
      return {
        id: l.id,
        title: l.title,
        referenceDate: l.referenceDate,
        effectiveDate: l.effectiveDate,
        status: l.status,
        promote: entries.filter((e) => e.decision === 'promote').length,
        total: entries.length,
      };
    });
  }

  /** Entries of the departments the user may read (all with the brigade-wide permission). */
  private visibleEntries(user: AuthenticatedUser, entries: ListEntry[]): ListEntry[] {
    return user.grant(READ) === 'brigade' ? entries : entries.filter((e) => user.can(READ, e.departmentId));
  }

  /** A list with the entries the user may see (department commanders: their departments). */
  async list(user: AuthenticatedUser, id: string): Promise<PromotionList> {
    const list = await this.load(this.em.fork(), id);
    const dto = { ...toListDto(list), excluded: list.status === 'draft' ? await this.excludedOn(user, list.referenceDate) : [] };
    return { ...dto, entries: this.visibleEntries(user, dto.entries) };
  }

  /** Excluded persons the rules would propose on the date (candidates are already limited to visible persons). */
  private async excludedOn(user: AuthenticatedUser, on: string): Promise<ExcludedCandidate[]> {
    return (await this.candidates(user, on))
      .filter((c): c is Candidate & { targetRank: string } => c.state === 'excluded' && c.ruleState !== 'missing' && c.targetRank !== null)
      .map((c) => ({
        personId: c.personId,
        firstName: c.firstName,
        lastName: c.lastName,
        departmentId: c.departmentId,
        rank: c.rank,
        targetRank: c.targetRank,
        exclusion: c.exclusion && { from: c.exclusion.from, until: c.exclusion.until, reason: c.exclusion.reason },
      }));
  }

  private async load(em: EntityManager, id: string): Promise<PromotionListEntity> {
    const list = await em.findOne(PromotionListEntity, id);
    if (!list) throw new NotFoundException();
    return list;
  }

  private async draft(em: EntityManager, id: string, version: number): Promise<PromotionListEntity> {
    const list = await this.load(em, id);
    assertVersion(list, version);
    if (list.status !== 'draft') throw new ConflictException({ code: 'promotions.notDraft' });
    return list;
  }

  /** Entries for the candidates fulfilled or within the preview; excluded persons do not appear. */
  private async evaluateEntries(user: AuthenticatedUser, referenceDate: string, previous: ListEntry[]): Promise<ListEntry[]> {
    const candidates = await this.candidates(user, referenceDate);
    const before = new Map(previous.map((e) => [e.personId, e]));
    const evaluated = candidates
      .filter((c): c is Candidate & { targetRank: string } => (c.state === 'fulfilled' || c.state === 'preview') && c.targetRank !== null)
      .map((c): ListEntry => {
        const old = before.get(c.personId);
        const kept = old && old.targetRank === c.targetRank && old.state !== 'manual';
        return {
          personId: c.personId,
          firstName: c.firstName,
          lastName: c.lastName,
          departmentId: c.departmentId,
          rank: c.rank,
          rankSince: c.rankSince,
          targetRank: c.targetRank,
          ruleKey: c.ruleKey,
          state: c.state,
          metOn: c.metOn,
          missing: c.missing,
          decision: kept ? old.decision : c.state === 'fulfilled' ? 'promote' : 'defer',
          comment: kept ? old.comment : '',
        };
      });
    const manual = previous.filter((e) => e.state === 'manual' && !evaluated.some((x) => x.personId === e.personId));
    return [...evaluated, ...manual].toSorted((a, b) => a.lastName.localeCompare(b.lastName, 'de') || a.firstName.localeCompare(b.firstName, 'de'));
  }

  async create(user: AuthenticatedUser, input: z.infer<typeof ListInput>): Promise<PromotionList> {
    const em = this.em.fork();
    if (input.effectiveDate < input.referenceDate)
      throw new BadRequestException({
        code: 'promotions.effectiveBeforeReference',
      });
    // Lists are created brigade-wide (DECIDE is a brigade permission), so all candidates are included.
    const list = em.create(PromotionListEntity, {
      ...input,
      status: 'draft',
      entries: await this.evaluateEntries(user, input.referenceDate, []),
    });
    await em.flush();
    return toListDto(list);
  }

  async update(user: AuthenticatedUser, id: string, input: z.infer<typeof ListInput> & { version: number }): Promise<PromotionList> {
    const em = this.em.fork();
    const list = await this.draft(em, id, input.version);
    if (input.effectiveDate < input.referenceDate)
      throw new BadRequestException({
        code: 'promotions.effectiveBeforeReference',
      });
    const changedDate = list.referenceDate !== input.referenceDate;
    em.assign(list, {
      title: input.title,
      referenceDate: input.referenceDate,
      effectiveDate: input.effectiveDate,
      notes: input.notes,
    });
    if (changedDate) list.entries = await this.evaluateEntries(user, input.referenceDate, list.entries);
    await em.flush();
    return toListDto(list);
  }

  /** Re-evaluates a draft list, e.g. after new course results; decisions and comments are kept. */
  async refresh(user: AuthenticatedUser, id: string, version: number): Promise<PromotionList> {
    const em = this.em.fork();
    const list = await this.draft(em, id, version);
    list.entries = await this.evaluateEntries(user, list.referenceDate, list.entries);
    await em.flush();
    return toListDto(list);
  }

  async remove(id: string): Promise<void> {
    const em = this.em.fork();
    const list = await this.load(em, id);
    if (list.status === 'executed') throw new ConflictException({ code: 'promotions.executed' });
    em.remove(list);
    await em.flush();
  }

  /** Department commanders propose for their departments; the commander for all. */
  async updateEntry(user: AuthenticatedUser, id: string, personId: string, input: z.infer<typeof EntryUpdate>): Promise<PromotionList> {
    const em = this.em.fork();
    const list = await this.draft(em, id, input.version);
    const entry = list.entries.find((e) => e.personId === personId);
    if (!entry) throw new NotFoundException();
    if (!user.can(DECIDE) && !user.can(PROPOSE, entry.departmentId)) throw new ForbiddenException();
    if (input.decision === 'reject' && !input.comment.trim()) throw new BadRequestException({ code: 'promotions.reasonRequired' });
    list.entries = list.entries.map((e) => (e.personId === personId ? { ...e, decision: input.decision, comment: input.comment } : e));
    await em.flush();
    return this.list(user, id);
  }

  /** A promotion outside the rules, with reason. */
  async addManual(user: AuthenticatedUser, id: string, input: z.infer<typeof ManualEntryInput>): Promise<PromotionList> {
    const em = this.em.fork();
    const list = await this.draft(em, id, input.version);
    if (list.entries.some((e) => e.personId === input.personId)) throw new ConflictException({ code: 'promotions.alreadyListed' });
    const [career] = await this.persons.careers([input.personId]);
    if (!career) throw new NotFoundException();
    const order = await this.rankOrder();
    const facts = careerFacts(career);
    if (!order.includes(input.targetRank) || order.indexOf(input.targetRank) <= order.indexOf(facts.rank ?? '')) throw new BadRequestException({ code: 'promotions.rankNotHigher' });
    const entry: ListEntry = {
      personId: career.id,
      firstName: career.firstName,
      lastName: career.lastName,
      departmentId: career.primaryDepartmentId,
      rank: facts.rank,
      rankSince: facts.rankSince,
      targetRank: input.targetRank,
      ruleKey: null,
      state: 'manual',
      metOn: null,
      missing: [],
      decision: 'promote',
      comment: input.comment,
    };
    list.entries = [...list.entries, entry].toSorted((a, b) => a.lastName.localeCompare(b.lastName, 'de') || a.firstName.localeCompare(b.firstName, 'de'));
    await em.flush();
    return toListDto(list);
  }

  async removeManual(id: string, personId: string, version: number): Promise<PromotionList> {
    const em = this.em.fork();
    const list = await this.draft(em, id, version);
    if (!list.entries.some((e) => e.personId === personId && e.state === 'manual')) throw new NotFoundException();
    list.entries = list.entries.filter((e) => e.personId !== personId);
    await em.flush();
    return toListDto(list);
  }

  /** Records the decision (after hearing the committee); the list is then fixed. */
  async decide(user: AuthenticatedUser, id: string, input: z.infer<typeof DecideInput>): Promise<PromotionList> {
    const em = this.em.fork();
    const list = await this.draft(em, id, input.version);
    if (!list.entries.some((e) => e.decision === 'promote')) throw new BadRequestException({ code: 'promotions.nothingToPromote' });
    em.assign(list, {
      status: 'decided',
      decidedOn: input.decidedOn,
      decidedBy: user.displayName,
      notes: input.notes || list.notes,
    });
    await em.flush();
    await this.audit.log('promotions.list-decided', {
      listId: list.id,
      title: list.title,
      decidedOn: input.decidedOn,
      promote: list.entries.filter((e) => e.decision === 'promote').map((e) => ({ personId: e.personId, rank: e.targetRank })),
    });
    return toListDto(list);
  }

  async reopen(id: string, version: number): Promise<PromotionList> {
    const em = this.em.fork();
    const list = await this.load(em, id);
    assertVersion(list, version);
    if (list.status !== 'decided') throw new ConflictException({ code: 'promotions.notDecided' });
    em.assign(list, { status: 'draft', decidedOn: null, decidedBy: null });
    await em.flush();
    return toListDto(list);
  }

  /**
   * Enters the promotions in the person files on the effective date. Refused if a person's rank changed since
   * the list was evaluated (then refresh the list).
   */
  async execute(id: string, version: number): Promise<PromotionList> {
    const em = this.em.fork();
    const list = await this.load(em, id);
    assertVersion(list, version);
    if (list.status !== 'decided') throw new ConflictException({ code: 'promotions.notDecided' });
    const promoted = list.entries.filter((e) => e.decision === 'promote');
    const careers = new Map((await this.persons.careers(promoted.map((e) => e.personId))).map((c) => [c.id, c]));
    const changed = promoted.filter((e) => {
      const career = careers.get(e.personId);
      return !career || careerFacts(career).rank !== e.rank;
    });
    if (changed.length)
      throw new ConflictException({
        code: 'promotions.rankChanged',
        names: changed.map((e) => `${e.firstName} ${e.lastName}`).join(', '),
      });
    em.assign(list, { status: 'executed', executedAt: new Date() });
    await em.flush();
    for (const e of promoted)
      await this.persons.recordPromotion(e.personId, {
        rank: e.targetRank,
        since: list.effectiveDate,
        notes: list.title,
      });
    await this.audit.log('promotions.list-executed', {
      listId: list.id,
      title: list.title,
      effectiveDate: list.effectiveDate,
      promotions: promoted.map((e) => ({ personId: e.personId, rank: e.targetRank })),
    });
    await this.events.publish<PromotionsExecutedEvent>(PROMOTIONS_EVENTS.executed, {
      listId: list.id,
      effectiveDate: list.effectiveDate,
      promotions: promoted.map((e) => ({
        personId: e.personId,
        rank: e.targetRank,
      })),
    });
    return toListDto(list);
  }

  /** Certificates of the promoted persons; only for decided or executed lists. */
  async certificates(id: string, personId?: string): Promise<{ title: string; data: Buffer }> {
    const em = this.em.fork();
    const list = await this.load(em, id);
    if (list.status === 'draft') throw new ConflictException({ code: 'promotions.notDecided' });
    const entries = list.entries.filter((e) => e.decision === 'promote' && (!personId || e.personId === personId));
    if (!entries.length) throw new NotFoundException();
    const [config, brigade, ranks] = await Promise.all([this.config(), this.settings.get<BrigadeSettings>('brigade'), this.organization.catalog('rank')]);
    const rankName = (key: string) => ranks.find((r) => r.key === key)?.name.de ?? key;
    const placeAndDate = `${config.certificatePlace || brigade?.city || ''}, den ${germanDate(list.decidedOn ?? berlinDate())}`.replace(/^, /, '');
    const certificates: Certificate[] = entries.map((e) => ({
      heading: 'Urkunde',
      name: `${e.firstName} ${e.lastName}`,
      text: config.certificateText.replaceAll('{date}', germanDate(list.effectiveDate)).replaceAll('{rank}', rankName(e.targetRank)).replaceAll('{name}', `${e.firstName} ${e.lastName}`),
      placeAndDate,
      signer: config.certificateSigner,
    }));
    return {
      title: list.title,
      data: await renderCertificatesPdf({
        brigade,
        logo: await brigadeLogoDataUrl(em),
        title: `Urkunden ${list.title}`,
        certificates,
      }),
    };
  }

  // ---- person tab ----

  /** Evaluates a rule as edited (not saved) for one person on a date, with the same facts as the candidates. */
  async testRule(user: AuthenticatedUser, input: z.infer<typeof RuleTestInput>): Promise<Evaluation> {
    const [career] = await this.persons.careers([input.personId]);
    if (!career || !this.visible(user, READ)(career.departmentIds)) throw new NotFoundException();
    const [config, brigade] = await Promise.all([this.config(), this.settings.get<BrigadeSettings>('brigade')]);
    const on = input.on ?? berlinDate();
    const population = await this.population(brigade);
    return evaluateRule(input.rule, careerFacts(career), { population: brigade?.population ?? null, departmentPopulation: population(career.primaryDepartmentId) }, on, addYears(on, config.previewMonths / 12));
  }

  async person(user: AuthenticatedUser, personId: string): Promise<PersonPromotion> {
    const [career] = await this.persons.careers([personId]);
    if (!career) throw new NotFoundException();
    if (!this.visible(user, READ)(career.departmentIds)) throw new ForbiddenException();
    const facts = careerFacts(career);
    const eligible = (await this.config()).eligibleStatuses as string[];
    const [next] = eligible.includes(career.status) ? await this.candidates(user, berlinDate(), [personId]) : [];
    // Few lists per year: filtering in memory is simpler than a JSON query.
    const lists = await this.em.fork().find(PromotionListEntity, {}, { orderBy: { referenceDate: 'desc' } });
    return {
      rank: facts.rank,
      rankSince: facts.rankSince,
      next: next ?? null,
      lists: lists.flatMap((l) => {
        const e = l.entries.find((x) => x.personId === personId);
        return e
          ? [
              {
                id: l.id,
                title: l.title,
                status: l.status,
                targetRank: e.targetRank,
                decision: e.decision,
              },
            ]
          : [];
      }),
    };
  }

  // ---- exclusions ----

  private toExclusion(e: ExclusionEntity, person: { firstName: string; lastName: string } | undefined): Exclusion {
    return {
      id: e.id,
      personId: e.personId,
      firstName: person?.firstName ?? '',
      lastName: person?.lastName ?? '',
      from: e.from,
      until: e.until ?? null,
      targetRank: e.targetRank ?? null,
      reason: e.reason,
      createdBy: e.createdBy,
      version: e.version,
    };
  }

  async exclusions(): Promise<Exclusion[]> {
    const list = await this.em.fork().find(ExclusionEntity, {}, { orderBy: { from: 'desc' } });
    const persons = new Map((await this.persons.summaries([...new Set(list.map((e) => e.personId))])).map((p) => [p.id, p]));
    return list.map((e) => this.toExclusion(e, persons.get(e.personId)));
  }

  async createExclusion(user: AuthenticatedUser, input: z.infer<typeof ExclusionInput>): Promise<Exclusion> {
    if (input.until && input.until < input.from) throw new BadRequestException({ code: 'promotions.untilBeforeFrom' });
    const [person] = await this.persons.summaries([input.personId]);
    if (!person) throw new NotFoundException();
    const em = this.em.fork();
    const exclusion = em.create(ExclusionEntity, {
      ...input,
      createdBy: user.displayName,
    });
    await em.flush();
    return this.toExclusion(exclusion, person);
  }

  async updateExclusion(id: string, input: z.infer<typeof ExclusionInput> & { version: number }): Promise<Exclusion> {
    if (input.until && input.until < input.from) throw new BadRequestException({ code: 'promotions.untilBeforeFrom' });
    const em = this.em.fork();
    const exclusion = await em.findOne(ExclusionEntity, id);
    if (!exclusion) throw new NotFoundException();
    assertVersion(exclusion, input.version);
    em.assign(exclusion, {
      from: input.from,
      until: input.until,
      targetRank: input.targetRank,
      reason: input.reason,
    });
    await em.flush();
    const [person] = await this.persons.summaries([exclusion.personId]);
    return this.toExclusion(exclusion, person);
  }

  async removeExclusion(id: string): Promise<void> {
    const em = this.em.fork();
    const exclusion = await em.findOne(ExclusionEntity, id);
    if (!exclusion) throw new NotFoundException();
    em.remove(exclusion);
    await em.flush();
  }
}
