import { BadRequestException, Controller, Get, Inject, Query, Res } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import type { Response } from 'express';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { addStyledSheet, Audit, type AuthenticatedUser, berlinDayAfter, berlinDayStart, CurrentUser, formatCell, RequirePermissions, SettingsService } from '@forga/core-api';
import type { BrigadeSettings, Language } from '@forga/core-contracts';
import type { CompensationCheck, CompensationProblem } from '@forga/incidents-contracts';
import { ORGANIZATION, type Organization, PERSON_DIRECTORY, type PersonDirectory } from '@forga/masterdata-contracts';
import { dutyCompensation } from '../domain/compensation.js';
import { overlaps } from '../domain/rules.js';
import { CompensationChecker } from './compensation-check.js';
import { DutyAssignmentEntity } from '../incidents.entities.js';
import { ReportContextLoader } from '../reports/report-context.js';
import { type AssignmentLine, AssignmentLines } from './assignments.js';

const ExportQuery = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  /** Include reports that are not released yet; they are listed as problems. */
  includeUnreleased: z.enum(['true', 'false']).default('false'),
  lang: z.enum(['de', 'en']).optional(),
});

const SHEETS = {
  de: { perPerson: 'Betrag pro Person', perDepartment: 'Summe je Abteilung', assignments: 'Einsätze', duties: 'Sonderdienste', problems: 'Hinweise', overlaps: 'Überschneidungen' },
  en: { perPerson: 'Amount per person', perDepartment: 'Total per department', assignments: 'Assignments', duties: 'Special services', problems: 'Notes', overlaps: 'Overlaps' },
} as const;

/** A special service from the duty roster within the period. */
export interface DutyLine {
  personId: string;
  name: string;
  personDepartment: string;
  kind: string;
  from: string;
  to: string;
  days: number;
  rate: number | null;
  amount: number;
}

const HEAD = {
  de: {
    department: 'Abteilung', name: 'Name', incidents: 'Einsätze', hours: 'Stunden', amount: 'Betrag (€)', persons: 'Personen',
    begin: 'Beginn', end: 'Ende', dispatch: 'Leitstellen-Nr.', keyword: 'Stichwort', report: 'Bericht', status: 'Status',
    problem: 'Hinweis', other: 'Überschneidet mit', total: 'GESAMT', period: 'Zeitraum', created: 'Erstellt am',
    duty: 'Dienst', days: 'Tage', rate: 'Satz (€)', duties: 'Sonderdienste',
  },
  en: {
    department: 'Department', name: 'Name', incidents: 'Incidents', hours: 'Hours', amount: 'Amount (€)', persons: 'Persons',
    begin: 'Begin', end: 'End', dispatch: 'Dispatch no.', keyword: 'Keyword', report: 'Report', status: 'Status',
    problem: 'Note', other: 'Overlaps with', total: 'TOTAL', period: 'Period', created: 'Created on',
    duty: 'Service', days: 'Days', rate: 'Rate (€)', duties: 'Special services',
  },
} as const;

/** Texts of the problems found by the compensation check. */
export const PROBLEMS: Record<string, { de: string; en: string }> = {
  'not-released': { de: 'Bericht nicht freigegeben (fehlt in der Auszahlung)', en: 'Report not released (missing from payout)' },
  'zero-amount': { de: 'Kein Betrag (Stundensatz oder Zeit fehlt)', en: 'No amount (rate or time missing)' },
  'no-personnel': { de: 'Kein Personal eingetragen', en: 'No personnel' },
  'vehicle-missing': { de: 'Kein Fahrzeug und keine Bereitschaft', en: 'No vehicle and no standby' },
  'personnel-overlap-incident': { de: 'Person doppelt im selben Einsatz', en: 'Person twice in the same incident' },
  'personnel-overlap-other': { de: 'Überschneidung mit anderem Einsatz', en: 'Overlap with another incident' },
  'times-invalid': { de: 'Zeit fehlt oder Ende vor Beginn', en: 'Time missing or end before begin' },
  'working-hours-and-loss-of-earnings': { de: 'Arbeitszeit und Verdienstausfall zugleich', en: 'Working hours and loss of earnings together' },
};

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function dateTime(iso: string, language: Language): string {
  return new Date(iso).toLocaleString(language === 'de' ? 'de-DE' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Berlin',
  });
}

const sheet = addStyledSheet;

/**
 * Compensation export for the treasury: replaces the former `auswertung.py`.
 * Sheets: amount per person, total per department, assignments, special services, notes, overlaps.
 */
export async function buildCompensationWorkbook(
  lines: AssignmentLine[],
  duties: DutyLine[],
  from: string,
  to: string,
  language: Language,
  brigade: string,
  problems: CompensationProblem[],
): Promise<Buffer> {
  const h = HEAD[language];
  const subtitle = `${brigade} · ${h.period} ${formatCell(from, language)} – ${formatCell(to, language)} · ${h.created} ${dateTime(new Date().toISOString(), language)}`;
  const persons = lines.filter((l) => l.personId);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'f.orga';

  // Amount per person (incidents and special services), grouped by the person's primary department.
  const byPerson = new Map<string, AssignmentLine[]>();
  for (const line of persons) byPerson.set(line.personId as string, [...(byPerson.get(line.personId as string) ?? []), line]);
  const totals = new Map<string, { department: string; name: string; incidents: number; hours: number; duties: number; amount: number }>();
  for (const [personId, list] of byPerson) {
    totals.set(personId, {
      department: list[0].personDepartment,
      name: list[0].name,
      incidents: new Set(list.map((l) => l.incidentId)).size,
      hours: list.reduce((s, l) => s + l.compensation.hours, 0),
      duties: 0,
      amount: list.reduce((s, l) => s + l.compensation.amount, 0),
    });
  }
  for (const duty of duties) {
    const total = totals.get(duty.personId) ?? { department: duty.personDepartment, name: duty.name, incidents: 0, hours: 0, duties: 0, amount: 0 };
    total.duties += duty.amount;
    total.amount += duty.amount;
    totals.set(duty.personId, total);
  }
  const personRows = [...totals.values()]
    .map((t) => [t.department, t.name, t.incidents, round(t.hours), round(t.duties), round(t.amount)] as (string | number)[])
    .toSorted((a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[1]).localeCompare(String(b[1])));
  const sumOf = (index: number) => round(personRows.reduce((s, r) => s + Number(r[index]), 0));
  personRows.push(['', h.total, '', sumOf(3), sumOf(4), sumOf(5)]);
  sheet(workbook, SHEETS[language].perPerson, SHEETS[language].perPerson, subtitle, [h.department, h.name, h.incidents, h.hours, h.duties, h.amount], personRows, [26, 30, 12, 12, 16, 14]);

  // Total per department of the report (where the assignment happened).
  const byDepartment = new Map<string, AssignmentLine[]>();
  for (const line of persons) byDepartment.set(line.reportDepartment, [...(byDepartment.get(line.reportDepartment) ?? []), line]);
  const departmentRows = [...byDepartment.entries()]
    .map(([department, list]) => [department, new Set(list.map((l) => l.personId)).size, new Set(list.map((l) => l.incidentId)).size, round(list.reduce((s, l) => s + l.compensation.amount, 0))] as (string | number)[])
    .toSorted((a, b) => String(a[0]).localeCompare(String(b[0])));
  departmentRows.push([h.total, new Set(persons.map((l) => l.personId)).size, new Set(persons.map((l) => l.incidentId)).size, round(persons.reduce((s, l) => s + l.compensation.amount, 0))]);
  sheet(workbook, SHEETS[language].perDepartment, SHEETS[language].perDepartment, subtitle, [h.department, h.persons, h.incidents, h.amount], departmentRows, [30, 12, 12, 14]);

  sheet(
    workbook,
    SHEETS[language].assignments,
    SHEETS[language].assignments,
    subtitle,
    [h.department, h.name, h.begin, h.end, h.dispatch, h.keyword, h.report, h.hours, h.amount, h.status],
    lines.map((l) => [l.reportDepartment, l.name, dateTime(l.from, language), dateTime(l.to, language), l.dispatchNumber, l.alarmKeyword, l.reportNumber, l.compensation.hours, l.compensation.amount, l.status]),
    [22, 26, 18, 18, 16, 16, 10, 10, 12, 22],
  );

  sheet(
    workbook,
    SHEETS[language].duties,
    SHEETS[language].duties,
    subtitle,
    [h.department, h.name, h.duty, h.begin, h.end, h.days, h.rate, h.amount],
    duties.map((d) => [d.personDepartment, d.name, d.kind, dateTime(d.from, language), dateTime(d.to, language), d.days, d.rate ?? '', d.amount]),
    [22, 26, 28, 18, 18, 8, 10, 12],
  );

  const problemRows = problems.map((p) => [
    PROBLEMS[p.code]?.[language] ?? p.code,
    p.person ?? '',
    dateTime(p.alarmedAt, language),
    p.dispatchNumber,
    `${p.department} ${p.reportNumber}`,
  ]);
  sheet(workbook, SHEETS[language].problems, SHEETS[language].problems, subtitle, [h.problem, h.name, h.begin, h.dispatch, h.report], problemRows, [46, 26, 18, 16, 26]);

  // Overlapping assignments of the same person in different incidents (would be paid twice).
  const overlapRows: (string | number)[][] = [];
  for (const list of byPerson.values()) {
    const sorted = list.filter((l) => new Date(l.to).getTime() - new Date(l.from).getTime() <= 24 * 3_600_000).toSorted((a, b) => a.from.localeCompare(b.from));
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        if (sorted[i].incidentId !== sorted[j].incidentId && overlaps(sorted[i], sorted[j])) {
          overlapRows.push([sorted[i].name, dateTime(sorted[i].from, language), sorted[i].dispatchNumber, `${sorted[j].dispatchNumber} (${dateTime(sorted[j].from, language)})`]);
        }
      }
    }
  }
  sheet(workbook, SHEETS[language].overlaps, SHEETS[language].overlaps, subtitle, [h.name, h.begin, h.dispatch, h.other], overlapRows, [26, 18, 16, 34]);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

@Controller('incidents/compensation')
export class CompensationExportController {
  constructor(
    private readonly lines: AssignmentLines,
    private readonly settings: SettingsService,
    private readonly audit: Audit,
    private readonly em: EntityManager,
    private readonly contexts: ReportContextLoader,
    private readonly checker: CompensationChecker,
    @Inject(PERSON_DIRECTORY) private readonly directory: PersonDirectory,
    @Inject(ORGANIZATION) private readonly organization: Organization,
  ) {}

  /** Special services starting within the period. */
  private async duties(from: string, to: string, language: Language): Promise<DutyLine[]> {
    const list = await this.em.fork().find(
      DutyAssignmentEntity,
      { from: { $gte: berlinDayStart(from), $lt: berlinDayAfter(to) } },
      { orderBy: { from: 'asc' } },
    );
    if (!list.length) return [];
    const settings = await this.contexts.settingsOnly();
    const persons = new Map((await this.directory.snapshots([...new Set(list.map((d) => d.personId))], to)).map((p) => [p.id, p]));
    const departments = new Map((await this.organization.departments()).map((d) => [d.id, d.name]));
    return list.map((d) => {
      const person = persons.get(d.personId);
      const compensation = dutyCompensation({ from: d.from.toISOString(), to: d.to.toISOString(), kind: d.kind }, settings.dutyKinds);
      return {
        personId: d.personId,
        name: person ? `${person.lastName}, ${person.firstName}` : d.personId,
        personDepartment: departments.get(person?.primaryDepartmentId ?? '') ?? '',
        kind: settings.dutyKinds.find((k) => k.key === d.kind)?.name[language] ?? d.kind,
        from: d.from.toISOString(),
        to: d.to.toISOString(),
        ...compensation,
      };
    });
  }

  /** Problems of the period that block or distort the payout; check this before exporting. */
  @Get('check')
  @RequirePermissions('incidents.compensation.export')
  async check(@Query() query: Record<string, string>, @CurrentUser() user: AuthenticatedUser): Promise<CompensationCheck> {
    const parsed = ExportQuery.safeParse(query);
    if (!parsed.success) throw new BadRequestException({ code: 'validation.failed', issues: parsed.error.issues });
    return this.checker.check(user, parsed.data.from, parsed.data.to);
  }

  /** Excel workbook with the compensation of released reports in a period; the sheet "Notes" lists the check results. */
  @Get('export')
  @RequirePermissions('incidents.compensation.export')
  async export(@Query() query: Record<string, string>, @CurrentUser() user: AuthenticatedUser, @Res() res: Response): Promise<void> {
    const parsed = ExportQuery.safeParse(query);
    if (!parsed.success) throw new BadRequestException({ code: 'validation.failed', issues: parsed.error.issues });
    const { from, to, includeUnreleased } = parsed.data;
    const language = parsed.data.lang ?? user.language;
    const lines = await this.lines.load(user, { from, to }, { releasedOnly: includeUnreleased !== 'true' });
    const brigade = (await this.settings.get<BrigadeSettings>('brigade'))?.name ?? '';
    const duties = await this.duties(from, to, language);
    const check = await this.checker.check(user, from, to);
    const file = await buildCompensationWorkbook(lines, duties, from, to, language, brigade, check.problems);
    await this.audit.log('incidents.compensation-exported', { from, to, lines: lines.length });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Entschaedigung_${from}_${to}.xlsx"`);
    res.send(file);
  }
}
