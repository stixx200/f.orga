import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, type OnApplicationBootstrap, type OnModuleDestroy, type OnModuleInit, Optional } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { type AuthenticatedUser, berlinDate, DomainEvents, Notifications, SettingsService } from '@forga/core-api';
import { INCIDENTS_EVENTS, INCIDENTS_LOOKUP, type IncidentsLookup, type ReportReleasedEvent, type ReportUnlockedEvent } from '@forga/incidents-contracts';
import { PERSON_DIRECTORY, type PersonDirectory, type PersonSnapshot } from '@forga/masterdata-contracts';
import {
  type BreathingDevice,
  type Evidence,
  EvidenceInput,
  type EvidenceKind,
  addMonths,
  evaluateFitness,
  examinationMonths,
  type FitnessEvidence,
  type FitnessLookup,
  type FitnessColor,
  FitnessRule,
  type FitnessStatus,
  minimumKilojoules,
  type PersonRespiratoryProtection,
  QUALIFICATION_BREATHING_APPARATUS,
  QuickEntryInput,
  RESPIRATORY_PROTECTION_EVENTS,
  type StatusChangedEvent,
} from '@forga/respiratory-protection-contracts';
import { type RecordKind, type SessionClosedEvent, type SessionReopenedEvent, TRAINING_EVENTS } from '@forga/training-contracts';
import { EvidenceEntity, StatusEntity } from '../respiratory-protection.entities.js';
import { nextRefresh } from './schedule.js';

export const READ = 'respiratory-protection.read';
export const EVIDENCE = 'respiratory-protection.evidence';
export const EXAMINATIONS = 'respiratory-protection.examinations';
export const SELF = 'respiratory-protection.self';
export const NOTIFY = 'respiratory-protection.notify';

type ParsedEvidence = ReturnType<typeof EvidenceInput.parse>;
type ParsedQuickEntry = ReturnType<typeof QuickEntryInput.parse>;

/** The daily check of the traffic lights runs once shortly after the start, then daily (`nextRefresh`). */
const STARTUP_DELAY_MS = 60_000;

/** Work and duration of the Atemschutzstrecke from the rule; other kinds have no fixed values. */
export const trackValues = (kind: EvidenceKind, rule: FitnessRule) =>
  kind === 'training-track' ? { kilojoules: rule.trackKilojoules, minutes: rule.trackMinutes } : { kilojoules: null, minutes: null };
/** Evidence kinds of the training module mapped to ours. */
const FROM_TRAINING: Record<RecordKind, EvidenceKind> = {
  'stress-exercise': 'stress-exercise',
  'training-track': 'training-track',
  briefing: 'briefing',
  'exercise-under-ba': 'exercise',
  'chemical-suit-exercise': 'chemical-suit',
};

export const toEvidenceDto = (e: EvidenceEntity): Evidence => ({
  id: e.id,
  personId: e.personId,
  kind: e.kind,
  date: e.date,
  validUntil: e.validUntil ?? null,
  result: e.result ?? null,
  examiner: e.examiner,
  restrictions: e.restrictions,
  examinationGroup: e.examinationGroup ?? null,
  device: e.device ?? null,
  facility: e.facility,
  kilojoules: e.kilojoules ?? null,
  passed: e.passed ?? null,
  minutes: e.minutes ?? null,
  note: e.note,
  source: e.source,
  sourceId: e.sourceId ?? null,
  withdrawn: e.withdrawn,
  version: e.version,
});


/** Without the examinations permission: an examination with concerns only shows as not met. */
function redact(status: FitnessStatus): FitnessStatus {
  return { ...status, conditions: status.conditions.map((c) => (c.concerns ? { key: c.key, met: false, lastDate: null, dueOn: null } : c)) };
}

/**
 * Evidence of breathing apparatus wearers and their fitness. Evidence comes from closed training sessions,
 * released incident reports and manual entries; the traffic light is evaluated on the fly.
 */
@Injectable()
export class EvidenceService implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy, FitnessLookup {
  private readonly logger = new Logger(EvidenceService.name);
  private timer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly em: EntityManager,
    private readonly settings: SettingsService,
    private readonly events: DomainEvents,
    private readonly notifications: Notifications,
    @Inject(PERSON_DIRECTORY) private readonly directory: PersonDirectory,
    @Optional() @Inject(INCIDENTS_LOOKUP) private readonly incidents?: IncidentsLookup,
  ) {}

  onModuleInit(): void {
    this.events.subscribe<SessionClosedEvent>(TRAINING_EVENTS.sessionClosed, (e) => this.fromTraining(e));
    this.events.subscribe<SessionReopenedEvent>(TRAINING_EVENTS.sessionReopened, (e) => this.replace('training', e.sessionId, []));
    this.events.subscribe<ReportReleasedEvent>(INCIDENTS_EVENTS.reportReleased, (e) => this.fromIncident(e));
    this.events.subscribe<ReportUnlockedEvent>(INCIDENTS_EVENTS.reportUnlocked, (e) => this.withdraw('incidents', e.reportId));
  }

  /**
   * Evidence expires without any change, so the traffic lights are checked shortly after the start and then every
   * day at `REFRESH_HOUR` (Europe/Berlin); off with `FORGA_STATUS_SCHEDULER=off`.
   */
  onApplicationBootstrap(): void {
    if (process.env.FORGA_STATUS_SCHEDULER === 'off') return;
    this.schedule(STARTUP_DELAY_MS);
  }

  onModuleDestroy(): void {
    clearTimeout(this.timer);
  }

  private schedule(delay: number): void {
    this.timer = setTimeout(() => {
      this.refresh()
        .catch((error: unknown) => this.logger.error('Checking the traffic lights failed', error instanceof Error ? error.stack : String(error)))
        .finally(() => this.schedule(nextRefresh(new Date()).getTime() - Date.now()));
    }, delay);
    this.timer.unref();
  }

  async rule(): Promise<FitnessRule> {
    return FitnessRule.parse((await this.settings.get('respiratory-protection.rule')) ?? {});
  }

  /** True if the user has the permission in one of the person's departments (persons without department: brigade-wide only). */
  can(user: AuthenticatedUser, permission: string, person: Pick<PersonSnapshot, 'departmentIds'>): boolean {
    return person.departmentIds.length ? person.departmentIds.some((d) => user.can(permission, d)) : user.grant(permission) === 'brigade';
  }

  private async person(personId: string): Promise<PersonSnapshot> {
    const [person] = await this.directory.snapshots([personId]);
    if (!person) throw new NotFoundException();
    return person;
  }

  /** Breathing apparatus wearers (members with the qualification) the user may see. */
  async wearers(user: AuthenticatedUser | null, departmentId?: string): Promise<PersonSnapshot[]> {
    const members = await this.directory.membersOn(berlinDate());
    return members.filter(
      (p) =>
        p.status !== 'left' &&
        p.qualifications.includes(QUALIFICATION_BREATHING_APPARATUS) &&
        (!departmentId || p.departmentIds.includes(departmentId)) &&
        (!user || this.can(user, READ, p)),
    );
  }

  async statuses(persons: PersonSnapshot[], today = berlinDate()): Promise<FitnessStatus[]> {
    if (!persons.length) return [];
    const rule = await this.rule();
    const evidence = await this.em.fork().find(EvidenceEntity, { personId: { $in: persons.map((p) => p.id) } });
    const byPerson = new Map<string, FitnessEvidence[]>();
    for (const e of evidence) {
      const item = { kind: e.kind, date: e.date, validUntil: e.validUntil ?? null, kilojoules: e.kilojoules ?? null, passed: e.passed ?? null, withdrawn: e.withdrawn, examinationGroup: e.examinationGroup ?? null, result: e.result ?? null };
      byPerson.set(e.personId, [...(byPerson.get(e.personId) ?? []), item]);
    }
    return persons.map((p) => ({
      personId: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      departmentIds: p.departmentIds,
      ...evaluateFitness(p, byPerson.get(p.id) ?? [], rule, today),
      minimumKilojoules: minimumKilojoules(rule, p.birthDate, today),
    }));
  }

  /**
   * Statuses as the user may see them: without the examinations permission for the person, an examination with
   * "concerns" only shows as not met (no date, no reason).
   */
  async visibleStatuses(user: AuthenticatedUser, persons: PersonSnapshot[]): Promise<FitnessStatus[]> {
    const examinations = new Set(persons.filter((p) => this.can(user, EXAMINATIONS, p)).map((p) => p.id));
    return (await this.statuses(persons)).map((s) => (examinations.has(s.personId) ? s : redact(s)));
  }

  /** Traffic lights on a date (e.g. the alarm time of an incident). */
  async colors(personIds: readonly string[], date: string): Promise<Map<string, FitnessColor>> {
    const persons = await this.directory.snapshots([...new Set(personIds)], date);
    return new Map((await this.statuses(persons, date)).map((s) => [s.personId, s.color]));
  }

  /** "My area": the own status and all own records, examinations included (own data). */
  async ownView(user: AuthenticatedUser): Promise<PersonRespiratoryProtection> {
    if (!user.personId) throw new NotFoundException({ code: 'respiratory-protection.noPerson' });
    const person = await this.person(user.personId);
    const [status] = await this.statuses([person]);
    const rows = await this.em.fork().find(EvidenceEntity, { personId: person.id }, { orderBy: { date: 'desc' } });
    return { status, evidence: rows.map(toEvidenceDto) };
  }

  async personView(user: AuthenticatedUser, personId: string): Promise<PersonRespiratoryProtection> {
    const person = await this.person(personId);
    if (!this.can(user, READ, person)) throw new NotFoundException();
    const [status] = await this.visibleStatuses(user, [person]);
    const rows = await this.em.fork().find(EvidenceEntity, { personId }, { orderBy: { date: 'desc' } });
    const examinations = this.can(user, EXAMINATIONS, person);
    return { status, evidence: rows.filter((e) => e.kind !== 'examination' || examinations).map(toEvidenceDto) };
  }

  private async requireWrite(user: AuthenticatedUser, personId: string, kind: EvidenceKind): Promise<void> {
    const permission = kind === 'examination' ? EXAMINATIONS : EVIDENCE;
    if (!this.can(user, permission, await this.person(personId))) throw new ForbiddenException({ code: 'auth.forbidden', permissions: [permission] });
  }

  /**
   * Plausibility of manual evidence: an examination needs a result, "valid until" after the date and at most the interval
   * of the rule (required for "no concerns for a limited time"); a passed stress exercise needs the minimum work at the
   * age on its date.
   */
  private async check(input: ParsedEvidence, rule: FitnessRule): Promise<void> {
    const person = await this.person(input.personId);
    if (input.kind === 'examination') {
      if (!input.result) throw new BadRequestException({ code: 'respiratory-protection.resultRequired' });
      if (input.result === 'no-concerns-limited' && !input.validUntil) throw new BadRequestException({ code: 'respiratory-protection.validUntilRequired' });
      if (input.validUntil) {
        if (input.validUntil <= input.date) throw new BadRequestException({ code: 'respiratory-protection.validUntilNotAfterDate' });
        const max = addMonths(input.date, examinationMonths(rule, person.birthDate, input.date, input.examinationGroup));
        if (input.validUntil > max) throw new BadRequestException({ code: 'respiratory-protection.validUntilTooLate', max });
      }
    }
    if (input.kind === 'stress-exercise') this.checkKilojoules(rule, person, input.date, input.kilojoules, input.passed);
  }

  private checkKilojoules(rule: FitnessRule, person: PersonSnapshot, date: string, kilojoules: number | null, passed: boolean | null): void {
    const minimum = minimumKilojoules(rule, person.birthDate, date);
    if (passed && kilojoules !== null && kilojoules < minimum) throw new BadRequestException({ code: 'respiratory-protection.belowMinimum', minimum, name: `${person.firstName} ${person.lastName}` });
  }

  async create(user: AuthenticatedUser, input: ParsedEvidence): Promise<Evidence> {
    await this.requireWrite(user, input.personId, input.kind);
    const rule = await this.rule();
    await this.check(input, rule);
    const em = this.em.fork();
    const evidence = em.create(EvidenceEntity, { ...this.fields(input, rule), personId: input.personId, kind: input.kind, source: 'manual', sourceId: null, withdrawn: false });
    await em.flush();
    await this.refresh([input.personId]);
    return toEvidenceDto(evidence);
  }

  async quickEntry(user: AuthenticatedUser, input: ParsedQuickEntry): Promise<Evidence[]> {
    for (const entry of input.entries) await this.requireWrite(user, entry.personId, input.kind);
    const rule = await this.rule();
    if (input.kind === 'stress-exercise') {
      const persons = new Map((await this.directory.snapshots(input.entries.map((e) => e.personId))).map((p) => [p.id, p]));
      for (const entry of input.entries) this.checkKilojoules(rule, persons.get(entry.personId)!, input.date, entry.kilojoules, entry.passed);
    }
    const em = this.em.fork();
    const track = trackValues(input.kind, rule);
    const created = input.entries.map((entry) =>
      em.create(EvidenceEntity, {
        personId: entry.personId,
        kind: input.kind,
        date: input.date,
        facility: input.facility,
        kilojoules: entry.kilojoules ?? track.kilojoules,
        passed: entry.passed,
        minutes: entry.minutes ?? track.minutes,
        source: 'manual',
        sourceId: null,
        withdrawn: false,
      }),
    );
    await em.flush();
    await this.refresh(input.entries.map((e) => e.personId));
    return created.map(toEvidenceDto);
  }

  private async loadManual(em: EntityManager, user: AuthenticatedUser, id: string): Promise<EvidenceEntity> {
    const evidence = await em.findOne(EvidenceEntity, id);
    if (!evidence) throw new NotFoundException();
    await this.requireWrite(user, evidence.personId, evidence.kind);
    if (evidence.source === 'training' || evidence.source === 'incidents') throw new BadRequestException({ code: 'respiratory-protection.fromOtherModule', source: evidence.source });
    return evidence;
  }

  async update(user: AuthenticatedUser, id: string, input: ParsedEvidence): Promise<Evidence> {
    const em = this.em.fork();
    const evidence = await this.loadManual(em, user, id);
    if (input.personId !== evidence.personId || input.kind !== evidence.kind) throw new BadRequestException({ code: 'respiratory-protection.kindFixed' });
    const rule = await this.rule();
    // Imported examinations may lack a result; it is required as soon as they are changed here.
    await this.check(input, rule);
    Object.assign(evidence, this.fields(input, rule));
    await em.flush();
    await this.refresh([evidence.personId]);
    return toEvidenceDto(evidence);
  }

  async remove(user: AuthenticatedUser, id: string): Promise<void> {
    const em = this.em.fork();
    const evidence = await this.loadManual(em, user, id);
    await em.remove(evidence).flush();
    await this.refresh([evidence.personId]);
  }

  private fields(input: ParsedEvidence, rule: FitnessRule) {
    const examination = input.kind === 'examination';
    const measured = input.kind === 'stress-exercise' || input.kind === 'training-track';
    const track = trackValues(input.kind, rule);
    return {
      date: input.date,
      validUntil: examination ? input.validUntil : null,
      result: examination ? input.result : null,
      examiner: examination ? input.examiner : '',
      restrictions: examination ? input.restrictions : '',
      examinationGroup: examination ? input.examinationGroup : null,
      device: examination ? null : input.device,
      facility: input.facility,
      kilojoules: measured ? (input.kilojoules ?? track.kilojoules) : null,
      passed: measured ? input.passed : null,
      minutes: input.minutes ?? track.minutes,
      note: input.note,
    };
  }

  /** Records of a closed session; closing again replaces them. */
  async fromTraining(event: SessionClosedEvent): Promise<void> {
    const minutes = new Map(event.attendances.map((a) => [a.personId, a.minutes]));
    const rule = await this.rule();
    await this.replace(
      'training',
      event.sessionId,
      event.records.map((r) => {
        const kind = FROM_TRAINING[r.kind];
        const track = trackValues(kind, rule);
        return { personId: r.personId, kind, date: r.date, kilojoules: r.kilojoules ?? track.kilojoules, passed: r.passed, minutes: track.minutes ?? minutes.get(r.personId) ?? null, note: event.title };
      }),
    );
  }

  /**
   * Real incidents under breathing apparatus of a released report, with keyword, location and dispatch number for the
   * record (FwDV 7); releasing again replaces them. The report stays linked as source.
   */
  async fromIncident(event: ReportReleasedEvent): Promise<void> {
    const date = berlinDate(new Date(event.alarmedAt));
    const [report] = this.incidents ? await this.incidents.reports([event.reportId]) : [];
    const note = [event.alarmKeyword, report?.location, event.dispatchNumber ? `Nr. ${event.dispatchNumber}` : ''].filter(Boolean).join(' · ');
    await this.replace(
      'incidents',
      event.reportId,
      event.personnel
        .filter((p) => p.breathingApparatus)
        .flatMap((p) => [
          { personId: p.personId, kind: 'incident' as const, date, kilojoules: null, passed: null, minutes: p.breathingMinutes, note, device: p.breathingDevice },
          // A chemical suit operation also counts as the yearly chemical suit evidence.
          ...(p.chemicalSuit ? [{ personId: p.personId, kind: 'chemical-suit' as const, date, kilojoules: null, passed: null, minutes: p.breathingMinutes, note, device: p.breathingDevice }] : []),
        ]),
    );
  }

  private async replace(
    source: 'training' | 'incidents',
    sourceId: string,
    rows: { personId: string; kind: EvidenceKind; date: string; kilojoules: number | null; passed: boolean | null; minutes: number | null; note: string; device?: BreathingDevice | null }[],
  ): Promise<void> {
    const em = this.em.fork();
    const existing = await em.find(EvidenceEntity, { source, sourceId });
    for (const e of existing) em.remove(e);
    for (const row of rows) em.create(EvidenceEntity, { ...row, source, sourceId, withdrawn: false });
    await em.flush();
    await this.refresh([...new Set([...existing.map((e) => e.personId), ...rows.map((r) => r.personId)])]);
  }

  /** An unlocked report: its evidence no longer counts until it is released again. */
  async withdraw(source: 'incidents', sourceId: string): Promise<void> {
    const em = this.em.fork();
    const rows = await em.find(EvidenceEntity, { source, sourceId });
    for (const e of rows) e.withdrawn = true;
    await em.flush();
    await this.refresh(rows.map((e) => e.personId));
  }

  /**
   * E-mail to those of the primary department who are to be told when a wearer turns red. `false` if there are
   * recipients but no e-mail could be sent (e.g. the mail server is down): it is tried again with the next check.
   */
  private async notifyRed(personId: string): Promise<boolean> {
    const [person] = await this.directory.snapshots([personId]);
    if (!person) return true;
    const name = `${person.firstName} ${person.lastName}`;
    const recipients = await this.notifications.recipients(NOTIFY, person.primaryDepartmentId);
    if (!recipients.length) return true;
    const sent = await this.notifications.notify({
      permission: NOTIFY,
      departmentId: person.primaryDepartmentId,
      action: 'respiratory-protection.red-notified',
      details: { personId: person.id },
      path: `/masterdata/persons/${person.id}?tab=respiratory-protection`,
      compose: (language, recipient) =>
        language === 'de'
          ? { subject: `Atemschutz: ${name} ist nicht mehr einsatzbereit`, text: `Hallo ${recipient},\n\ndie Atemschutztauglichkeit von ${name} ist auf Rot gewechselt. Die fehlenden Nachweise stehen in der Personalakte im Reiter „Atemschutz“.` }
          : { subject: `Respiratory protection: ${name} is no longer fit for duty`, text: `Hello ${recipient},\n\nthe respiratory protection status of ${name} turned red. The missing records are shown in the person file, tab "Respiratory protection".` },
    });
    return sent > 0;
  }

  /**
   * Compares the traffic lights with the last known ones and publishes `respiratory-protection.status.changed`
   * for every change. Without IDs, all wearers are checked.
   *
   * A change from green, yellow or grey to red marks the e-mail as pending together with the new color; it is cleared
   * once the e-mail went out. Pending e-mails of earlier checks (e.g. a restart in between) are sent with the next
   * check, so no change to red is lost. The first status of a person sends nothing (first check after the installation).
   */
  async refresh(personIds?: string[]): Promise<StatusChangedEvent[]> {
    const persons = personIds ? await this.directory.snapshots([...new Set(personIds)]) : await this.wearers(null);
    const statuses = await this.statuses(persons);
    const em = this.em.fork();
    const known = new Map((await em.find(StatusEntity, { personId: { $in: statuses.map((s) => s.personId) } })).map((s) => [s.personId, s]));
    const changes: StatusChangedEvent[] = [];
    for (const status of statuses) {
      const previous = known.get(status.personId);
      if (previous?.color === status.color) continue;
      if (!previous && status.color === 'grey') continue;
      changes.push({ personId: status.personId, previous: previous?.color ?? null, color: status.color });
      if (previous) {
        // Pending until sent, as long as the person stays red.
        previous.notifyPending = status.color === 'red';
        previous.color = status.color;
        previous.changedAt = new Date();
      } else em.create(StatusEntity, { personId: status.personId, color: status.color, changedAt: new Date(), notifyPending: false });
    }
    await em.flush();
    for (const change of changes) await this.events.publish(RESPIRATORY_PROTECTION_EVENTS.statusChanged, change);
    await this.sendPending(personIds);
    return changes;
  }

  /** Sends the pending e-mails about wearers who turned red (of the given persons, or all). */
  private async sendPending(personIds?: string[]): Promise<void> {
    const em = this.em.fork();
    const pending = await em.find(StatusEntity, { notifyPending: true, color: 'red', ...(personIds ? { personId: { $in: [...new Set(personIds)] } } : {}) });
    for (const status of pending) {
      if (!(await this.notifyRed(status.personId))) continue;
      status.notifyPending = false;
      await em.flush();
    }
  }
}
