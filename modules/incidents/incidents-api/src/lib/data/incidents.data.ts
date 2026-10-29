import { Inject, Injectable } from '@nestjs/common';
import { type EntityClass, EntityManager, type FilterQuery, wrap } from '@mikro-orm/core';
import { type AuthenticatedUser, type DescribeContext, type PersonDataSection, wordsWhere } from '@forga/core-api';
import type { SearchHit } from '@forga/core-contracts';
import type { ReportStatus } from '@forga/incidents-contracts';
import { ORGANIZATION, type Organization } from '@forga/masterdata-contracts';
import {
  AlarmKeywordEntity,
  IncidentEntity,
  InvolvedPartyEntity,
  OtherAgencyEntity,
  ReportEntity,
  ReportPersonnelEntity,
  ReportVehicleEntity,
  StatisticsYearEntity,
} from '../incidents.entities.js';
import { ReportsService } from '../reports/reports.service.js';

const LOCATION_FIELDS = ['street', 'object', 'city', 'district'] as const;

const plain = async <T extends object>(em: EntityManager, entity: EntityClass<T>, where: object = {}) =>
  (await em.find(entity, where as never)).map((e) => wrap(e).toObject());

/** Search and full export of the incident reports. */
@Injectable()
export class IncidentsData {
  constructor(
    private readonly em: EntityManager,
    private readonly reports: ReportsService,
    @Inject(ORGANIZATION) private readonly organization: Organization,
  ) {}

  async search(user: AuthenticatedUser, query: string): Promise<SearchHit[]> {
    // The location is JSON: street, object, city and district are searched as JSON properties.
    const words = wordsWhere(query, ['dispatchNumber', 'alarmKeyword', 'alarmMessage'], (like) =>
      LOCATION_FIELDS.map((field) => ({ location: { [field]: { $ilike: like } } })),
    );
    if (!words) return [];
    const where: FilterQuery<IncidentEntity>[] = [words as FilterQuery<IncidentEntity>];
    const readable = this.reports.readableFilter(user);
    if (!readable) return [];
    if (Object.keys(readable).length) where.push({ reports: readable });
    const incidents = await this.em.fork().find(IncidentEntity, { $and: where }, { orderBy: { alarmedAt: 'desc' }, limit: 8 });
    return incidents.map((i) => ({
      id: i.id,
      group: { de: 'Einsätze', en: 'Incidents' },
      title: `${i.alarmKeyword} · ${i.dispatchNumber}`,
      description: [i.alarmMessage, i.location.object, i.location.city, [i.location.street, i.location.houseNumber].filter(Boolean).join(' ')].filter(Boolean).join(', '),
      to: `/incidents/incidents/${i.id}`,
    }));
  }

  async exportAll(): Promise<Record<string, unknown>> {
    const em = this.em.fork();
    return {
      keywords: await plain(em, AlarmKeywordEntity),
      incidents: await plain(em, IncidentEntity),
      reports: await plain(em, ReportEntity),
      personnel: await plain(em, ReportPersonnelEntity),
      vehicles: await plain(em, ReportVehicleEntity),
      involvedParties: await plain(em, InvolvedPartyEntity),
      otherAgencies: await plain(em, OtherAgencyEntity),
      statisticsYears: await plain(em, StatisticsYearEntity),
    };
  }

  async exportPerson(personId: string): Promise<Record<string, unknown>> {
    const em = this.em.fork();
    return {
      assignments: await plain(em, ReportPersonnelEntity, { personId }),
      authoredReports: (await em.find(ReportEntity, { authorPersonId: personId })).map((r) => ({ id: r.id, number: r.number })),
    };
  }

  /**
   * Access report: one row per incident the person took part in, with the own function, vehicle and times only; the rest
   * of the crew, involved parties and the free texts of the report (which may name others) are left out. Reports the
   * person wrote appear with number and status.
   */
  async describePerson(personId: string, ctx: DescribeContext): Promise<PersonDataSection[]> {
    const em = this.em.fork();
    const assignments = await em.find(ReportPersonnelEntity, { personId }, { populate: ['report.incident'] });
    const authored = await em.find(ReportEntity, { authorPersonId: personId }, { populate: ['incident'] });
    if (!assignments.length && !authored.length) return [];
    const [vehicles, stations, functions, departments, keywords] = await Promise.all([
      this.organization.vehicles({ includeRetired: true }),
      this.organization.stations(),
      this.organization.catalog('function'),
      this.organization.departments(),
      em.find(AlarmKeywordEntity, {}),
    ]);
    const vehicleName = new Map(vehicles.map((v) => [v.id, v.designation]));
    const stationName = new Map(stations.map((s) => [s.id, s.name]));
    const functionName = new Map(functions.map((f) => [f.key, ctx.text(f.name)]));
    const departmentName = new Map(departments.map((d) => [d.id, d.shortName || d.name]));
    const keywordName = new Map(keywords.map((k) => [k.key, ctx.text(k.name)]));
    const keyword = (incident: IncidentEntity) => {
      const name = keywordName.get(incident.alarmKeyword);
      return name && name !== incident.alarmKeyword ? `${incident.alarmKeyword} ${name}` : incident.alarmKeyword;
    };
    // Only the district or municipality: street and house number would point at the people concerned.
    const place = (incident: IncidentEntity) => ctx.value(incident.location.district || incident.location.city);
    const unit = (report: ReportEntity) => (report.departmentId ? departmentName.get(report.departmentId) : this.reports.unitOf(report)?.label[ctx.language]) ?? '';
    const sorted = assignments.toSorted((a, b) => b.report.incident.alarmedAt.getTime() - a.report.incident.alarmedAt.getTime());
    const years = new Map<string, { incidents: Set<string>; hours: number }>();
    const rows = sorted.map((a) => {
      const report = a.report;
      const incident = report.incident;
      const from = a.from ?? report.alarmedAt;
      const to = a.to ?? report.returnedAt;
      const year = ctx.date(incident.alarmedAt).slice(-4);
      const sum = years.get(year) ?? { incidents: new Set<string>(), hours: 0 };
      sum.incidents.add(incident.id);
      sum.hours += Math.max(0, (to.getTime() - from.getTime()) / 3_600_000);
      years.set(year, sum);
      const breathing = a.breathingApparatus
        ? [ctx.t('ja', 'yes'), a.breathingMinutes ? `${a.breathingMinutes} min` : '', a.chemicalSuit ? ctx.t('Chemikalienschutzanzug', 'chemical protection suit') : ''].filter(Boolean).join(', ')
        : a.chemicalSuit
          ? ctx.t('Chemikalienschutzanzug', 'chemical protection suit')
          : ctx.t('nein', 'no');
      return [
        ctx.date(incident.alarmedAt),
        keyword(incident),
        place(incident),
        unit(report) || '–',
        ctx.value(a.function ? (functionName.get(a.function) ?? a.function) : null),
        a.standbyStationId ? ctx.t(`Bereitschaft ${stationName.get(a.standbyStationId) ?? ''}`.trim(), `standby ${stationName.get(a.standbyStationId) ?? ''}`.trim()) : ctx.value(a.vehicleId ? vehicleName.get(a.vehicleId) : null),
        `${ctx.time(from)}–${ctx.time(to)}`,
        breathing,
        a.killed ? ctx.t('tödlich verletzt', 'killed') : ctx.yesNo(a.injured),
        [a.lossOfEarnings ? ctx.t('Verdienstausfall', 'loss of earnings') : '', a.duringWorkingHours ? ctx.t('während der Arbeitszeit', 'during working hours') : '', a.bookedVia === 'info-terminal' ? ctx.t('am Infoterminal eingetragen', 'booked at the info terminal') : '']
          .filter(Boolean)
          .join(', ') || '–',
      ];
    });
    const status: Record<ReportStatus, string> = {
      draft: ctx.t('Entwurf', 'draft'),
      review: ctx.t('zur Prüfung', 'in review'),
      'released-compensation': ctx.t('freigegeben (Entschädigung)', 'released (compensation)'),
      'released-billing': ctx.t('freigegeben (Abrechnung)', 'released (billing)'),
    };
    const blocks: PersonDataSection['blocks'] = [];
    if (rows.length) {
      blocks.push({
        kind: 'table',
        title: ctx.t('Ihre Einsätze', 'Your incidents'),
        columns: [
          ctx.t('Datum', 'Date'),
          ctx.t('Stichwort', 'Keyword'),
          ctx.t('Ort', 'Place'),
          ctx.t('Abteilung', 'Department'),
          ctx.t('Funktion', 'Function'),
          ctx.t('Fahrzeug', 'Vehicle'),
          ctx.t('Zeit', 'Time'),
          ctx.t('Atemschutz', 'Breathing apparatus'),
          ctx.t('Verletzt', 'Injured'),
          ctx.t('Hinweise', 'Notes'),
        ],
        rows,
        summary: [...years].map(([year, sum]) =>
          ctx.t(`${year}: ${sum.incidents.size} ${sum.incidents.size === 1 ? 'Einsatz' : 'Einsätze'}, ${ctx.number(sum.hours, 1)} Stunden`, `${year}: ${sum.incidents.size} ${sum.incidents.size === 1 ? 'incident' : 'incidents'}, ${ctx.number(sum.hours, 1)} hours`),
        ),
      });
    }
    if (authored.length) {
      blocks.push({
        kind: 'table',
        title: ctx.t('Einsatzberichte, die Sie verfasst haben', 'Incident reports you wrote'),
        columns: [ctx.t('Datum', 'Date'), ctx.t('Stichwort', 'Keyword'), ctx.t('Bericht', 'Report'), ctx.t('Stand', 'Status')],
        rows: authored
          .toSorted((a, b) => b.incident.alarmedAt.getTime() - a.incident.alarmedAt.getTime())
          .map((r) => [ctx.date(r.incident.alarmedAt), keyword(r.incident), [unit(r), r.number].filter(Boolean).join(' '), status[r.status as ReportStatus]]),
      });
    }
    blocks.push({
      kind: 'text',
      text: ctx.t(
        'Andere Einsatzkräfte, Geschädigte, Zeugen und die Beschreibung des Einsatzes sind nicht aufgeführt (Art. 15 Abs. 4 DSGVO).',
        'Other members of the crew, injured parties, witnesses and the description of the incident are not listed (Art. 15(4) GDPR).',
      ),
    });
    return [
      {
        key: 'incidents',
        title: ctx.t('Einsätze', 'Incidents'),
        activity: 'incidents.reports',
        categories: [ctx.t('Einsatzzeiten und Funktionen', 'Incident times and functions'), ctx.t('Atemschutzeinsätze', 'Breathing apparatus operations')],
        health: assignments.some((a) => a.injured || a.killed),
        blocks,
        records: [{ entity: 'incidents.report_personnel', ids: assignments.map((a) => a.id), label: ctx.t('Einsatzteilnahme', 'Participation') }],
      },
    ];
  }
}
