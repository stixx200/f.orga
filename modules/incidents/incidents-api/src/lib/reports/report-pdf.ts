import { Inject, Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { brigadeLogoDataUrl, pdfHeaderCell, PDF_TABLE_LAYOUT, renderLetterPdf, SettingsService } from '@forga/core-api';
import type { BrigadeSettings, Language } from '@forga/core-contracts';
import type { IncidentStatistics, PartyRole } from '@forga/incidents-contracts';
import { ORGANIZATION, type Organization } from '@forga/masterdata-contracts';
import { locationText } from '../data/incidents.lookup.js';
import type { ReportEntity } from '../incidents.entities.js';
import { ReportsService } from './reports.service.js';

/** Texts of the report PDF in both languages. */
const TEXT = {
  de: {
    title: (number: string) => `Einsatzbericht ${number}`,
    primary: 'Hauptbericht',
    secondary: 'Nebenbericht',
    incident: 'Einsatz',
    dispatchNumber: 'Leitstellennummer',
    keyword: 'Stichwort',
    alarmMessage: 'Meldebild',
    location: 'Einsatzort',
    department: 'Abteilung',
    status: 'Status',
    author: 'Verfasser',
    commander: 'Einsatzleiter',
    times: 'Zeiten',
    alarmedAt: 'Alarmierung',
    departedAt: 'Ausrücken',
    arrivedAt: 'Eintreffen',
    endedAt: 'Einsatzende',
    returnedAt: 'Einsatzbereit',
    personnel: 'Personal',
    name: 'Name',
    place: 'Fahrzeug / Bereitschaft',
    function: 'Funktion',
    from: 'von',
    to: 'bis',
    hours: 'Std.',
    breathing: 'AS',
    standby: 'Bereitschaft',
    guest: 'Gast',
    vehicles: 'Fahrzeuge',
    vehicle: 'Fahrzeug',
    kilometres: 'km',
    narrative: 'Lage und Verlauf',
    situation: 'Lage bei Eintreffen',
    actions: 'Maßnahmen / Verlauf',
    cause: 'Ursache',
    equipment: 'Geräte und Material',
    statistics: 'Statistik',
    noStatistics: 'Keine Statistikmerkmale erfasst.',
    parties: 'Beteiligte',
    role: 'Rolle',
    address: 'Anschrift',
    agencies: 'Sonstige Kräfte',
    organization: 'Organisation',
    forces: 'Kräfte',
    none: '–',
    yes: 'ja',
    statusNames: { draft: 'Entwurf', review: 'Zur Prüfung', 'released-compensation': 'Freigabe Entschädigung', 'released-billing': 'Freigabe Abrechnung' },
    roles: { 'injured-party': 'Geschädigte/r', causer: 'Verursacher/in', witness: 'Zeuge/Zeugin', owner: 'Eigentümer/in', 'vehicle-keeper': 'Fahrzeughalter/in', caller: 'Anrufer/in', other: 'Sonstige' },
    mainTypes: { fire: 'Brand / Explosion', 'technical-assistance': 'Technische Hilfe', 'false-alarm': 'Fehlalarm', other: 'Sonstiges' },
    place2: { own: 'eigene Gemeinde', overland: 'Überlandhilfe' },
    fireSize: 'Brandgröße',
    fireSizes: { 'small-a': 'Kleinbrand A', 'small-b': 'Kleinbrand B', medium: 'Mittelbrand', large: 'Großbrand' },
    technicalCategory: 'Technische Hilfe',
    technical: {
      'rescue-persons': 'Menschenrettung', 'hazardous-materials': 'Gefahrstoff', 'oil-trace': 'Ölspur', 'animal-rescue': 'Tierrettung',
      insects: 'Insekten', 'flood-weather': 'Hochwasser / Unwetter', storm: 'Sturm', other: 'sonstige Technische Hilfe',
    },
    falseAlarmType: 'Fehlalarm',
    falseAlarm: { 'good-faith': 'in gutem Glauben', malicious: 'böswillig', 'fire-alarm-system': 'Brandmeldeanlage' },
    rescued: 'Gerettete Personen',
    rescuedSmoke: 'davon Rauchgas',
    dead: 'Tote',
    animals: 'Gerettete Tiere',
    flags: { vehicleFire: 'Fahrzeugbrand', trafficAccident: 'Verkehrsunfall', disasterPreAlarm: 'Katastrophen-Voralarm', disasterOperation: 'Katastrophen-Einsatz' },
  },
  en: {
    title: (number: string) => `Incident report ${number}`,
    primary: 'Primary report',
    secondary: 'Secondary report',
    incident: 'Incident',
    dispatchNumber: 'Dispatch number',
    keyword: 'Keyword',
    alarmMessage: 'Alarm message',
    location: 'Location',
    department: 'Department',
    status: 'Status',
    author: 'Author',
    commander: 'Incident commander',
    times: 'Times',
    alarmedAt: 'Alarm',
    departedAt: 'Departure',
    arrivedAt: 'Arrival',
    endedAt: 'End of operation',
    returnedAt: 'Ready again',
    personnel: 'Personnel',
    name: 'Name',
    place: 'Vehicle / standby',
    function: 'Function',
    from: 'from',
    to: 'until',
    hours: 'Hrs.',
    breathing: 'BA',
    standby: 'Standby',
    guest: 'Guest',
    vehicles: 'Vehicles',
    vehicle: 'Vehicle',
    kilometres: 'km',
    narrative: 'Situation and course',
    situation: 'Situation on arrival',
    actions: 'Actions / course',
    cause: 'Cause',
    equipment: 'Equipment and material',
    statistics: 'Statistics',
    noStatistics: 'No statistics entered.',
    parties: 'Involved parties',
    role: 'Role',
    address: 'Address',
    agencies: 'Other agencies',
    organization: 'Organization',
    forces: 'Forces',
    none: '–',
    yes: 'yes',
    statusNames: { draft: 'Draft', review: 'For review', 'released-compensation': 'Released for compensation', 'released-billing': 'Released for billing' },
    roles: { 'injured-party': 'Injured party', causer: 'Causer', witness: 'Witness', owner: 'Owner', 'vehicle-keeper': 'Vehicle keeper', caller: 'Caller', other: 'Other' },
    mainTypes: { fire: 'Fire / explosion', 'technical-assistance': 'Technical assistance', 'false-alarm': 'False alarm', other: 'Other' },
    place2: { own: 'own municipality', overland: 'assistance elsewhere' },
    fireSize: 'Fire size',
    fireSizes: { 'small-a': 'Small fire A', 'small-b': 'Small fire B', medium: 'Medium fire', large: 'Large fire' },
    technicalCategory: 'Technical assistance',
    technical: {
      'rescue-persons': 'Rescue of persons', 'hazardous-materials': 'Hazardous materials', 'oil-trace': 'Oil trace', 'animal-rescue': 'Animal rescue',
      insects: 'Insects', 'flood-weather': 'Flood / severe weather', storm: 'Storm', other: 'Other technical assistance',
    },
    falseAlarmType: 'False alarm',
    falseAlarm: { 'good-faith': 'in good faith', malicious: 'malicious', 'fire-alarm-system': 'Fire alarm system' },
    rescued: 'Rescued persons',
    rescuedSmoke: 'thereof smoke inhalation',
    dead: 'Dead',
    animals: 'Rescued animals',
    flags: { vehicleFire: 'Vehicle fire', trafficAccident: 'Traffic accident', disasterPreAlarm: 'Disaster pre-alarm', disasterOperation: 'Disaster operation' },
  },
};

type Texts = (typeof TEXT)['de'];

/** The incident report as PDF in the letter style of the brigade (letterhead or coat of arms, footer with pages). */
@Injectable()
export class ReportPdf {
  constructor(
    private readonly reports: ReportsService,
    private readonly settings: SettingsService,
    @Inject(ORGANIZATION) private readonly organization: Organization,
  ) {}

  async render(em: EntityManager, report: ReportEntity, language: Language): Promise<{ fileName: string; pdf: Buffer }> {
    const t: Texts = TEXT[language];
    const context = await this.reports.contextFor(report);
    const dto = await this.reports.toDto(em, report, context);
    const [stations, functions] = await Promise.all([this.organization.stations(), this.organization.catalog('function')]);
    const locale = language === 'de' ? 'de-DE' : 'en-GB';
    const dateTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Berlin' }) : t.none);
    const clock = (iso: string) => new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
    const person = (id: string | null) => {
      const p = id ? context.persons.get(id) : undefined;
      return p ? `${p.lastName}, ${p.firstName}` : '';
    };
    const vehicle = (id: string | null) => (id ? (context.vehicles.get(id)?.designation ?? '') : '');
    const functionName = (key: string | null) => {
      const entry = functions.find((f) => f.key === key);
      return entry ? entry.name[language] : '';
    };
    const incident = report.incident;
    const keyword = context.keywords.get(incident.alarmKeyword);
    // The report of a brigade-wide unit (e.g. the duty officer) carries the name of the unit instead of a department.
    const unit = this.reports.unitOf(report);
    const department = report.departmentId ? (context.departments.get(report.departmentId)?.name ?? '') : (unit?.label[language] ?? report.unit ?? '');

    const field = (label: string, value: string) => [{ text: label, color: '#6B6B6B' }, { text: value || t.none }];
    const facts = (rows: [string, string][]) => ({
      table: { widths: [130, '*'], body: rows.map(([label, value]) => field(label, value)) },
      layout: 'noBorders',
      margin: [0, 0, 0, 4],
    });

    const content: unknown[] = [
      { text: t.title(report.number), style: 'title' },
      { text: [department, ...(unit ? [] : [report.primary ? t.primary : t.secondary]), t.statusNames[dto.status]].join(' · '), style: 'small', margin: [0, 0, 0, 8] },
      heading(t.incident),
      facts([
        [t.dispatchNumber, incident.dispatchNumber],
        [t.keyword, [incident.alarmKeyword, keyword ? keyword.name[language] : ''].filter(Boolean).join(' – ')],
        [t.alarmMessage, incident.alarmMessage],
        [t.location, [locationText(incident.location), incident.location.object].filter(Boolean).join(' · ')],
        [t.author, person(report.authorPersonId ?? null)],
        [t.commander, report.incidentCommander],
      ]),
      heading(t.times),
      facts([
        [t.alarmedAt, dateTime(dto.times.alarmedAt)],
        [t.departedAt, dateTime(dto.times.departedAt)],
        [t.arrivedAt, dateTime(dto.times.arrivedAt)],
        [t.endedAt, dateTime(dto.times.endedAt)],
        [t.returnedAt, dateTime(dto.times.returnedAt)],
      ]),
      heading(`${t.personnel} (${dto.personnel.length})`),
      dto.personnel.length
        ? table(
            ['*', 110, 80, 40, 40, 32, 28],
            [t.name, t.place, t.function, t.from, t.to, t.hours, t.breathing],
            dto.personnel.map((p) => [
              p.personId ? person(p.personId) : `${p.guestName} (${t.guest})`,
              p.standbyStationId ? `${t.standby} ${stations.find((s) => s.id === p.standbyStationId)?.name ?? ''}`.trim() : vehicle(p.vehicleId),
              functionName(p.function),
              clock(p.from),
              clock(p.to),
              String(p.compensation.hours).replace('.', language === 'de' ? ',' : '.'),
              p.breathingApparatus ? (p.breathingMinutes ? `${p.breathingMinutes}′` : t.yes) : '',
            ]),
            ['left', 'left', 'left', 'left', 'left', 'right', 'left'],
          )
        : { text: t.none },
      ...(dto.vehicles.length
        ? [
            heading(t.vehicles),
            table(
              ['*', 90, 90, 50],
              [t.vehicle, t.departedAt, t.returnedAt, t.kilometres],
              dto.vehicles.map((v) => [vehicle(v.vehicleId), v.departedAt ? dateTime(v.departedAt) : '', v.returnedAt ? dateTime(v.returnedAt) : '', v.kilometres === null ? '' : String(v.kilometres)]),
              ['left', 'left', 'left', 'right'],
            ),
          ]
        : []),
      heading(t.narrative),
      ...paragraph(t.situation, report.situation),
      ...paragraph(t.actions, report.actions),
      ...paragraph(t.cause, report.cause),
      ...paragraph(t.equipment, report.equipment),
      ...(report.primary ? [heading(t.statistics), statisticsBlock(report.statistics ?? null, t)] : []),
      ...(dto.involvedParties.length
        ? [
            heading(t.parties),
            table(
              [90, '*', '*'],
              [t.role, t.name, t.address],
              dto.involvedParties.map((p) => [t.roles[p.role as PartyRole], p.name, [p.street, [p.postalCode, p.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')]),
            ),
          ]
        : []),
      ...(dto.otherAgencies.length
        ? [
            heading(t.agencies),
            table(
              ['*', 50, 50, '*'],
              [t.organization, t.forces, t.vehicles, ''],
              dto.otherAgencies.map((a) => [a.organization, a.forces === null ? '' : String(a.forces), a.vehicles === null ? '' : String(a.vehicles), a.notes]),
              ['left', 'right', 'right', 'left'],
            ),
          ]
        : []),
    ];

    const brigade = await this.settings.get<BrigadeSettings>('brigade');
    const pdf = await renderLetterPdf({
      brigade,
      letterhead: await brigadeLogoDataUrl(em, 'letterhead'),
      logo: await brigadeLogoDataUrl(em),
      title: `${t.title(report.number)} · ${incident.dispatchNumber}`,
      content,
      language,
      now: new Date(),
    });
    const fileName = `${language === 'de' ? 'Einsatzbericht' : 'Incident-report'}_${incident.dispatchNumber}_${report.number}.pdf`.replace(/[^\w.-]+/g, '_');
    return { fileName, pdf };
  }
}

const heading = (text: string) => ({ text, style: 'heading' });

const paragraph = (label: string, text: string) => (text.trim() ? [{ text: label, bold: true, margin: [0, 4, 0, 2] }, { text }] : []);

function table(widths: (number | string)[], header: string[], rows: string[][], align: ('left' | 'right')[] = []) {
  return {
    table: {
      headerRows: 1,
      dontBreakRows: true,
      widths,
      body: [header.map((h, i) => pdfHeaderCell(h, align[i])), ...rows.map((row) => row.map((text, i) => ({ text, alignment: align[i] ?? 'left' })))],
    },
    layout: PDF_TABLE_LAYOUT,
    margin: [0, 2, 0, 6],
  };
}

function statisticsBlock(statistics: IncidentStatistics | null, t: Texts): unknown {
  if (!statistics) return { text: t.noStatistics };
  const rows: [string, string][] = [[t.mainTypes[statistics.mainType], statistics.ownMunicipality ? t.place2.own : t.place2.overland]];
  if (statistics.fireSize) rows.push([t.fireSize, t.fireSizes[statistics.fireSize]]);
  if (statistics.technicalCategory) rows.push([t.technicalCategory, t.technical[statistics.technicalCategory]]);
  if (statistics.falseAlarmType) rows.push([t.falseAlarmType, t.falseAlarm[statistics.falseAlarmType]]);
  const flags = (Object.keys(t.flags) as (keyof Texts['flags'])[]).filter((flag) => statistics[flag]).map((flag) => t.flags[flag]);
  if (flags.length) rows.push(['', flags.join(', ')]);
  if (statistics.rescued) rows.push([t.rescued, `${statistics.rescued}${statistics.rescuedSmokeInhalation ? ` (${t.rescuedSmoke} ${statistics.rescuedSmokeInhalation})` : ''}`]);
  if (statistics.dead) rows.push([t.dead, String(statistics.dead)]);
  if (statistics.animalsRescued) rows.push([t.animals, String(statistics.animalsRescued)]);
  return {
    table: { widths: [130, '*'], body: rows.map(([label, value]) => [{ text: label, color: '#6B6B6B' }, { text: value }]) },
    layout: 'noBorders',
  };
}
