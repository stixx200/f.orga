import { Inject, Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { berlinDayAfter, berlinDayStart } from '@forga/core-api';
import type { ChargeableIncident, CompensationPreview, CompensationRate, IncidentForCostRecovery, IncidentsLookup, Location, ReportReference, Rounding } from '@forga/incidents-contracts';
import { PERSON_DIRECTORY, type PersonDirectory } from '@forga/masterdata-contracts';
import { AlarmKeywordEntity, IncidentEntity, ReportEntity } from '../incidents.entities.js';
import { computeCompensation } from '../domain/compensation.js';
import { ReportContextLoader } from '../reports/report-context.js';
import { assignmentTimes } from '../reports/reports.service.js';

const POPULATE = ['reports', 'reports.personnel', 'reports.vehicles', 'reports.involvedParties'] as const;

export const locationText = (l: Location) => [[l.street, l.houseNumber].filter(Boolean).join(' '), [l.postalCode, l.city].filter(Boolean).join(' '), l.district].filter(Boolean).join(', ');

const toReference = (r: ReportEntity): ReportReference => ({
  reportId: r.id,
  reportNumber: r.number,
  departmentId: r.departmentId,
  status: r.status,
  locked: r.locked,
  incidentId: r.incident.id,
  dispatchNumber: r.incident.dispatchNumber,
  alarmKeyword: r.incident.alarmKeyword,
  alarmedAt: r.incident.alarmedAt.toISOString(),
  location: locationText(r.incident.location),
});

/** Incidents for other modules (`INCIDENTS_LOOKUP`), e.g. for cost recovery notices. */
@Injectable()
export class IncidentsLookupService implements IncidentsLookup {
  constructor(
    private readonly em: EntityManager,
    @Inject(PERSON_DIRECTORY) private readonly directory: PersonDirectory,
    private readonly contexts: ReportContextLoader,
  ) {}

  private async summary(incident: IncidentEntity): Promise<ChargeableIncident> {
    const reports = incident.reports.getItems();
    const primary = reports.find((r) => r.primary) ?? reports[0];
    const keyword = await this.em.fork().findOne(AlarmKeywordEntity, { key: incident.alarmKeyword });
    return {
      incidentId: incident.id,
      dispatchNumber: incident.dispatchNumber,
      alarmKeyword: incident.alarmKeyword,
      alarmedAt: incident.alarmedAt.toISOString(),
      location: locationText(incident.location),
      object: incident.location.object,
      mainType: primary?.statistics?.mainType ?? keyword?.mainType ?? null,
      falseAlarmType: primary?.statistics?.falseAlarmType ?? keyword?.falseAlarmType ?? null,
      released: reports.length > 0 && reports.every((r) => r.status.startsWith('released')),
      departmentIds: reports.map((r) => r.departmentId),
      chargeableReason: incident.chargeableReason,
    };
  }

  async chargeable(from: string, to: string): Promise<ChargeableIncident[]> {
    const incidents = await this.em.fork().find(
      IncidentEntity,
      { alarmedAt: { $gte: berlinDayStart(from), $lt: berlinDayAfter(to) }, chargeable: true },
      { populate: ['reports'], orderBy: { alarmedAt: 'desc' } },
    );
    return Promise.all(incidents.map((i) => this.summary(i)));
  }

  async reports(reportIds: readonly string[]): Promise<ReportReference[]> {
    if (!reportIds.length) return [];
    const reports = await this.em.fork().find(ReportEntity, { id: { $in: [...reportIds] } }, { populate: ['incident'] });
    return reports.map(toReference).toSorted((a, b) => b.alarmedAt.localeCompare(a.alarmedAt));
  }

  async unreleased(from: string, to: string): Promise<ReportReference[]> {
    const reports = await this.em.fork().find(
      ReportEntity,
      { status: { $in: ['draft', 'review'] }, incident: { alarmedAt: { $gte: berlinDayStart(from), $lt: berlinDayAfter(to) } } },
      { populate: ['incident'] },
    );
    return reports.map(toReference).toSorted((a, b) => a.alarmedAt.localeCompare(b.alarmedAt));
  }

  async inPeriod(from: string, to: string): Promise<ReportReference[]> {
    const reports = await this.em.fork().find(ReportEntity, { incident: { alarmedAt: { $gte: berlinDayStart(from), $lt: berlinDayAfter(to) } } }, { populate: ['incident'] });
    return reports.map(toReference).toSorted((a, b) => b.alarmedAt.localeCompare(a.alarmedAt));
  }

  async compensationPreview(incidentId: string, statute: { rates: CompensationRate[]; rounding: Rounding; minimumHours: number | null }): Promise<CompensationPreview | null> {
    const incident = await this.em.fork().findOne(IncidentEntity, incidentId, { populate: ['reports', 'reports.personnel'] });
    if (!incident) return null;
    const settings = { ...(await this.contexts.settingsOnly()), ...statute };
    const keyword = await this.em.fork().findOne(AlarmKeywordEntity, { key: incident.alarmKeyword });
    const kind = keyword?.compensationKind ?? 'incident';
    const reports = incident.reports.getItems();
    const persons = new Map(
      (await this.directory.summaries([...new Set(reports.flatMap((r) => r.personnel.getItems().flatMap((p) => (p.personId ? [p.personId] : []))))])).map((p) => [p.id, `${p.lastName}, ${p.firstName}`]),
    );
    return {
      incidentId: incident.id,
      dispatchNumber: incident.dispatchNumber,
      alarmKeyword: incident.alarmKeyword,
      alarmedAt: incident.alarmedAt.toISOString(),
      compensationKind: kind,
      reports: reports.map((r) => ({
        reportId: r.id,
        reportNumber: r.number,
        departmentId: r.departmentId,
        status: r.status,
        personnel: r.personnel.getItems().map((p) => {
          const times = assignmentTimes(p, r);
          const standby = Boolean(p.standbyStationId);
          const computed = computeCompensation(
            { ...times, guest: !p.personId, standby, duringWorkingHours: p.duringWorkingHours, allowances: p.allowances, override: p.compensationOverride ?? null },
            settings,
            kind,
          );
          return { personId: p.personId ?? null, name: p.personId ? (persons.get(p.personId) ?? '') : p.guestName, ...times, standby, duringWorkingHours: p.duringWorkingHours, ...computed };
        }),
      })),
    };
  }

  async forCostRecovery(incidentId: string): Promise<IncidentForCostRecovery | null> {
    const incident = await this.em.fork().findOne(IncidentEntity, incidentId, { populate: POPULATE });
    if (!incident) return null;
    const keyword = await this.em.fork().findOne(AlarmKeywordEntity, { key: incident.alarmKeyword });
    const persons = new Map(
      (await this.directory.summaries([...new Set(incident.reports.getItems().flatMap((r) => r.personnel.getItems().flatMap((p) => (p.personId ? [p.personId] : []))))])).map((p) => [p.id, `${p.lastName}, ${p.firstName}`]),
    );
    return {
      ...(await this.summary(incident)),
      alarmMessage: incident.alarmMessage,
      notes: incident.notes,
      compensationKind: keyword?.compensationKind ?? 'incident',
      reports: incident.reports.getItems().toSorted((a, b) => Number(b.primary) - Number(a.primary)).map((r) => ({
        reportId: r.id,
        departmentId: r.departmentId,
        status: r.status,
        number: r.number,
        situation: r.situation,
        actions: r.actions,
        cause: r.cause,
        incidentCommander: r.incidentCommander,
        alarmedAt: r.alarmedAt.toISOString(),
        departedAt: r.departedAt?.toISOString() ?? null,
        returnedAt: r.returnedAt.toISOString(),
        personnel: r.personnel.getItems().map((p) => ({
          personId: p.personId ?? null,
          name: p.personId ? (persons.get(p.personId) ?? '') : p.guestName,
          vehicleId: p.vehicleId ?? null,
          ...assignmentTimes(p, r),
          standby: Boolean(p.standbyStationId),
        })),
        vehicles: r.vehicles.getItems().map((v) => ({ vehicleId: v.vehicleId, departedAt: v.departedAt?.toISOString() ?? null, returnedAt: v.returnedAt?.toISOString() ?? null })),
        parties: r.involvedParties.getItems().map((p) => ({ role: p.role, name: p.name, street: p.street, postalCode: p.postalCode, city: p.city })),
      })),
    };
  }
}
