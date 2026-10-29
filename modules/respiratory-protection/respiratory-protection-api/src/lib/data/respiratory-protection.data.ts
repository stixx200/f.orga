import { Injectable } from '@nestjs/common';
import { EntityManager, wrap } from '@mikro-orm/core';
import { berlinDate, type DeadlineInput, type DeadlineProvider, type DescribeContext, HistoryEntry, type PersonDataSection } from '@forga/core-api';
import type { LocalizedText } from '@forga/core-contracts';
import type { ConditionKey } from '@forga/respiratory-protection-contracts';
import { EvidenceEntity, StatusEntity } from '../respiratory-protection.entities.js';
import { EVIDENCE, EvidenceService, SELF } from '../evidence/evidence.service.js';

const TITLES: Partial<Record<ConditionKey, LocalizedText>> = {
  // Due, missing or with concerns alike: the deadline does not tell why (health data).
  examination: { de: 'Eignungsuntersuchung erforderlich', en: 'Medical examination required' },
  briefing: { de: 'Atemschutz-Unterweisung fällig', en: 'BA briefing due' },
  'stress-exercise': { de: 'Belastungsübung fällig', en: 'Stress exercise due' },
  exercise: { de: 'Einsatzübung unter Atemschutz fällig', en: 'Exercise under BA due' },
  'chemical-suit': { de: 'CSA-Übung fällig', en: 'Chemical suit exercise due' },
};
const OWN_TITLES: Partial<Record<ConditionKey, LocalizedText>> = {
  examination: { de: 'Ihre Eignungsuntersuchung ist fällig', en: 'Your medical examination is due' },
  briefing: { de: 'Ihre Atemschutz-Unterweisung ist fällig', en: 'Your BA briefing is due' },
  'stress-exercise': { de: 'Ihre Belastungsübung ist fällig', en: 'Your stress exercise is due' },
  exercise: { de: 'Ihre Einsatzübung unter Atemschutz ist fällig', en: 'Your exercise under BA is due' },
  'chemical-suit': { de: 'Ihre CSA-Übung ist fällig', en: 'Your chemical suit exercise is due' },
};

/** Export and deadlines of the respiratory protection module. */
@Injectable()
export class RespiratoryProtectionData implements DeadlineProvider {
  readonly module = 'respiratory-protection';

  constructor(
    private readonly em: EntityManager,
    private readonly evidence: EvidenceService,
  ) {}

  /**
   * One deadline per condition of each wearer that expires (or is missing), for those who record evidence in the
   * wearer's department (`evidence`), and the same for the wearer, who sees it in "My area" and the weekly e-mail.
   * The examination deadline only names the due date of a valid examination; after an examination with concerns it is
   * due today like a missing one, so neither the date of that examination nor a date derived from it shows. Results and
   * findings stay with the examinations permission.
   */
  async deadlines(asOf: string): Promise<DeadlineInput[]> {
    const rule = await this.evidence.rule();
    const statuses = await this.evidence.statuses(await this.evidence.wearers(null), asOf);
    const own = statuses.flatMap((s) =>
      s.conditions
        .filter((c) => OWN_TITLES[c.key])
        .map((c) => ({
          id: `own:${c.key}:${s.personId}`,
          kind: `breathing-apparatus-own-${c.key}`,
          title: OWN_TITLES[c.key]!,
          subject: { type: 'core.me', id: s.personId, label: `${s.lastName}, ${s.firstName}` },
          dueOn: c.dueOn ?? berlinDate(),
          leadDays: rule.leadDays,
          departmentIds: s.departmentIds,
          permission: SELF,
          personIds: [s.personId],
        })),
    );
    return [...own, ...statuses.flatMap((s) =>
      s.conditions
        .filter((c) => TITLES[c.key])
        .map((c) => ({
          id: `${c.key}:${s.personId}`,
          kind: `breathing-apparatus-${c.key}`,
          title: TITLES[c.key]!,
          subject: { type: 'masterdata.person', id: s.personId, label: `${s.lastName}, ${s.firstName}` },
          dueOn: (!c.concerns && c.dueOn) || berlinDate(),
          to: `/masterdata/persons/${s.personId}?tab=respiratory-protection`,
          leadDays: rule.leadDays,
          departmentIds: s.departmentIds,
          permission: EVIDENCE,
          // The medical examination is health data: the weekly e-mail only counts these deadlines.
          ...(c.key === 'examination' ? { health: true } : {}),
        })),
    )];
  }

  async exportAll(): Promise<Record<string, unknown>> {
    const em = this.em.fork();
    return {
      evidence: (await em.find(EvidenceEntity, {})).map((e) => wrap(e).toObject()),
      status: (await em.find(StatusEntity, {})).map((e) => wrap(e).toObject()),
    };
  }

  async exportPerson(personId: string): Promise<Record<string, unknown>> {
    return { evidence: (await this.em.fork().find(EvidenceEntity, { personId }, { orderBy: { date: 'asc' } })).map((e) => wrap(e).toObject()) };
  }

  /**
   * Access report: every evidence record of the wearer with validity; examinations with result and restrictions are
   * health data. Examiner and facility are stored as text (no members of the brigade).
   */
  async describePerson(personId: string, ctx: DescribeContext): Promise<PersonDataSection[]> {
    const evidence = await this.em.fork().find(EvidenceEntity, { personId }, { orderBy: { date: 'desc' } });
    if (!evidence.length) return [];
    const kinds: Record<EvidenceEntity['kind'], string> = {
      examination: ctx.t('Eignungsuntersuchung', 'Medical examination'),
      'stress-exercise': ctx.t('Belastungsübung', 'Stress exercise'),
      'training-track': ctx.t('Übungsstrecke', 'Training track'),
      briefing: ctx.t('Unterweisung', 'Briefing'),
      exercise: ctx.t('Einsatzübung unter Atemschutz', 'Exercise under breathing apparatus'),
      incident: ctx.t('Einsatz unter Atemschutz', 'Operation under breathing apparatus'),
      'chemical-suit': ctx.t('Übung mit Chemikalienschutzanzug', 'Chemical suit exercise'),
    };
    const results: Record<string, string> = {
      'no-concerns': ctx.t('keine Bedenken', 'no concerns'),
      'no-concerns-limited': ctx.t('keine Bedenken, befristet', 'no concerns, limited in time'),
      'no-concerns-conditional': ctx.t('keine Bedenken unter Voraussetzungen', 'no concerns under conditions'),
      concerns: ctx.t('Bedenken', 'concerns'),
    };
    const devices: Record<string, string> = {
      'compressed-air': ctx.t('Pressluftatmer', 'compressed air breathing apparatus'),
      rebreather: ctx.t('Kreislaufgerät', 'rebreather'),
      filter: ctx.t('Filtergerät', 'filter device'),
    };
    const groups: Record<string, string> = { 'up-to-5kg': ctx.t('Geräte bis 5 kg', 'devices up to 5 kg'), 'over-5kg': ctx.t('Geräte über 5 kg', 'devices over 5 kg') };
    const sources: Record<string, string> = {
      manual: ctx.t('erfasst', 'entered'),
      training: ctx.t('aus einem Dienst', 'from a session'),
      incidents: ctx.t('aus einem Einsatzbericht', 'from an incident report'),
      import: ctx.t('Tabellen-Import', 'table import'),
    };
    const details = (e: EvidenceEntity) =>
      [
        e.result ? results[e.result] : '',
        e.examinationGroup ? groups[e.examinationGroup] : '',
        e.restrictions ? ctx.t(`Einschränkungen: ${e.restrictions}`, `restrictions: ${e.restrictions}`) : '',
        e.examiner ? ctx.t(`Untersucher: ${e.examiner}`, `examiner: ${e.examiner}`) : '',
        e.facility ? ctx.t(`Einrichtung: ${e.facility}`, `facility: ${e.facility}`) : '',
        e.device ? devices[e.device] : '',
        typeof e.kilojoules === 'number' ? `${ctx.number(e.kilojoules)} kJ` : '',
        e.passed === null || e.passed === undefined ? '' : e.passed ? ctx.t('bestanden', 'passed') : ctx.t('nicht bestanden', 'not passed'),
        typeof e.minutes === 'number' ? ctx.t(`${ctx.number(e.minutes)} Minuten`, `${ctx.number(e.minutes)} minutes`) : '',
        e.note,
        e.withdrawn ? ctx.t('zurückgezogen', 'withdrawn') : '',
      ]
        .filter(Boolean)
        .join(', ') || '–';
    const years = new Map<string, { count: number; minutes: number }>();
    for (const e of evidence.filter((x) => x.kind === 'incident' || x.kind === 'exercise')) {
      const year = e.date.slice(0, 4);
      const sum = years.get(year) ?? { count: 0, minutes: 0 };
      sum.count += 1;
      sum.minutes += e.minutes ?? 0;
      years.set(year, sum);
    }
    return [
      {
        key: 'respiratory-protection',
        title: ctx.t('Atemschutz', 'Breathing apparatus'),
        activity: 'respiratory-protection.fitness',
        categories: [ctx.t('Atemschutznachweise', 'Breathing apparatus records'), ctx.t('Eignungsuntersuchungen mit Ergebnis', 'Medical examinations with result')],
        health: evidence.some((e) => e.kind === 'examination'),
        blocks: [
          {
            kind: 'table',
            columns: [ctx.t('Datum', 'Date'), ctx.t('Nachweis', 'Record'), ctx.t('Ergebnis und Angaben', 'Result and details'), ctx.t('Gültig bis', 'Valid until'), ctx.t('Herkunft', 'Source')],
            rows: evidence.map((e) => [ctx.date(e.date), kinds[e.kind], details(e), ctx.date(e.validUntil), sources[e.source] ?? '–']),
            summary: [...years].map(([year, sum]) =>
              ctx.t(`${year}: ${sum.count} Einsätze und Übungen unter Atemschutz, ${ctx.number(sum.minutes)} Minuten`, `${year}: ${sum.count} operations and exercises under breathing apparatus, ${ctx.number(sum.minutes)} minutes`),
            ),
          },
        ],
        records: [{ entity: 'respiratory_protection.evidence', ids: evidence.map((e) => e.id), label: ctx.t('Nachweis', 'Record') }],
      },
    ];
  }

  /**
   * Anonymised persons: medical examinations (health data) are deleted; other evidence keeps date and kind for the
   * statistics but loses examiner, facility, restrictions and notes. Their history and the stored status go as well.
   */
  async anonymize(personIds: readonly string[]): Promise<void> {
    const em = this.em.fork();
    const evidence = await em.find(EvidenceEntity, { personId: { $in: [...personIds] } });
    if (evidence.length) {
      await em.nativeDelete(HistoryEntry, { entity: 'respiratory_protection.evidence', entityId: { $in: evidence.map((e) => e.id) } });
      await em.nativeDelete(EvidenceEntity, { personId: { $in: [...personIds] }, kind: 'examination' });
      await em.nativeUpdate(EvidenceEntity, { personId: { $in: [...personIds] } }, { examiner: '', facility: '', restrictions: '', note: '' });
    }
    await em.nativeDelete(StatusEntity, { personId: { $in: [...personIds] } });
  }
}
