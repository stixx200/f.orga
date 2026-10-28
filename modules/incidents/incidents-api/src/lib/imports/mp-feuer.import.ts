import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import {
  berlinDayStart,
  berlinTime,
  findByAlias,
  hasAlias,
  type ImportContext,
  type ImportLookup,
  type ImportProfile,
  type ImportRow,
  type ImportRunResult,
  normalizeHeading,
  parseLocalDateTime,
  ZodPipe,
} from '@forga/core-api';
import type { ImportMessage, ImportRowResult } from '@forga/core-contracts';
import { AlarmKeywordInput, IncidentInput, type IncidentUnit, type ReportStatus } from '@forga/incidents-contracts';
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
import { AlarmKeywordEntity, IncidentEntity, ReportEntity, ReportPersonnelEntity, ReportVehicleEntity } from '../incidents.entities.js';
import { rememberKeywordAlias } from '../keywords/keywords.controller.js';
import { addCrewVehicles, RELEASE, REPORT_POPULATE, ReportsService } from '../reports/reports.service.js';
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
  // Key or name of a brigade-wide unit (e.g. "EvD"): the row belongs to the report of the unit, not of the department.
  field('unit', 'Feuerwehrweite Einheit', 'Brigade-wide unit', []),
  field('personName', 'Name (Nachname Vorname)', 'Name (last first)', ['Name']),
  field('personnelNumber', 'Personalnummer', 'Personnel number', ['Pers.-Nr.']),
  field('from', 'Person von', 'Person from', ['von']),
  field('to', 'Person bis', 'Person to', ['bis']),
  field('vehicle', 'Fahrzeug', 'Vehicle', ['Funkrufname', 'Bezeichnung', 'Fzg.-Nr.']),
  // Own times and kilometres of the person's vehicle in this report (data transfer: `EIN_FAHRZ`).
  field('vehicleAlarmedAt', 'Fahrzeug alarmiert', 'Vehicle alerted', []),
  field('vehicleDepartedAt', 'Fahrzeug ausgerückt', 'Vehicle departed', []),
  field('vehicleReturnedAt', 'Fahrzeug eingerückt', 'Vehicle returned', []),
  field('vehicleKilometres', 'Fahrzeug Kilometer', 'Vehicle kilometres', []),
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

const released = (status: ReportStatus) => status.startsWith('released');
const ms = (date: Date | null | undefined) => date?.getTime() ?? null;

/**
 * What the other modules take from a released report (status, times, personnel, vehicles, keyword); a re-import
 * announces a report again only if this changed.
 */
function releaseSignature(report: ReportEntity): string {
  return JSON.stringify([
    report.status,
    report.incident.alarmKeyword,
    ms(report.alarmedAt),
    ms(report.returnedAt),
    report.personnel
      .getItems()
      .map((p) => JSON.stringify([p.personId, p.vehicleId, p.standbyStationId, ms(p.from), ms(p.to), p.breathingApparatus, p.lossOfEarnings, p.function]))
      .toSorted(),
    report.vehicles
      .getItems()
      .map((v) => JSON.stringify([v.vehicleId, ms(v.alarmedAt), ms(v.departedAt), ms(v.returnedAt), v.kilometres]))
      .toSorted(),
  ]);
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
        de: 'Personalexport von MP-Feuer (eine Zeile je Person und Bericht). Einsatz = Leitstellennummer, Bericht = Abteilung (nur Einsatzabteilungen) oder feuerwehrweite Einheit (z. B. EvD) + Einsatznummer + Beginn, Hauptbericht = „bei Ges. Stat. anzeigen“, Status aus Zusatzfeld 2. Ein erneuter Import ersetzt nur Berichte, die seitdem niemand bearbeitet hat.',
        en: 'Personnel export of MP-Feuer (one row per person and report). Incident = dispatch number, report = department (operational departments only) or brigade-wide unit (e.g. duty officer) + incident number + begin, primary = "bei Ges. Stat. anzeigen", status from Zusatzfeld 2. Importing again only replaces reports nobody has edited since.',
      },
      permission: RELEASE,
      fields: FIELDS,
      options: [{ key: 'createKeywords', label: { de: 'Unbekannte Stichworte anlegen', en: 'Create unknown keywords' }, default: true }],
      run: (rows, context) => this.run(rows, context),
      transfer: {
        order: 60,
        read: readIncidents,
        // E.g. the archive "Gesamtfeuerwehr" holds the reports of the duty officer.
        units: {
          label: { de: 'Einsatzberichte als', en: 'Incident reports as' },
          none: { de: 'Abteilungsbericht', en: 'Department report' },
          entries: async () => (await this.reports.units.active()).map((u) => ({ key: u.key, name: u.label })),
        },
      },
    };
  }

  /** Alarm keywords for keywords of the export that are not known; the key is the keyword itself. */
  lookup(): ImportLookup {
    return {
      kind: 'alarm-keyword',
      name: { de: 'Alarmstichworte', en: 'Alarm keywords' },
      keyFormat: 'text',
      entries: async () => (await this.em.fork().find(AlarmKeywordEntity, { active: true }, { orderBy: { key: 'asc' } })).map((k) => ({ key: k.key, name: k.name })),
      create: {
        permission: 'incidents.settings.manage',
        run: async ({ key, name }) => {
          const em = this.em.fork();
          if (await em.count(AlarmKeywordEntity, { key })) throw new ConflictException({ code: 'catalog.keyTaken', key });
          const keyword = em.create(AlarmKeywordEntity, { ...new ZodPipe(AlarmKeywordInput).transform({ key, name: { de: name, en: name } }), aliases: [] });
          await em.flush();
          return { key: keyword.key, name: keyword.name };
        },
      },
      remember: (key, value) => rememberKeywordAlias(this.em.fork(), key, value),
    };
  }

  /** A dry run works in a transaction that is always rolled back, so intermediate flushes change nothing. */
  private async run(rows: ImportRow[], context: ImportContext): Promise<ImportRunResult> {
    const em = this.em.fork();
    if (!context.dryRun) return this.apply(em, rows, context);
    await em.begin();
    try {
      return await this.apply(em, rows, context);
    } finally {
      await em.rollback();
    }
  }

  private async apply(em: EntityManager, rows: ImportRow[], { options, dryRun, mapped, unmatched }: ImportContext): Promise<ImportRunResult> {
    const [departments, vehicles, stations, functions] = await Promise.all([
      this.organization.departments(),
      this.organization.vehicles({ includeRetired: true }),
      this.organization.stations(),
      this.organization.catalog('function'),
    ]);
    const units = await this.reports.units.active();
    const keywordEntities = await em.find(AlarmKeywordEntity, {});
    const keywords = new Set(keywordEntities.map((k) => k.key));
    const createdKeywords = new Set<string>();
    const persons = await this.directory.memberPeriods();
    const results: ImportRowResult[] = [];
    const handled = new Map<string, Set<string>>();
    const createdIncidents: IncidentEntity[] = [];
    const external = await this.reports.externalOperation();
    // Released state of each replaced report before the import (`null`: new), for the events after it.
    const before = new Map<string, string | null>();

    // One report per department (or unit), incident number and begin.
    const groups = new Map<string, ImportRow[]>();
    for (const row of rows) {
      const key = [normalizeName(row.values['department'] ?? ''), row.values['unit'] ?? '', row.values['incidentNumber'], row.values['begin']].join('|');
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

      // Rows of a unit (e.g. the archive "Gesamtfeuerwehr" as duty officer) need no department.
      const unitText = (first['unit'] ?? '').trim();
      const unit = unitText ? this.unit(units, unitText) : undefined;
      const department = unitText ? undefined : this.department(departments, first['department'] ?? '');
      const begin = time(first['begin']);
      if (unitText && !unit) {
        failAll('incidents.import.unknownUnit', { unit: unitText });
        continue;
      }
      if (!unit && !department) {
        failAll('masterdata.import.unknownDepartment', { name: first['department'] ?? '' });
        continue;
      }
      // Only operational departments write incident reports (not e.g. youth, veterans or the command group).
      if (department && department.type !== 'operational') {
        failAll('incidents.departmentNotOperational', { name: department.name });
        continue;
      }
      if (!begin) {
        failAll('imports.invalidDate');
        continue;
      }
      // Keywords the user mapped to another one count as known; others can be created (also reported as unmatched,
      // so the user may choose an existing keyword instead).
      const source = (first['keyword'] ?? '').trim();
      const keyword = keywords.has(source) ? source : (findByAlias(keywordEntities, source)?.key ?? mapped('alarm-keyword', source) ?? source);
      const groupMessages: ImportMessage[] = [];
      if (!keywords.has(keyword)) {
        if (keyword) unmatched('alarm-keyword', keyword);
        if (!createdKeywords.has(keyword)) {
          if (!options['createKeywords'] || !keyword) {
            failAll('incidents.unknownKeyword', { key: keyword, kind: 'alarm-keyword', value: keyword });
            continue;
          }
          em.create(AlarmKeywordEntity, { key: keyword, name: { de: keyword, en: keyword }, requiresVehicle: true, compensationKind: 'incident', aliases: [] });
          createdKeywords.add(keyword);
          if (!dryRun) await em.flush();
        }
        groupMessages.push({ code: 'incidents.import.keywordCreated', params: { kind: 'alarm-keyword', value: keyword } });
      }

      // Without a dispatch number each report is an incident of its own, numbered stably for re-imports.
      const dispatchNumber = first['dispatchNumber']?.trim() || `MP-${localDate(begin.toISOString()).slice(0, 4)}-${first['incidentNumber']}-${normalizeName(unit ? unit.numberPrefix : department!.shortName)}`;
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
        createdIncidents.push(incident);
      }
      const current: IncidentEntity = incident;

      let report = current.reports.getItems().find((r) => (unit ? r.unit === unit.key : r.departmentId === department!.id));
      const created = !report;
      // Reports a person has edited in f.orga (or taken over) stay as they are.
      if (report && !report.managedBy) {
        for (const { row } of group) results.push({ row, action: 'unchanged', label, messages: [{ code: 'incidents.import.reportEdited' }] });
        continue;
      }
      report ??= await this.reports.createReport(em, current, unit ? { unit: unit.key } : department!.id, null);
      await em.populate(report, ['personnel', 'vehicles']);
      if (!before.has(report.id)) before.set(report.id, created ? null : releaseSignature(report));

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
          endConfirmed: end > begin && Boolean(time(first['end'])),
          situation: first['situation'] ?? '',
          actions,
          cause: first['cause'] ?? '',
          incidentCommander: first['commander'] ?? '',
          status,
          locked: status !== 'draft',
          lockedBy: status !== 'draft' ? 'MP-Feuer' : null,
          lockedAt: status !== 'draft' ? new Date() : null,
          managedBy: 'mp-feuer',
        });
        // Chargeable applies to the whole incident; one department's report marking it is enough.
        if (yes(first['chargeable'])) current.chargeable = true;
        // A unit report is primary only while the incident has no department report.
        const otherDepartments = current.reports.getItems().some((r) => r !== report && r.departmentId);
        if (group.some((r) => yes(r.values['primary'])) && !(unit && otherDepartments)) await this.reports.setPrimary(em, report, true);
        else if (otherDepartments) report.primary = false;
        // The statistics belong to the incident; MP-Feuer keeps them with the primary report. Statistics f.orga keeps
        // (e.g. corrected by a releaser) are overwritten on a re-import only while MP-Feuer leads.
        if (report.primary && statistics && (external.leading || !current.statistics || createdIncidents.includes(current))) current.statistics = statistics;
        // While MP-Feuer leads, the incident data follow its primary report (f.orga does not change them).
        if (external.leading && report.primary && !createdIncidents.includes(current)) {
          em.assign(current, {
            alarmKeyword: keyword,
            alarmMessage: first['message'] ?? '',
            alarmedAt: begin,
            location: { street: first['street'] ?? '', postalCode: first['postalCode'] ?? '', city: first['city'] ?? '', district: first['district'] ?? '', object: first['object'] ?? '' },
          });
        }

        // Personnel and vehicles come again from the rows; a vehicle removed in MP-Feuer goes as well.
        for (const item of report.personnel.getItems()) em.remove(item);
        report.personnel.removeAll();
        for (const item of report.vehicles.getItems()) em.remove(item);
        report.vehicles.removeAll();
      }
      const date = localDate(begin.toISOString());
      const members = membersOnDate(persons, date);
      for (const [position, { row, values }] of group.entries()) {
        // Messages about the report appear once, at its first row.
        const messages: ImportMessage[] = position === 0 ? [...groupMessages] : [];
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
        const vehicleText = (values['vehicle'] ?? '').trim();
        const vehicle = this.vehicle(vehicles, vehicleText) ?? vehicles.find((v) => vehicleText && v.id === mapped('vehicle', vehicleText));
        const standby = yes(values['standby']);
        const station = standby && department ? this.station(stations, department) : undefined;
        if (vehicleText && !vehicle && !standby) {
          messages.push({ code: 'incidents.api.unknownVehicle', params: { kind: 'vehicle', value: vehicleText } });
          unmatched('vehicle', vehicleText);
        }
        const functionText = (values['function'] ?? '').trim();
        const fn = this.function(functions, functionText) ?? functions.find((f) => f.active && functionText && f.key === mapped('function', functionText));
        if (functionText && !fn) {
          messages.push({ code: 'incidents.import.unknownFunction', params: { kind: 'function', value: functionText } });
          unmatched('function', functionText);
        }
        const vehicleId = standby ? null : (vehicle?.id ?? null);
        const ownVehicle = vehicleId ? this.vehicleTimes(em, report, vehicleId, values) : null;
        // Times equal to those the person inherits (vehicle, else report) are stored as `null` and follow them.
        const inherited = { from: ownVehicle?.alarmedAt ?? report.alarmedAt, to: ownVehicle?.returnedAt ?? report.returnedAt };
        const from = time(values['from']);
        const to = time(values['to']);
        report.personnel.add(
          em.create(ReportPersonnelEntity, {
            report,
            personId: person.id,
            vehicleId,
            standbyStationId: station?.id ?? null,
            function: fn?.key ?? null,
            breathingApparatus: yes(values['breathing']),
            lossOfEarnings: yes(values['lossOfEarnings']),
            from: from && from.getTime() !== inherited.from.getTime() ? from : null,
            to: to && to.getTime() !== inherited.to.getTime() ? to : null,
            allowances: [],
          }),
        );
        results.push({ row, action: created ? 'create' : 'update', label, messages });
      }
      addCrewVehicles(em, report);
    }

    if (!dryRun) {
      await em.flush();
      // `createdVia: import`: modules adding their own reports to new incidents leave imported (historic) ones alone.
      for (const incident of createdIncidents) await this.reports.publishCreated(incident);
      if (external.eventsFrom) await this.announce(before, external.eventsFrom);
    }
    const counts = { create: 0, update: 0, unchanged: 0, error: 0 };
    for (const r of results) counts[r.action]++;
    return { dryRun, counts, rows: results.toSorted((a, b) => a.row - b.row) };
  }

  /**
   * The vehicle of the report with the own times and kilometres of the row (times equal to those of the report are
   * stored as `null`: alarm and return compared with the report's, the departure with its departure, else its alarm);
   * added to the report if missing. Rows without vehicle times leave the vehicle as it is.
   */
  private vehicleTimes(em: EntityManager, report: ReportEntity, vehicleId: string, values: Record<string, string>): ReportVehicleEntity {
    let entry = report.vehicles.getItems().find((v) => v.vehicleId === vehicleId);
    if (!entry) {
      entry = em.create(ReportVehicleEntity, { report, vehicleId, alarmedAt: null, departedAt: null, returnedAt: null, kilometres: null });
      report.vehicles.add(entry);
    }
    const alarmed = time(values['vehicleAlarmedAt']);
    const departed = time(values['vehicleDepartedAt']);
    const returned = time(values['vehicleReturnedAt']);
    const kilometres = Number.parseInt((values['vehicleKilometres'] ?? '').trim(), 10);
    if (alarmed || departed || returned) {
      entry.alarmedAt = alarmed && alarmed.getTime() !== report.alarmedAt.getTime() ? alarmed : null;
      entry.departedAt = departed && departed.getTime() !== (report.departedAt ?? report.alarmedAt).getTime() ? departed : null;
      entry.returnedAt = returned && returned.getTime() !== report.returnedAt.getTime() ? returned : null;
    }
    if (Number.isFinite(kilometres) && kilometres >= 0) entry.kilometres = kilometres;
    return entry;
  }

  /**
   * Tells the other modules about releases of MP-Feuer from `from` on (setting `externalEventsFrom`), like a release in
   * f.orga: a released report whose release data changed is announced (compensation items are created or corrected),
   * a report MP-Feuer no longer marks as released is withdrawn.
   */
  private async announce(before: Map<string, string | null>, from: string): Promise<void> {
    const em = this.em.fork();
    const reports = await em.find(ReportEntity, { id: { $in: [...before.keys()] }, alarmedAt: { $gte: berlinDayStart(from) } }, { populate: REPORT_POPULATE });
    for (const report of reports) {
      const previous = before.get(report.id) ?? null;
      const wasReleased = previous !== null && released(JSON.parse(previous)[0] as ReportStatus);
      if (released(report.status)) {
        if (releaseSignature(report) !== previous) await this.reports.publishReleased(em, report, report.status === 'released-billing' ? 'billing' : 'compensation');
      } else if (wasReleased) {
        await this.reports.publishUnlocked(report, 'mp-feuer');
      }
    }
  }

  /** Unit by key, name or short name, e.g. `duty-officer`, "Einsatzleiter vom Dienst", "EvD". */
  private unit(units: IncidentUnit[], value: string): IncidentUnit | undefined {
    const wanted = normalizeName(value);
    return units.find((u) => u.key === value || [u.label.de, u.label.en, u.shortLabel.de, u.shortLabel.en].some((n) => normalizeName(n) === wanted));
  }

  private department(departments: Department[], value: string): Department | undefined {
    const wanted = normalizeName(value);
    return departments.find((d) => normalizeName(d.name) === wanted || normalizeName(d.shortName) === wanted);
  }

  private vehicle(vehicles: Vehicle[], value: string): Vehicle | undefined {
    const wanted = normalizeHeading(value);
    if (!wanted) return undefined;
    return vehicles.find((v) => normalizeHeading(v.radioCallSign) === wanted || normalizeHeading(v.designation) === wanted) ?? findByAlias(vehicles, value);
  }

  /** Function by name, abbreviation or alias of the catalog, e.g. "Maschinist", "GF", "EvD". */
  private function(functions: CatalogEntry[], value: string): CatalogEntry | undefined {
    const wanted = normalizeHeading(value);
    if (!wanted) return undefined;
    return functions.find(
      (f) => f.active && [f.name.de, f.name.en, String(f.attributes['abbreviation'] ?? '')].some((n) => n && normalizeHeading(n) === wanted),
    ) ?? functions.find((f) => f.active && hasAlias(f.aliases, value));
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
