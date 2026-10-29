import { BadRequestException, Injectable, Logger, NotFoundException, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { v7 as uuidv7 } from 'uuid';
import {
  type PrivacySettings,
  type RetentionCase,
  type RetentionCategory,
  RetentionDecision,
  type RetentionDeferral,
  type RetentionExecutionResult,
  type RetentionFinalAction,
  RetentionOffer,
  type RetentionResult,
  RetentionRule,
  retentionRuleKey,
} from '@forga/core-contracts';
import { Audit } from '../audit/audit.js';
import { IMPORT_EXPIRY_MS, ImportUploadEntity } from '../imports/imports.js';
import { berlinDate } from '../imports/parse.js';
import { SettingsService } from '../settings/settings.js';
import { RetentionCaseEntity } from './retention-case.entity.js';
import { type RetentionCandidate, type RetentionCategoryDefinition, type RetentionQuery, type RetentionRecordRef, RetentionRegistry } from './retention-registry.js';

const DAY_MS = 24 * 60 * 60_000;
const NONE: RetentionRule = RetentionRule.parse({});
/** Statuses of a case that is still being worked on; a record has at most one such case. */
const OPEN = ['due', 'offered', 'accepted', 'destroyed', 'deferred'] as const;
/** Records per call of a module, so a large backlog does not load everything at once. */
const CHUNK = 200;

const chunks = <T>(items: readonly T[], size = CHUNK): T[][] => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

/** `date` (`YYYY-MM-DD`) plus whole years; 29 February becomes 28 February in other years. */
export function addYears(date: string, years: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const target = new Date(Date.UTC(y + years, m - 1, d));
  if (target.getUTCMonth() !== m - 1) target.setUTCDate(0);
  return target.toISOString().slice(0, 10);
}

const active = (r: RetentionRule) => r.action !== 'none' && r.years !== null;
const deletes = (r: RetentionRule) => r.action === 'delete' || (r.action === 'offer-archive' && r.afterDecision === 'delete');

/** One row of the settings page that acts: a category or subtype with a period and an action. */
interface PlannedRule {
  definition: RetentionCategoryDefinition;
  ruleKey: string;
  rule: RetentionRule;
  years: number;
  query: RetentionQuery;
}

export const toCaseDto = (c: RetentionCaseEntity): RetentionCase => ({
  id: c.id,
  category: c.category,
  ruleKey: c.ruleKey,
  recordId: c.recordId,
  label: c.label,
  reason: c.reason ?? null,
  eventDate: c.eventDate,
  dueSince: c.dueSince,
  attachments: c.attachments,
  status: c.status,
  action: c.action,
  afterDecision: c.afterDecision ?? null,
  specialCase: c.specialCase,
  blockedBy: c.blockedBy ?? null,
  offerId: c.offerId ?? null,
  offeredAt: c.offeredAt?.toISOString() ?? null,
  archive: c.archive ?? null,
  offerNote: c.offerNote ?? null,
  decidedOn: c.decidedOn ?? null,
  decisionNote: c.decisionNote ?? null,
  deferredUntil: c.deferredUntil ?? null,
  deferReason: c.deferReason ?? null,
  executedAt: c.executedAt?.toISOString() ?? null,
  executedAction: c.executedAction ?? null,
  version: c.version,
});

/**
 * Retention plan: per data category a period and an action. Nothing is anonymised or deleted until an administrator chooses
 * a period and an action (except the audit log after 2 years, as before). Records to be offered to the archive, and every
 * record of a rule with „Sonderfall prüfen“, become cases of the list „Aussonderung“; the rest is processed right away.
 */
@Injectable()
export class RetentionService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(RetentionService.name);
  private timer?: ReturnType<typeof setInterval>;
  private first?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly em: EntityManager,
    private readonly registry: RetentionRegistry,
    private readonly settings: SettingsService,
    private readonly audit: Audit,
  ) {}

  /**
   * Runs a minute after the start and then once a day, so it also runs when the server is restarted daily;
   * switched off with `FORGA_RETENTION_SCHEDULER=off` (tests, or to apply the rules only by hand).
   */
  onApplicationBootstrap(): void {
    if (process.env.FORGA_RETENTION_SCHEDULER === 'off') return;
    const run = () =>
      void this.run(false).catch((error: unknown) => this.logger.error(`Retention run failed: ${error instanceof Error ? error.message : String(error)}`));
    this.first = setTimeout(run, 60_000);
    this.first.unref();
    this.timer = setInterval(run, DAY_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearTimeout(this.first);
    clearInterval(this.timer);
  }

  // ----- Categories and rules -----

  async categories(): Promise<RetentionCategory[]> {
    return Promise.all(
      [...this.registry.categories.values()].map(async (d) => ({
        key: d.key,
        module: d.module,
        name: d.name,
        description: d.description ?? null,
        event: d.event,
        actions: d.actions,
        subtypeMode: d.subtypeMode ?? 'fixed',
        subtypes: (await d.subtypes?.()) ?? [],
        otherName: d.otherName ?? null,
        financial: d.financial ?? false,
        defaultRule: RetentionRule.parse(d.defaultRule ?? {}),
        atLeastAs: d.atLeastAs ?? null,
      })),
    );
  }

  async storedRules(): Promise<Record<string, RetentionRule>> {
    const stored = await this.settings.get<PrivacySettings>('privacy');
    return stored?.retention ?? {};
  }

  private ruleOf(rules: Record<string, RetentionRule>, definition: RetentionCategoryDefinition, ruleKey: string): RetentionRule {
    return rules[ruleKey] ?? (ruleKey === definition.key ? RetentionRule.parse(definition.defaultRule ?? {}) : NONE);
  }

  /** Rows that act, with the period that applies, and the warnings about the rules. */
  private async plan(rules: Record<string, RetentionRule>, now: Date) {
    const planned: PlannedRule[] = [];
    const warnings = new Set<string>();
    const effectiveYears: Record<string, number> = {};
    for (const definition of this.registry.categories.values()) {
      const subtypes = ((await definition.subtypes?.()) ?? []).map((s) => s.key);
      const fixed = (definition.subtypeMode ?? 'fixed') === 'fixed';
      const own = fixed ? subtypes : subtypes.filter((s) => rules[retentionRuleKey(definition.key, s)]);
      for (const subtype of [null, ...own]) {
        const ruleKey = retentionRuleKey(definition.key, subtype);
        const rule = this.ruleOf(rules, definition, ruleKey);
        if (!active(rule)) continue;
        if (!definition.actions.includes(rule.action) || (rule.action === 'offer-archive' && !definition.actions.includes(rule.afterDecision ?? 'none'))) {
          warnings.add('privacy.actionNotAllowed');
          continue;
        }
        let years = rule.years!;
        // The basic data stay at least as long as the person file: a file without a name is of no use.
        const longer = definition.atLeastAs ? this.ruleOfKey(rules, definition.atLeastAs) : null;
        if (longer && active(longer) && longer.years! > years) {
          years = longer.years!;
          effectiveYears[ruleKey] = years;
          warnings.add('privacy.personCoreShorter');
        }
        // Records others refer to (cost notices, payouts of an incident) should not be deleted before those.
        for (const referencing of definition.referencedBy ?? []) {
          const other = this.registry.categories.get(referencing);
          const otherRule = other ? this.ruleOf(rules, other, referencing) : null;
          if (deletes(rule) && otherRule && (!active(otherRule) || otherRule.years! > years)) warnings.add('privacy.deletedBeforeReferences');
        }
        const cutoff = new Date(now);
        cutoff.setFullYear(cutoff.getFullYear() - years);
        const final: RetentionFinalAction = rule.action === 'offer-archive' ? (rule.afterDecision ?? 'delete') : (rule.action as RetentionFinalAction);
        planned.push({ definition, ruleKey, rule, years, query: { subtype, cutoff, ownSubtypes: own, final } });
      }
    }
    return { planned, warnings: [...warnings], effectiveYears };
  }

  private ruleOfKey(rules: Record<string, RetentionRule>, key: string): RetentionRule | null {
    const definition = this.registry.categories.get(key);
    return definition ? this.ruleOf(rules, definition, key) : null;
  }

  // ----- Daily run -----

  /** `overrides` only for dry runs: what would other rules affect, before they are saved. */
  async run(dryRun: boolean, overrides?: PrivacySettings): Promise<RetentionResult> {
    const rules = dryRun && overrides ? overrides.retention : await this.storedRules();
    const now = new Date();
    const { planned, warnings, effectiveYears } = await this.plan(rules, now);
    const counts: Record<string, number> = {};
    const cases: Record<string, number> = {};
    const em = this.em.fork();
    // Uploaded import files hold personal data; nobody needs them after a day.
    const expired = { createdAt: { $lt: new Date(Date.now() - IMPORT_EXPIRY_MS) } };
    counts['core.imports'] = dryRun ? await em.count(ImportUploadEntity, expired) : await em.nativeDelete(ImportUploadEntity, expired);
    for (const [key, rule] of this.registry.rules) counts[key] = await rule.run({ retention: rules }, dryRun);

    const seen = new Set<string>();
    for (const row of planned) {
      const direct = row.rule.action !== 'offer-archive' && !row.rule.specialCase;
      const action = row.rule.action as RetentionFinalAction;
      const { bulk } = row.definition;
      if (direct && bulk) {
        counts[row.ruleKey] = dryRun ? await bulk.count(row.query) : await bulk.run(row.query, action);
        continue;
      }
      const candidates = await row.definition.candidates(row.query);
      if (dryRun) {
        counts[row.ruleKey] = candidates.length;
        continue;
      }
      for (const candidate of candidates) seen.add(`${row.definition.key}|${candidate.id}`);
      const result = await this.apply(row, candidates, direct, action);
      counts[row.ruleKey] = result.executed;
      cases[row.ruleKey] = result.created;
    }
    if (!dryRun) {
      // Due cases whose record is no longer due (rule changed, record deleted elsewhere) leave the list; cases with steps stay.
      const stale = (await em.find(RetentionCaseEntity, { status: 'due' })).filter((c) => !seen.has(`${c.category}|${c.recordId}`));
      if (stale.length) await em.nativeDelete(RetentionCaseEntity, { id: { $in: stale.map((c) => c.id) } });
      const changed = Object.entries({ ...counts, ...cases }).some(([, c]) => c > 0);
      if (changed) await this.audit.log('privacy.retention-applied', { counts, cases }, null);
    }
    return { dryRun, counts, cases, effectiveYears, warnings };
  }

  /** Creates the cases of due records, or processes them right away when the rule acts directly. */
  private async apply(row: PlannedRule, candidates: RetentionCandidate[], direct: boolean, action: RetentionFinalAction) {
    const em = this.em.fork();
    const category = row.definition.key;
    const today = berlinDate();
    let executed = 0;
    let created = 0;
    for (const part of chunks(candidates)) {
      const open = await em.find(RetentionCaseEntity, { category, recordId: { $in: part.map((c) => c.id) }, status: { $in: [...OPEN] } });
      const byRecord = new Map(open.map((c) => [c.recordId, c]));
      // A deferred case comes back on its day.
      for (const c of open) if (c.status === 'deferred' && c.deferredUntil && c.deferredUntil <= today) c.status = 'due';
      const blocking = direct || row.rule.afterDecision === 'delete' || row.rule.action === 'delete' ? await this.blocked(row.definition, part.map((c) => c.id), direct ? action : (row.rule.afterDecision ?? action)) : new Map<string, string>();
      if (direct) {
        // Without an open case (or with a due one, e.g. blocked before): processed now unless still blocked.
        const ready = part.filter((c) => !blocking.has(c.id) && (!byRecord.has(c.id) || byRecord.get(c.id)!.status === 'due'));
        if (ready.length) {
          executed += await this.executeRecords(row.definition, ready.map((c) => c.id), action);
          for (const c of ready) {
            const existing = byRecord.get(c.id);
            if (existing) this.markDone(existing, c.neutralLabel, action);
          }
        }
      }
      for (const candidate of part) {
        const existing = byRecord.get(candidate.id);
        const blockedBy = blocking.get(candidate.id) ?? null;
        if (existing) {
          if (existing.status === 'due') existing.blockedBy = blockedBy;
          continue;
        }
        // Processed right away: no case, the audit log counts it.
        if (direct && !blockedBy) continue;
        em.create(RetentionCaseEntity, {
          category,
          ruleKey: row.ruleKey,
          recordId: candidate.id,
          label: candidate.label,
          neutralLabel: candidate.neutralLabel,
          reason: candidate.reason ?? null,
          eventDate: candidate.eventDate,
          dueSince: addYears(candidate.eventDate, row.years),
          attachments: candidate.attachments ?? 0,
          status: 'due',
          action: row.rule.action,
          afterDecision: row.rule.afterDecision,
          specialCase: row.rule.specialCase,
          blockedBy,
        });
        created++;
      }
      await em.flush();
    }
    return { executed, created };
  }

  private markDone(c: RetentionCaseEntity, neutralLabel: string, action: RetentionFinalAction): void {
    Object.assign(c, { status: 'done', label: neutralLabel, neutralLabel, blockedBy: null, executedAt: new Date(), executedAction: action });
  }

  private async refs(definition: RetentionCategoryDefinition, ids: readonly string[]): Promise<RetentionRecordRef[]> {
    const children = (await definition.children?.(ids)) ?? new Map<string, string[]>();
    return ids.map((id) => ({ id, children: children.get(id) ?? [] }));
  }

  /** Error codes per record from the category and the modules depending on it. */
  private async blocked(definition: RetentionCategoryDefinition, ids: readonly string[], action: RetentionFinalAction): Promise<Map<string, string>> {
    const result = new Map((await definition.blockedBy?.(ids, action)) ?? []);
    const dependents = this.registry.dependents.get(definition.key) ?? [];
    if (!dependents.length) return result;
    const refs = await this.refs(definition, ids);
    for (const { dependent } of dependents) {
      for (const [id, code] of (await dependent.blockedBy?.(refs, action)) ?? []) if (!result.has(id)) result.set(id, code);
    }
    return result;
  }

  /** The dependents first (they may still look at the records), then the records with their attachments. */
  private async executeRecords(definition: RetentionCategoryDefinition, ids: readonly string[], action: RetentionFinalAction): Promise<number> {
    const dependents = this.registry.dependents.get(definition.key) ?? [];
    if (dependents.length) {
      const refs = await this.refs(definition, ids);
      for (const { dependent } of dependents) await dependent.execute?.(refs, action);
    }
    return definition.execute(ids, action);
  }

  // ----- List „Aussonderung“ -----

  async list(): Promise<RetentionCase[]> {
    const cases = await this.em.fork().find(RetentionCaseEntity, {}, { orderBy: { dueSince: 'asc', createdAt: 'asc' } });
    return cases.map(toCaseDto);
  }

  private async load(em: EntityManager, ids: readonly string[]): Promise<RetentionCaseEntity[]> {
    const cases = await em.find(RetentionCaseEntity, { id: { $in: [...ids] } });
    if (cases.length !== new Set(ids).size) throw new NotFoundException({ code: 'retention.caseNotFound' });
    return cases;
  }

  private categoryNames(cases: RetentionCaseEntity[]): string[] {
    return [...new Set(cases.map((c) => c.category))];
  }

  async offer(input: ReturnType<typeof RetentionOffer.parse>): Promise<{ offerId: string }> {
    const em = this.em.fork();
    const cases = await this.load(em, input.caseIds);
    if (cases.some((c) => c.status !== 'due' && c.status !== 'offered')) throw new BadRequestException({ code: 'retention.notOfferable' });
    const offerId = uuidv7();
    for (const c of cases) Object.assign(c, { status: 'offered', offerId, offeredAt: new Date(), archive: input.archive, offerNote: input.note || null });
    await em.flush();
    await this.audit.log('retention.offered', { offerId, categories: this.categoryNames(cases), count: cases.length, archive: input.archive });
    return { offerId };
  }

  async decide(input: ReturnType<typeof RetentionDecision.parse>): Promise<void> {
    const em = this.em.fork();
    const cases = await this.load(em, input.caseIds);
    if (cases.some((c) => c.status !== 'offered' && c.status !== 'accepted' && c.status !== 'destroyed')) throw new BadRequestException({ code: 'retention.notOffered' });
    for (const c of cases) Object.assign(c, { status: input.decision, decidedOn: input.date, decisionNote: input.note || null });
    await em.flush();
    await this.audit.log('retention.decided', { categories: this.categoryNames(cases), count: cases.length, decision: input.decision, date: input.date });
  }

  async defer(input: RetentionDeferral): Promise<void> {
    const em = this.em.fork();
    const cases = await this.load(em, input.caseIds);
    if (cases.some((c) => c.status === 'done')) throw new BadRequestException({ code: 'retention.alreadyDone' });
    if (input.until <= berlinDate()) throw new BadRequestException({ code: 'retention.deferInPast' });
    for (const c of cases) Object.assign(c, { status: 'deferred', deferredUntil: input.until, deferReason: input.reason });
    await em.flush();
    await this.audit.log('retention.deferred', { categories: this.categoryNames(cases), count: cases.length, until: input.until, reason: input.reason });
  }

  /**
   * Anonymises or deletes the records of the cases: after the decision of the archive its `afterDecision`, for a confirmed
   * special case its action. Cannot be undone.
   */
  async execute(caseIds: readonly string[]): Promise<RetentionExecutionResult> {
    const em = this.em.fork();
    const cases = await this.load(em, caseIds);
    const failed: RetentionExecutionResult['failed'] = [];
    const groups = new Map<string, { definition: RetentionCategoryDefinition; action: RetentionFinalAction; cases: RetentionCaseEntity[] }>();
    for (const c of cases) {
      const action = this.actionOf(c);
      const definition = this.registry.categories.get(c.category);
      if (!definition) {
        failed.push({ caseId: c.id, code: 'retention.categoryUnavailable' });
        continue;
      }
      if (typeof action !== 'string') {
        failed.push({ caseId: c.id, code: action.code });
        continue;
      }
      const key = `${c.category}|${action}`;
      const group = groups.get(key) ?? { definition, action, cases: [] };
      group.cases.push(c);
      groups.set(key, group);
    }
    let executed = 0;
    for (const { definition, action, cases: group } of groups.values()) {
      const blocked = await this.blocked(definition, group.map((c) => c.recordId), action);
      const ready = group.filter((c) => {
        const code = blocked.get(c.recordId);
        if (code) {
          c.blockedBy = code;
          failed.push({ caseId: c.id, code });
        }
        return !code;
      });
      if (!ready.length) continue;
      for (const part of chunks(ready)) await this.executeRecords(definition, part.map((c) => c.recordId), action);
      for (const c of ready) this.markDone(c, c.neutralLabel, action);
      executed += ready.length;
      await em.flush();
      await this.audit.log('retention.executed', { category: definition.key, action, count: ready.length });
    }
    await em.flush();
    return { executed, failed };
  }

  private actionOf(c: RetentionCaseEntity): RetentionFinalAction | { code: string } {
    if (c.status === 'accepted' || c.status === 'destroyed') return c.afterDecision ?? { code: 'retention.decisionMissing' };
    if (c.status === 'due' && c.action !== 'offer-archive' && c.action !== 'none') return c.action;
    if (c.status === 'due' || c.status === 'offered') return { code: 'retention.decisionMissing' };
    return { code: c.status === 'done' ? 'retention.alreadyDone' : 'retention.deferred' };
  }
}
