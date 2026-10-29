import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager, LockMode } from '@mikro-orm/core';
import {
  BOOKED_VIA_TERMINAL,
  type BookingWindowSettings,
  bookingWindow,
  effectiveTimes,
  IncidentInput,
  type IncidentsTerminalBooking,
  type TerminalActor,
  TerminalBookingInput,
  type TerminalEntry,
  TerminalIncidentInput,
  type TerminalIncidentMatch,
  type TerminalReport,
  type TerminalReportDetail,
  windowOpen,
} from '@forga/incidents-contracts';
import { ORGANIZATION, type Organization, PERSON_DIRECTORY, type PersonDirectory } from '@forga/masterdata-contracts';
import type { z } from 'zod';
import { AlarmKeywordEntity, IncidentEntity, ReportEntity, ReportPersonnelEntity, ReportRevisionEntity } from '../incidents.entities.js';
import { addCrewVehicles, normalized, REPORT_POPULATE, reportToInput, ReportsService, vehicleTimes } from '../reports/reports.service.js';

const MAX_REVISIONS = 50;
const iso = (date: Date | null | undefined) => (date ? date.toISOString() : null);

function toEntry(p: ReportPersonnelEntity): TerminalEntry {
  return {
    personId: p.personId as string,
    vehicleId: p.vehicleId ?? null,
    standbyStationId: p.standbyStationId ?? null,
    function: p.function ?? null,
    breathingApparatus: p.breathingApparatus,
    from: iso(p.from),
    to: iso(p.to),
    lossOfEarnings: p.lossOfEarnings,
    duringWorkingHours: p.duringWorkingHours,
    editable: p.bookedVia === BOOKED_VIA_TERMINAL && p.terminalEditable,
    bookedAt: iso(p.bookedAt),
  };
}

/**
 * Bookings of an info terminal into the personnel of department reports. They change only the own personnel entry
 * (not the version of the report, so the author's editor does not get a conflict), record a version of the report
 * with the technical user of the terminal and end the management by other systems (`managedBy`). While MP-Feuer
 * leads, its reports (`managedBy: 'mp-feuer'`) take no bookings (`incidents.ledByMpFeuer`).
 */
@Injectable()
export class TerminalBookingService implements IncidentsTerminalBooking {
  constructor(
    private readonly em: EntityManager,
    private readonly reports: ReportsService,
    @Inject(ORGANIZATION) private readonly organization: Organization,
    @Inject(PERSON_DIRECTORY) private readonly directory: PersonDirectory,
  ) {}

  private summary(report: ReportEntity, settings: BookingWindowSettings, ledExternally = false): TerminalReport {
    const window = bookingWindow(
      { alarmedAt: report.alarmedAt.toISOString(), returnedAt: report.returnedAt.toISOString(), endConfirmed: report.endConfirmed },
      settings,
    );
    const location = report.incident.location;
    return {
      reportId: report.id,
      incidentId: report.incident.id,
      alarmKeyword: report.incident.alarmKeyword,
      alarmedAt: report.alarmedAt.toISOString(),
      street: [location.street, location.houseNumber].filter(Boolean).join(' '),
      city: location.city,
      endedAt: report.endConfirmed ? report.returnedAt.toISOString() : null,
      returnedAt: report.returnedAt.toISOString(),
      ...window,
      bookable: report.status === 'draft' && !report.locked && !ledExternally,
      booked: report.personnel.getItems().length,
    };
  }

  async openReports(departmentId: string, settings: BookingWindowSettings, now = new Date()): Promise<TerminalReport[]> {
    const reports = await this.em.fork().find(
      ReportEntity,
      {
        departmentId,
        alarmedAt: { $lte: now },
        $or: [
          { endConfirmed: true, returnedAt: { $gte: new Date(now.getTime() - settings.afterEndMinutes * 60_000) } },
          { endConfirmed: false, alarmedAt: { $gte: new Date(now.getTime() - settings.openEndHours * 3_600_000) } },
        ],
      },
      { populate: ['incident', 'personnel'], orderBy: { alarmedAt: 'desc' } },
    );
    const { leading } = await this.reports.externalOperation();
    return reports.map((r) => this.summary(r, settings, leading && r.managedBy === 'mp-feuer')).filter((r) => windowOpen(r, now));
  }

  /** The department report (not of a unit) while its window is open; otherwise `404`. */
  private async open(em: EntityManager, reportId: string, departmentId: string, settings: BookingWindowSettings, now: Date, lock = false): Promise<ReportEntity> {
    const report = /^[0-9a-f-]{36}$/i.test(reportId)
      ? await em.findOne(ReportEntity, reportId, lock ? { lockMode: LockMode.PESSIMISTIC_WRITE } : {})
      : null;
    if (!report || report.unit || report.departmentId !== departmentId) throw new NotFoundException({ code: 'info-terminal.reportNotFound' });
    await em.populate(report, REPORT_POPULATE);
    if (!windowOpen(this.summary(report, settings), now)) throw new ConflictException({ code: 'info-terminal.windowClosed' });
    return report;
  }

  /** The same checks as saving in the editor: only unlocked drafts, not led by MP-Feuer. */
  private async assertDraft(report: ReportEntity): Promise<void> {
    await this.reports.assertNotLedExternally(report);
    if (report.status.startsWith('released')) throw new ForbiddenException({ code: 'incidents.reportReleased' });
    if (report.locked) throw new ForbiddenException({ code: 'incidents.reportLocked', lockedBy: report.lockedBy ?? '' });
    if (report.status !== 'draft') throw new ForbiddenException({ code: 'incidents.notDraft', status: report.status });
  }

  async report(reportId: string, departmentId: string, settings: BookingWindowSettings, now = new Date()): Promise<TerminalReportDetail> {
    const em = this.em.fork();
    const report = await this.open(em, reportId, departmentId, settings, now);
    const siblings = await em.find(ReportEntity, { incident: report.incident, id: { $ne: report.id } }, { populate: ['personnel'] });
    // Persons whose processing is restricted (Art. 18) never appear at the info terminal.
    const restricted = await this.directory.restrictedIds([...report.personnel.getItems(), ...siblings.flatMap((s) => s.personnel.getItems())].flatMap((p) => (p.personId ? [p.personId] : [])));
    const elsewhere: TerminalReportDetail['elsewhere'] = {};
    for (const sibling of siblings) {
      for (const p of sibling.personnel.getItems()) {
        if (p.personId && !restricted.has(p.personId)) elsewhere[p.personId] = { departmentId: sibling.departmentId ?? null, unit: sibling.unit ?? null };
      }
    }
    return {
      ...this.summary(report, settings, await this.reports.ledExternally(report)),
      departmentId,
      entries: report.personnel.getItems().filter((p) => p.personId && !restricted.has(p.personId)).map(toEntry),
      elsewhere,
    };
  }

  async book(
    reportId: string,
    departmentId: string,
    raw: TerminalBookingInput,
    actor: TerminalActor,
    settings: BookingWindowSettings,
    now = new Date(),
  ): Promise<TerminalEntry> {
    const input = TerminalBookingInput.parse(raw);
    const [person] = await this.directory.snapshots([input.personId]);
    // Only persons of the master data who have not left and whose processing is not restricted; guests are entered by the author.
    if (!person || person.status === 'left' || (await this.directory.isRestricted(person.id))) throw new BadRequestException({ code: 'incidents.unknownPerson' });
    if (input.vehicleId) {
      const vehicle = (await this.organization.vehicles()).find((v) => v.id === input.vehicleId);
      if (!vehicle || vehicle.status !== 'in-service') throw new BadRequestException({ code: 'incidents.unknownVehicle' });
    }
    if (input.function) {
      const entry = (await this.organization.catalog('function')).find((f) => f.key === input.function);
      if (!entry?.active) throw new BadRequestException({ code: 'info-terminal.unknownFunction' });
    }
    if (input.from && input.to && new Date(input.to) <= new Date(input.from)) throw new BadRequestException({ code: 'info-terminal.endBeforeStart' });

    const entry = await this.em.fork().transactional(async (em) => {
      // One booking of a report at a time: the lock serializes terminals, and `bookedAt` grows with every booking.
      const report = await this.open(em, reportId, departmentId, settings, now, true);
      await this.assertDraft(report);
      const other = await em.findOne(
        ReportPersonnelEntity,
        { personId: input.personId, report: { incident: report.incident, id: { $ne: report.id } } },
        { populate: ['report'] },
      );
      if (other) {
        const department = other.report.departmentId ? (await this.organization.departments()).find((d) => d.id === other.report.departmentId) : undefined;
        throw new ConflictException({ code: 'info-terminal.personInOtherReport', department: department?.name ?? other.report.unit ?? '' });
      }
      const before = await this.beforeFirstRevision(em, report);
      const existing = report.personnel.getItems().find((p) => p.personId === input.personId);
      if (existing && !(existing.bookedVia === BOOKED_VIA_TERMINAL && existing.terminalEditable)) {
        throw new ConflictException({ code: 'info-terminal.entryLocked' });
      }
      const row = existing ?? em.create(ReportPersonnelEntity, { report, personId: input.personId, allowances: [] });
      if (!existing) report.personnel.add(row);
      // Standby counts for the times of the report and without breathing apparatus; own times only with a vehicle.
      const vehicle = input.standby ? null : input.vehicleId;
      const inherited = effectiveTimes({}, { alarmedAt: report.alarmedAt.toISOString(), returnedAt: report.returnedAt.toISOString() }, vehicleTimes(report, vehicle));
      const own = (value: string | null, fallback: string) => (vehicle && value && new Date(value).getTime() !== new Date(fallback).getTime() ? new Date(value) : null);
      Object.assign(row, {
        vehicleId: vehicle,
        standbyStationId: input.standby ? actor.stationId : null,
        function: input.function,
        breathingApparatus: Boolean(vehicle) && input.breathingApparatus,
        from: own(input.from, inherited.from),
        to: own(input.to, inherited.to),
        lossOfEarnings: input.lossOfEarnings,
        duringWorkingHours: input.duringWorkingHours,
        bookedVia: BOOKED_VIA_TERMINAL,
        bookedAt: new Date(),
        terminalId: actor.terminalId,
        terminalEditable: true,
      });
      // Breathing minutes, device and chemical suit are entered by the author.
      if (!row.breathingApparatus) Object.assign(row, { breathingMinutes: null, chemicalSuit: false, breathingDevice: null });
      addCrewVehicles(em, report);
      this.revision(em, report, actor, before);
      // A booking is the work of a person: the external API and the MP-Feuer import leave the report alone from now on.
      // In SQL, so the version of the report stays (the author's editor must not get a conflict).
      if (report.managedBy) await em.getConnection().execute('update incidents.report set managed_by = null where id = ?', [report.id], 'run', em.getTransactionContext());
      return row;
    });
    await this.prune(entry.report.id);
    return toEntry(entry);
  }

  async cancel(reportId: string, departmentId: string, personId: string, actor: TerminalActor, settings: BookingWindowSettings, now = new Date()): Promise<void> {
    const reportIdDone = await this.em.fork().transactional(async (em) => {
      const report = await this.open(em, reportId, departmentId, settings, now, true);
      await this.assertDraft(report);
      const existing = report.personnel.getItems().find((p) => p.personId === personId);
      if (!existing) throw new NotFoundException({ code: 'info-terminal.entryNotFound' });
      if (!(existing.bookedVia === BOOKED_VIA_TERMINAL && existing.terminalEditable)) throw new ConflictException({ code: 'info-terminal.entryLocked' });
      const before = await this.beforeFirstRevision(em, report);
      report.personnel.remove(existing);
      this.revision(em, report, actor, before);
      return report.id;
    });
    await this.prune(reportIdDone);
  }

  /** The content before the first change, if the report has no version yet (e.g. created by the API or an import). */
  private async beforeFirstRevision(em: EntityManager, report: ReportEntity): Promise<Record<string, unknown> | null> {
    if (await em.count(ReportRevisionEntity, { report })) return null;
    return reportToInput(report) as unknown as Record<string, unknown>;
  }

  /** Every booking is a version of the report (user: the technical user of the terminal), for "Versionen" and undo. */
  private revision(em: EntityManager, report: ReportEntity, actor: TerminalActor, before: Record<string, unknown> | null): void {
    const now = new Date();
    if (before) em.create(ReportRevisionEntity, { report, content: before, userId: null, userName: '', savedAt: new Date(now.getTime() - 1) });
    em.create(ReportRevisionEntity, { report, content: reportToInput(report) as unknown as Record<string, unknown>, userId: actor.userId, userName: actor.userName, savedAt: now });
  }

  /** Keeps the most recent versions only, like saving in the editor. */
  private async prune(reportId: string): Promise<void> {
    const em = this.em.fork();
    const old = await em.find(ReportRevisionEntity, { report: reportId }, { orderBy: { savedAt: 'desc' }, offset: MAX_REVISIONS });
    if (old.length) await em.remove(old).flush();
  }

  async keywords() {
    const keywords = await this.em.fork().find(AlarmKeywordEntity, { active: true }, { orderBy: { key: 'asc' } });
    return keywords.map((k) => ({ key: k.key, name: k.name }));
  }

  async matches(input: { dispatchNumber: string | null; alarmKeyword: string; alarmedAt: string; street: string; city: string }): Promise<TerminalIncidentMatch[]> {
    const number = normalized(input.dispatchNumber);
    return (await this.reports.matchingIncidents(this.em.fork(), input)).map((i) => ({
      incidentId: i.id,
      alarmKeyword: i.alarmKeyword,
      alarmedAt: i.alarmedAt.toISOString(),
      street: [i.location.street, i.location.houseNumber].filter(Boolean).join(' '),
      city: i.location.city,
      departmentIds: i.reports.getItems().flatMap((r) => (r.departmentId ? [r.departmentId] : [])),
      sameDispatchNumber: Boolean(number) && normalized(i.dispatchNumber) === number,
    }));
  }

  async createIncident(
    input: z.output<typeof TerminalIncidentInput>,
    departmentId: string,
    joinIncidentId: string | null,
    _actor: TerminalActor,
  ): Promise<{ incidentId: string; reportId: string; created: 'incident' | 'report' | 'existing' }> {
    const em = this.em.fork();
    if (joinIncidentId) {
      const incident = /^[0-9a-f-]{36}$/i.test(joinIncidentId) ? await em.findOne(IncidentEntity, joinIncidentId, { populate: ['reports'] }) : null;
      if (!incident) throw new NotFoundException({ code: 'info-terminal.incidentNotFound' });
      const existing = incident.reports.getItems().find((r) => r.departmentId === departmentId);
      if (existing) {
        // The report of the department kept in MP-Feuer takes no bookings at the terminal.
        await this.reports.assertNotLedExternally(existing);
        return { incidentId: incident.id, reportId: existing.id, created: 'existing' };
      }
      // The new report has no author: the deadline "assign an author" goes to the writers of the department.
      const report = await this.reports.createReport(em, incident, departmentId, null);
      await em.flush();
      return { incidentId: incident.id, reportId: report.id, created: 'report' };
    }
    const incident = await this.reports.createIncident(
      em,
      IncidentInput.parse({ dispatchNumber: input.dispatchNumber, alarmKeyword: input.alarmKeyword, alarmedAt: input.alarmedAt, location: { street: input.street, city: input.city } }),
      'terminal',
    );
    const report = await this.reports.createReport(em, incident, departmentId, null);
    await em.flush();
    await this.reports.publishCreated(incident, { units: [], personId: null });
    return { incidentId: incident.id, reportId: report.id, created: 'incident' };
  }
}

