import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { z } from 'zod';
import type { ListColumn, LocalizedText } from '@forga/core-contracts';
import { type AuthenticatedUser, berlinDate, type ListDefinition } from '@forga/core-api';
import { ORGANIZATION, type Organization } from '@forga/masterdata-contracts';
import type { BreathingDevice, ConditionKey, EvidenceKind, ExaminationGroup, ExaminationResult, FitnessColor, FitnessStatus } from '@forga/respiratory-protection-contracts';
import { EvidenceEntity } from '../respiratory-protection.entities.js';
import { EvidenceService, EXAMINATIONS, READ } from '../evidence/evidence.service.js';

const col = (key: string, de: string, en: string, width?: number, align?: ListColumn['align']): ListColumn => ({ key, label: { de, en }, ...(width ? { width } : {}), ...(align ? { align } : {}) });
const department = { key: 'departmentId', label: { de: 'Abteilung', en: 'Department' }, type: 'department' as const };

export const COLORS: Record<FitnessColor, LocalizedText> = {
  green: { de: 'einsatzbereit', en: 'fit' },
  yellow: { de: 'läuft bald ab', en: 'expires soon' },
  red: { de: 'nicht einsetzen', en: 'not fit' },
  grey: { de: 'kein Geräteträger', en: 'no wearer' },
};
const DEVICES: Record<BreathingDevice, LocalizedText> = {
  'compressed-air': { de: 'Pressluftatmer', en: 'Compressed air' },
  rebreather: { de: 'Regenerationsgerät', en: 'Rebreather' },
  filter: { de: 'Filtergerät', en: 'Filter device' },
};
const RESULTS: Record<ExaminationResult, LocalizedText> = {
  'no-concerns': { de: 'keine Bedenken', en: 'no concerns' },
  'no-concerns-limited': { de: 'befristet keine Bedenken', en: 'no concerns for a limited time' },
  'no-concerns-conditional': { de: 'keine Bedenken unter bestimmten Voraussetzungen', en: 'no concerns under certain conditions' },
  concerns: { de: 'Bedenken', en: 'concerns' },
};
const GROUPS: Record<ExaminationGroup, LocalizedText> = {
  'up-to-5kg': { de: 'Geräte bis 5 kg (G 26.2)', en: 'Devices up to 5 kg (G 26.2)' },
  'over-5kg': { de: 'Geräte über 5 kg (G 26.3)', en: 'Devices over 5 kg (G 26.3)' },
};
export const KINDS: Record<EvidenceKind, LocalizedText> = {
  examination: { de: 'Eignungsuntersuchung', en: 'Medical examination' },
  'stress-exercise': { de: 'Belastungsübung', en: 'Stress exercise' },
  'training-track': { de: 'Atemschutzstrecke', en: 'Breathing apparatus track' },
  briefing: { de: 'Unterweisung', en: 'Briefing' },
  exercise: { de: 'Einsatzübung', en: 'Exercise' },
  incident: { de: 'Einsatz', en: 'Incident' },
  'chemical-suit': { de: 'CSA', en: 'Chemical suit' },
};

const DepartmentParams = z.object({ departmentId: z.uuid().optional(), color: z.enum(['green', 'yellow', 'red']).optional() });
const PeriodParams = z.object({ from: z.iso.date().optional(), to: z.iso.date().optional(), departmentId: z.uuid().optional() });
const YearParams = z.object({ year: z.coerce.number().int().optional(), departmentId: z.uuid().optional() });
const PersonParams = z.object({ personId: z.uuid() });
const due = (s: FitnessStatus, key: ConditionKey) => s.conditions.find((c) => c.key === key)?.dueOn ?? null;
const sum = (list: EvidenceEntity[]) => list.reduce((total, r) => total + (r.minutes ?? 0), 0);

/** List templates of the respiratory protection module. */
@Injectable()
export class RespiratoryProtectionLists {
  constructor(
    private readonly em: EntityManager,
    private readonly evidence: EvidenceService,
    @Inject(ORGANIZATION) private readonly organization: Organization,
  ) {}

  definitions(): ListDefinition<never>[] {
    return [this.fitness(), this.examinationsDue(), this.record(), this.minutes(), this.trackPlanning(), this.missingThisYear()] as ListDefinition<never>[];
  }

  private async statuses(user: AuthenticatedUser, departmentId?: string): Promise<FitnessStatus[]> {
    const statuses = await this.evidence.visibleStatuses(user, await this.evidence.wearers(user, departmentId));
    return statuses.toSorted((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`));
  }

  private async departmentNames(): Promise<Map<string, string>> {
    return new Map((await this.organization.departments()).map((d) => [d.id, d.shortName || d.name]));
  }

  private fitness(): ListDefinition<z.infer<typeof DepartmentParams>> {
    return {
      id: 'respiratory-protection.fitness',
      name: { de: 'Atemschutztauglichkeit', en: 'Respiratory protection fitness' },
      description: { de: 'Alle Geräteträger mit Ampel und Fälligkeit jeder Bedingung', en: 'All wearers with traffic light and due date of each condition' },
      permission: READ,
      parameters: [
        department,
        { key: 'color', label: { de: 'Ampel', en: 'Traffic light' }, type: 'select', options: (['green', 'yellow', 'red'] as const).map((c) => ({ value: c, label: COLORS[c] })) },
      ],
      schema: DepartmentParams,
      orientation: 'landscape',
      columns: [
        col('name', 'Name', 'Name', 2),
        col('department', 'Abteilung', 'Department'),
        col('status', 'Ampel', 'Traffic light', 1.2),
        col('examination', 'Untersuchung bis', 'Examination until'),
        col('briefing', 'Unterweisung bis', 'Briefing until'),
        col('stress', 'Belastungsübung bis', 'Stress exercise until'),
        col('exercise', 'Übung/Einsatz bis', 'Exercise/incident until'),
        col('next', 'Nächste Fälligkeit', 'Next due'),
      ],
      rows: async (user, params, language) => {
        const names = await this.departmentNames();
        const statuses = (await this.statuses(user, params.departmentId)).filter((s) => !params.color || s.color === params.color);
        return {
          subtitle: berlinDate(),
          rows: statuses.map((s) => ({
            name: `${s.lastName}, ${s.firstName}`,
            department: s.departmentIds.map((d) => names.get(d) ?? '').join(', '),
            status: COLORS[s.color][language],
            examination: due(s, 'examination'),
            briefing: due(s, 'briefing'),
            stress: due(s, 'stress-exercise'),
            exercise: due(s, 'exercise'),
            next: s.nextDue,
          })),
        };
      },
    };
  }

  private examinationsDue(): ListDefinition<z.infer<typeof PeriodParams>> {
    return {
      id: 'respiratory-protection.examinations-due',
      name: { de: 'Fällige Eignungsuntersuchungen', en: 'Examinations due' },
      permission: EXAMINATIONS,
      parameters: [{ key: 'from', label: { de: 'Von', en: 'From' }, type: 'date' }, { key: 'to', label: { de: 'Bis', en: 'To' }, type: 'date' }, department],
      schema: PeriodParams,
      columns: [col('name', 'Name', 'Name', 2), col('department', 'Abteilung', 'Department'), col('last', 'Letzte Untersuchung', 'Last examination'), col('due', 'Fällig am', 'Due on')],
      rows: async (user, params) => {
        const from = params.from ?? berlinDate();
        const to = params.to ?? `${from.slice(0, 4)}-12-31`;
        const names = await this.departmentNames();
        const statuses = (await this.statuses(user, params.departmentId)).filter((s) => s.departmentIds.some((d) => user.can(EXAMINATIONS, d)));
        const rows = statuses
          .map((s) => ({ s, c: s.conditions.find((c) => c.key === 'examination') }))
          .filter(({ c }) => c && (c.dueOn === null || c.dueOn <= to) && (c.dueOn === null || c.dueOn >= from || !c.met))
          .toSorted((a, b) => (a.c!.dueOn ?? '').localeCompare(b.c!.dueOn ?? ''));
        return {
          subtitle: `${from} – ${to}`,
          rows: rows.map(({ s, c }) => ({ name: `${s.lastName}, ${s.firstName}`, department: s.departmentIds.map((d) => names.get(d) ?? '').join(', '), last: c!.lastDate, due: c!.dueOn })),
        };
      },
    };
  }

  /** Atemschutznachweis (FwDV 7): all evidence of a person with a confirmation field for the commander. */
  private record(): ListDefinition<z.infer<typeof PersonParams>> {
    return {
      id: 'respiratory-protection.record',
      name: { de: 'Atemschutznachweis', en: 'Breathing apparatus record' },
      description: { de: 'Nachweise einer Person mit Bestätigung durch den Kommandanten (FwDV 7)', en: 'Evidence of a person with confirmation by the commander (FwDV 7)' },
      permission: READ,
      parameters: [{ key: 'personId', label: { de: 'Person', en: 'Person' }, type: 'person', required: true }],
      schema: PersonParams,
      signatureColumn: true,
      columns: [col('date', 'Datum', 'Date'), col('kind', 'Art', 'Kind', 1.3), col('details', 'Ort / Tätigkeit', 'Place / activity', 2.5), col('minutes', 'Minuten', 'Minutes', 0.7, 'right')],
      rows: async (user, params, language) => {
        const view = await this.evidence.personView(user, params.personId).catch(() => {
          throw new ForbiddenException({ code: 'auth.forbidden', permissions: [READ] });
        });
        return {
          subtitle: `${view.status.firstName} ${view.status.lastName}`,
          rows: view.evidence
            .filter((e) => !e.withdrawn)
            .toSorted((a, b) => a.date.localeCompare(b.date))
            .map((e) => ({
              date: e.date,
              kind: KINDS[e.kind][language],
              details: [e.result ? RESULTS[e.result][language] : '', e.device ? DEVICES[e.device][language] : '', e.examinationGroup ? GROUPS[e.examinationGroup][language] : '', e.facility, e.kilojoules !== null ? `${e.kilojoules} kJ` : '', e.restrictions, e.note].filter(Boolean).join(' · '),
              minutes: e.minutes,
            })),
        };
      },
    };
  }

  private minutes(): ListDefinition<z.infer<typeof YearParams>> {
    return {
      id: 'respiratory-protection.minutes',
      name: { de: 'Einsatzzeiten unter Atemschutz', en: 'Time under breathing apparatus' },
      permission: READ,
      parameters: [{ key: 'year', label: { de: 'Jahr', en: 'Year' }, type: 'year' }, department],
      schema: YearParams,
      columns: [col('name', 'Name', 'Name', 2), col('incidents', 'Einsätze', 'Incidents', 1, 'right'), col('incidentMinutes', 'Minuten Einsatz', 'Minutes incidents', 1, 'right'), col('exerciseMinutes', 'Minuten Übung', 'Minutes exercises', 1, 'right')],
      rows: async (user, params) => {
        const year = params.year ?? Number(berlinDate().slice(0, 4));
        const wearers = await this.evidence.wearers(user, params.departmentId);
        const rows = await this.em.fork().find(EvidenceEntity, { personId: { $in: wearers.map((w) => w.id) }, date: { $gte: `${year}-01-01`, $lte: `${year}-12-31` }, withdrawn: false });
        return {
          subtitle: String(year),
          rows: wearers
            .map((w) => {
              const own = rows.filter((r) => r.personId === w.id);
              const incidents = own.filter((r) => r.kind === 'incident');
              return { name: `${w.lastName}, ${w.firstName}`, incidents: incidents.length, incidentMinutes: sum(incidents), exerciseMinutes: sum(own.filter((r) => r.kind !== 'incident' && r.kind !== 'examination')) };
            })
            .toSorted((a, b) => a.name.localeCompare(b.name)),
        };
      },
    };
  }

  private trackPlanning(): ListDefinition<z.infer<typeof DepartmentParams>> {
    return {
      id: 'respiratory-protection.track-planning',
      name: { de: 'Planung Übungsstrecke', en: 'Training track planning' },
      description: { de: 'Geräteträger ohne Belastungsübung im laufenden Jahr', en: 'Wearers without stress exercise this year' },
      permission: READ,
      parameters: [department],
      schema: DepartmentParams,
      signatureColumn: true,
      columns: [col('name', 'Name', 'Name', 2), col('department', 'Abteilung', 'Department'), col('last', 'Letzte Belastungsübung', 'Last stress exercise'), col('due', 'Gültig bis', 'Valid until')],
      rows: async (user, params) => {
        const year = berlinDate().slice(0, 4);
        const names = await this.departmentNames();
        const statuses = await this.statuses(user, params.departmentId);
        return {
          subtitle: year,
          rows: statuses
            .map((s) => ({ s, c: s.conditions.find((c) => c.key === 'stress-exercise') }))
            .filter(({ c }) => !c?.lastDate || c.lastDate < `${year}-01-01`)
            .map(({ s, c }) => ({ name: `${s.lastName}, ${s.firstName}`, department: s.departmentIds.map((d) => names.get(d) ?? '').join(', '), last: c?.lastDate ?? null, due: c?.dueOn ?? null })),
        };
      },
    };
  }

  /** Wearers missing a yearly evidence (briefing, stress exercise, exercise or incident) in the year so far; conditions switched off in the rule are not required. */
  private missingThisYear(): ListDefinition<z.infer<typeof DepartmentParams>> {
    const yearly = [
      ['briefing', 'briefing'],
      ['stress-exercise', 'stress'],
      ['exercise', 'exercise'],
    ] as const;
    return {
      id: 'respiratory-protection.missing-this-year',
      name: { de: 'Fehlende Nachweise im laufenden Jahr', en: 'Missing evidence this year' },
      description: { de: 'Geräteträger ohne Unterweisung, Belastungsübung oder Übung/Einsatz seit dem 1. Januar', en: 'Wearers without briefing, stress exercise or exercise/incident since 1 January' },
      permission: READ,
      parameters: [department],
      schema: DepartmentParams,
      orientation: 'landscape',
      columns: [
        col('name', 'Name', 'Name', 2),
        col('department', 'Abteilung', 'Department'),
        col('briefing', 'Unterweisung', 'Briefing'),
        col('stress', 'Belastungsübung', 'Stress exercise'),
        col('exercise', 'Übung/Einsatz', 'Exercise/incident'),
      ],
      rows: async (user, params, language) => {
        const year = berlinDate().slice(0, 4);
        const start = `${year}-01-01`;
        const missing = language === 'de' ? 'fehlt' : 'missing';
        const names = await this.departmentNames();
        const statuses = await this.statuses(user, params.departmentId);
        const rows = statuses.flatMap((s) => {
          const cells = yearly.map(([key, column]) => {
            const c = s.conditions.find((x) => x.key === key);
            // Not required by the rule: empty; done this year: the date; else "missing" with the last date.
            const value = !c ? '' : c.lastDate && c.lastDate >= start ? c.lastDate : c.lastDate ? `${missing} (${c.lastDate})` : missing;
            return [column, value, Boolean(c && !(c.lastDate && c.lastDate >= start))] as const;
          });
          if (!cells.some(([, , open]) => open)) return [];
          return [{ name: `${s.lastName}, ${s.firstName}`, department: s.departmentIds.map((d) => names.get(d) ?? '').join(', '), ...Object.fromEntries(cells.map(([column, value]) => [column, value])) }];
        });
        return { subtitle: year, rows };
      },
    };
  }
}
