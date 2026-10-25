import { Inject, Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import {
  berlinTime,
  type ImportContext,
  type ImportProfile,
  type ImportRow,
  normalizeHeading,
  parseLocalDateTime,
} from '@forga/core-api';
import type { ImportMessage, ImportResult, ImportRowResult } from '@forga/core-contracts';
import { IncidentInput, type ReportStatus } from '@forga/incidents-contracts';
import {
  type CatalogEntry,
  type Department,
  ORGANIZATION,
  type Organization,
  PERSON_DIRECTORY,
  type PersonDirectory,
  type MemberPeriods,
  membersOnDate,
  type Station,
  type Vehicle,
} from '@forga/masterdata-contracts';
import { localDate } from '../domain/compensation.js';
import { AlarmKeywordEntity, IncidentEntity, ReportPersonnelEntity } from '../incidents.entities.js';
import { RELEASE, ReportsService } from '../reports/reports.service.js';
import { statisticsFromMpFeuer } from './mp-feuer-statistics.js';
import { readIncidents } from './mp-feuer.transfer.js';

const field = (key: string, de: string, en: string, aliases: string[], required = false) => ({ key, label: { de, en }, required, aliases });

/** Columns of the MP-Feuer personnel export (`Einsaetze_Personal.xlsx` or `MP-EXCEL.xlsx`, one row per person and report). */
const FIELDS = [
  field('dispatchNumber', 'Leitstellennummer', 'Dispatch number', ['Leitstellen-Nr.', 'Leitstellennummer']),
  field('incidentNumber', 'Einsatznummer der Abteilung', 'Department incident number', ['Einsatz-Nr.'], true),
  field('begin', 'Beginn', 'Begin', ['Beginn'], true),
  field('end', 'Ende', 'End', ['Ende']),
  field('keyword', 'Alarmstichwort', 'Alarm keyword', ['Alarmstichwort', 'Stichwort'], true),
  field('message', 'Meldebild', 'Alarm message', ['Erläuterung']),
  field('street', 'Straße', 'Street', ['Straße (Obj.)']),
  field('postalCode', 'PLZ', 'Postal code', ['PLZ (Obj.)']),
  field('city', 'Ort', 'City', ['Ort (Obj.)', 'Einsatz-Ort']),
  field('district', 'Ortsteil', 'District', ['Ortsteil (Obj.)']),
  field('object', 'Objekt', 'Object', ['Zusatz (Obj.)']),
  field('department', 'Abteilung', 'Department', ['Bezeichnung (2)', 'Abteilung'], true),
  field('personName', 'Name (Nachname Vorname)', 'Name (last first)', ['Name']),
  field('personnelNumber', 'Personalnummer', 'Personnel number', ['Pers.-Nr.']),
  field('from', 'Person von', 'Person from', ['von']),
  field('to', 'Person bis', 'Person to', ['bis']),
  field('vehicle', 'Fahrzeug', 'Vehicle', ['Funkrufname', 'Bezeichnung', 'Fzg.-Nr.']),
  field('standby', 'Bereitschaft', 'Standby', ['BE']),
  field('breathing', 'Atemschutz', 'Breathing apparatus', ['AS']),
  field('lossOfEarnings', 'Verdienstausfall', 'Loss of earnings', ['V-A', 'VA', 'Verdienstausfall']),
  field('primary', 'Hauptbericht (Ges.-Stat.)', 'Primary report', ['bei Ges. Stat. anzeigen']),
  field('status', 'Freigabestatus', 'Release status', ['Zusatzfeld 2', 'Freigabe']),
  field('situation', 'Lage', 'Situation', ['Lage']),
  field('actions', 'Verlauf', 'Course', ['Verlauf']),
  field('narrative', 'Bericht', 'Report text', ['Bericht']),
  field('cause', 'Ursache', 'Cause', ['Ursache']),
  field('commander', 'Einsatzleiter', 'Incident commander', ['Leitung']),
  field('function', 'Aufgabe', 'Function', ['Aufgabe', 'Funktion']),
  field('statistics', 'Statistik', 'Statistics', ['Statistik']),
  field('incidentType', 'Einsatzart', 'Incident type', ['Eins.-Art', 'Einsatzart']),
  field('rescued', 'Gerettete Personen', 'Rescued persons', ['Pers.-Rettung']),
  field('dead', 'Tote', 'Dead', ['Verluste']),
  field('animalsRescued', 'Gerettete Tiere', 'Rescued animals', ['Tier-Rettung']),
  field('chargeable', 'Kostenpflichtig', 'Chargeable', ['kostenpflichtiger Einsatz']),
];

const YES = new Set(['ja', 'j', 'yes', 'true', 'wahr', '1', 'x', '✓', '✔', '☑']);
const yes = (value: string | undefined) => YES.has((value ?? '').trim().toLowerCase());

function normalizeName(text: string): string {
  return text.toLowerCase().replace(/^(abteilung|abt\.?)\s*/, '').replace(/[^a-z0-9äöüß]/g, '');
}

function statusOf(text: string | undefined): ReportStatus {
  const value = (text ?? '').toLowerCase();
  if (value.includes('abrechnung')) return 'released-billing';
  if (value.includes('entschädigung') || value.includes('auszahlung')) return 'released-compensation';
  return 'draft';
}

/** Time from the export (local, Europe/Berlin) as Date, or `null`. */
function time(value: string | undefined): Date | null {
  const local = parseLocalDateTime(value ?? '');
  return local ? berlinTime(local) : null;
}

/** Matches "Nachname Vorname" in any order of the two parts. */
function nameKey(text: string): string {
  return text.toLowerCase().split(/[\s,]+/).filter(Boolean).toSorted().join(' ');
}

@Injectable()
export class MpFeuerIncidentsImport {
  constructor(
    private readonly em: EntityManager,
    private readonly reports: ReportsService,
    @Inject(ORGANIZATION) private readonly organization: Organization,
    @Inject(PERSON_DIRECTORY) private readonly directory: PersonDirectory,
  ) {}

  profile(): ImportProfile {
    return {
      id: 'incidents.mp-feuer',
      name: { de: 'Einsätze aus MP-Feuer', en: 'Incidents from MP-Feuer' },
      description: {
        de: 'Personalexport von MP-Feuer (eine Zeile je Person und Bericht). Einsatz = Leitstellennummer, Bericht = Abteilung + Einsatznummer + Beginn, Hauptbericht = „bei Ges. Stat. anzeigen“, Status aus Zusatzfeld 2. Ein erneuter Import ersetzt nur Berichte, die seitdem niemand bearbeitet hat.',
        en: 'Personnel export of MP-Feuer (one row per person and report). Incident = dispatch number, report = department + incident number + begin, primary = "bei Ges. Stat. anzeigen", status from Zusatzfeld 2. Importing again only replaces reports nobody has edited since.',
      },
      permission: RELEASE,
      fields: FIELDS,
      options: [{ key: 'createKeywords', label: { de: 'Unbekannte Stichworte anlegen', en: 'Create unknown keywords' }, default: true }],
      run: (rows, context) => this.run(rows, context),
      transfer: { order: 60, read: readIncidents },
    };
  }

  /** A dry run works in a transaction that is always rolled back, so intermediate flushes change nothing. */
  private async run(rows: ImportRow[], context: ImportContext): Promise<ImportResult> {
    const em = this.em.fork();
    if (!context.dryRun) return this.apply(em, rows, context);
    await em.begin();
    try {
      return await this.apply(em, rows, context);
    } finally {
      await em.rollback();
    }
  }

  private async apply(em: EntityManager, rows: ImportRow[], { options, dryRun }: ImportContext): Promise<ImportResult> {
    const [departments, vehicles, stations, functions] = await Promise.all([
      this.organization.departments(),
      this.organization.vehicles({ includeRetired: true }),
      this.organization.stations(),
      this.organization.catalog('function'),
    ]);
    const keywords = new Set((await em.find(AlarmKeywordEntity, {})).map((k) => k.key));
    const persons = await this.directory.memberPeriods();
    const results: ImportRowResult[] = [];
    const handled = new Map<string, Set<string>>();

    // One report per department, incident number and begin.
    const groups = new Map<string, ImportRow[]>();
    for (const row of rows) {
      const key = [normalizeName(row.values['department'] ?? ''), row.values['incidentNumber'], row.values['begin']].join('|');
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }

    for (const [index, group] of [...groups.values()].entries()) {
      // Every query flushes the unit of work first; keeping it small keeps large imports linear (a dry run is rolled back anyway).
      if (index > 0 && index % 50 === 0) {
        await em.flush();
        em.clear();
      }
      const first = group[0].values;
      const label = `${first['dispatchNumber'] || first['incidentNumber']} ${first['keyword'] ?? ''}`.trim();
      const failAll = (code: string, params?: ImportMessage['params']) => {
        for (const { row } of group) results.push({ row, action: 'error', label, messages: [{ code, params }] });
      };

      const department = this.department(departments, first['department'] ?? '');
      const begin = time(first['begin']);
      if (!department) {
        failAll('masterdata.import.unknownDepartment', { name: first['department'] ?? '' });
        continue;
      }
      if (!begin) {
        failAll('imports.invalidDate');
        continue;
      }
      const keyword = (first['keyword'] ?? '').trim();
      if (!keywords.has(keyword)) {
        if (!options['createKeywords'] || !keyword) {
          failAll('incidents.unknownKeyword', { key: keyword });
          continue;
        }
        em.create(AlarmKeywordEntity, { key: keyword, name: { de: keyword, en: keyword }, requiresVehicle: true, compensationKind: 'incident' });
        keywords.add(keyword);
        if (!dryRun) await em.flush();
      }

      // Without a dispatch number each report is an incident of its own, numbered stably for re-imports.
      const dispatchNumber = first['dispatchNumber']?.trim() || `MP-${localDate(begin.toISOString()).slice(0, 4)}-${first['incidentNumber']}-${normalizeName(department.shortName)}`;
      let incident: IncidentEntity | null = await em.findOne(IncidentEntity, { dispatchNumber }, { populate: ['reports'] });
      if (!incident) {
        incident = await this.reports.createIncident(
          em,
          IncidentInput.parse({
            dispatchNumber,
            alarmKeyword: keyword,
            alarmMessage: first['message'] ?? '',
            alarmedAt: begin.toISOString(),
            location: { street: first['street'] ?? '', postalCode: first['postalCode'] ?? '', city: first['city'] ?? '', district: first['district'] ?? '', object: first['object'] ?? '' },
          }),
          'import',
        );
        incident.internalNumber = !first['dispatchNumber']?.trim();
      }
      const current: IncidentEntity = incident;

      let report = current.reports.getItems().find((r) => r.departmentId === department.id);
      const created = !report;
      if (report && !report.externallyManaged) {
        for (const { row } of group) results.push({ row, action: 'unchanged', label, messages: [{ code: 'incidents.import.reportEdited' }] });
        continue;
      }
      report ??= await this.reports.createReport(em, current, department.id, null);
      await em.populate(report, ['personnel']);

      // MP-Feuer may hold several reports of a department for one dispatch number; f.orga keeps one and merges their personnel.
      const earlier = handled.get(report.id);
      const seen = earlier ?? new Set<string>();
      if (earlier) {
        const later = time(first['end']);
        if (later && later > report.returnedAt) report.returnedAt = later;
      } else {
        handled.set(report.id, seen);
        const end = time(first['end']) ?? new Date(begin.getTime() + 3_600_000);
        const status = statusOf(first['status']);
        // MP-Feuer keeps short picklist values in "Lage" and "Verlauf" and the free text in "Bericht".
        const actions = [first['actions'], first['narrative']].map((t) => t?.trim()).filter(Boolean).join('\n\n');
        const statistics = statisticsFromMpFeuer(first['statistics'], first);
        em.assign(report, {
          alarmedAt: begin,
          returnedAt: end > begin ? end : new Date(begin.getTime() + 3_600_000),
          situation: first['situation'] ?? '',
          actions,
          cause: first['cause'] ?? '',
          incidentCommander: first['commander'] ?? '',
          statistics: statistics ?? report.statistics ?? null,
          status,
          locked: status !== 'draft',
          lockedBy: status !== 'draft' ? 'MP-Feuer' : null,
          lockedAt: status !== 'draft' ? new Date() : null,
          externallyManaged: true,
        });
        // Chargeable applies to the whole incident; one department's report marking it is enough.
        if (yes(first['chargeable'])) current.chargeable = true;
        if (group.some((r) => yes(r.values['primary']))) await this.reports.setPrimary(em, report);
        else if (current.reports.count() > 1) report.primary = false;

        for (const item of report.personnel.getItems()) em.remove(item);
        report.personnel.removeAll();
      }
      const date = localDate(begin.toISOString());
      const members = membersOnDate(persons, date);
      for (const { row, values } of group) {
        const messages: ImportMessage[] = [];
        // A row without a person carries only the report (e.g. the report row of a data transfer).
        if (!values['personName']?.trim() && !values['personnelNumber']?.trim()) {
          results.push({ row, action: created ? 'create' : 'update', label, messages });
          continue;
        }
        const person = await this.person(values, members);
        if (!person) {
          results.push({ row, action: 'error', label, messages: [{ code: 'incidents.import.unknownPerson', params: { name: values['personName'] ?? values['personnelNumber'] ?? '' } }] });
          continue;
        }
        if (seen.has(person.id)) {
          results.push({ row, action: 'unchanged', label, messages: [{ code: 'incidents.personTwiceInReport' }] });
          continue;
        }
        seen.add(person.id);
        const vehicle = this.vehicle(vehicles, values['vehicle'] ?? '');
        const standby = yes(values['standby']);
        const station = standby ? this.station(stations, department) : undefined;
        if (values['vehicle'] && !vehicle && !standby) messages.push({ code: 'incidents.api.unknownVehicle', params: { value: values['vehicle'] } });
        const fn = this.function(functions, values['function'] ?? '');
        if (values['function'] && !fn) messages.push({ code: 'incidents.import.unknownFunction', params: { value: values['function'] } });
        const from = time(values['from']);
        const to = time(values['to']);
        report.personnel.add(
          em.create(ReportPersonnelEntity, {
            report,
            personId: person.id,
            vehicleId: standby ? null : (vehicle?.id ?? null),
            standbyStationId: station?.id ?? null,
            function: fn?.key ?? null,
            breathingApparatus: yes(values['breathing']),
            lossOfEarnings: yes(values['lossOfEarnings']),
            from: from && from.getTime() !== report.alarmedAt.getTime() ? from : null,
            to: to && to.getTime() !== report.returnedAt.getTime() ? to : null,
            allowances: [],
          }),
        );
        results.push({ row, action: created ? 'create' : 'update', label, messages });
      }
    }

    if (!dryRun) await em.flush();
    const counts = { create: 0, update: 0, unchanged: 0, error: 0 };
    for (const r of results) counts[r.action]++;
    return { dryRun, counts, rows: results.toSorted((a, b) => a.row - b.row) };
  }

  private department(departments: Department[], value: string): Department | undefined {
    const wanted = normalizeName(value);
    return departments.find((d) => normalizeName(d.name) === wanted || normalizeName(d.shortName) === wanted);
  }

  private vehicle(vehicles: Vehicle[], value: string): Vehicle | undefined {
    const wanted = normalizeHeading(value);
    if (!wanted) return undefined;
    return vehicles.find((v) => normalizeHeading(v.radioCallSign) === wanted || normalizeHeading(v.designation) === wanted);
  }

  /** Function by name or abbreviation of the catalog, e.g. "Maschinist", "GF", "EvD". */
  private function(functions: CatalogEntry[], value: string): CatalogEntry | undefined {
    const wanted = normalizeHeading(value);
    if (!wanted) return undefined;
    return functions.find(
      (f) => f.active && [f.name.de, f.name.en, String(f.attributes['abbreviation'] ?? '')].some((n) => n && normalizeHeading(n) === wanted),
    );
  }

  /** Standby is booked at the first station of the department. */
  private station(stations: Station[], department: Department): Station | undefined {
    return stations.find((s) => s.departmentId === department.id);
  }

  private async person(values: Record<string, string>, members: MemberPeriods[]): Promise<{ id: string } | undefined> {
    if (values['personnelNumber']) {
      const found = await this.directory.findByPersonnelNumber(values['personnelNumber']);
      if (found) return { id: found.id };
    }
    const wanted = nameKey(values['personName'] ?? '');
    if (!wanted) return undefined;
    const matches = members.filter((m) => nameKey(`${m.lastName} ${m.firstName}`) === wanted);
    return matches.length === 1 ? matches[0] : undefined;
  }
}
