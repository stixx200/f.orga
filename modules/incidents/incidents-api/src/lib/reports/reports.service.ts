import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { EntityManager, type FilterQuery } from '@mikro-orm/core';
import { assertVersion, Audit, type AuthenticatedUser, berlinDayAfter, berlinDayStart, DomainEvents } from '@forga/core-api';
import {
  type Acknowledgement,
  effectiveTimes,
  IncidentInput,
  type Finding,
  type Incident,
  type IncidentCreatedEvent,
  INCIDENTS_EVENTS,
  type IncidentUnit,
  type IncidentStatistics,
  type ReleaseLevel,
  type Report,
  ReportInput,
  type ReportReleasedEvent,
  type ReportStatus,
  type ReportUnlockedEvent,
  type StatisticsSuggestion,
  type VehicleTimes,
} from '@forga/incidents-contracts';
import { ORGANIZATION, type Organization } from '@forga/masterdata-contracts';
import { type FitnessLookup, RESPIRATORY_PROTECTION_FITNESS } from '@forga/respiratory-protection-contracts';
import { computeCompensation, localDate } from '../domain/compensation.js';
import { type Assignment, evaluateRules } from '../domain/rules.js';
import {
  AlarmKeywordEntity,
  IncidentEntity,
  InvolvedPartyEntity,
  OtherAgencyEntity,
  ReportEntity,
  ReportPersonnelEntity,
  ReportRevisionEntity,
  ReportVehicleEntity,
  StatisticsYearEntity,
  type StoredAcknowledgement,
} from '../incidents.entities.js';
import { IncidentUnitsRegistry } from '../units/units.registry.js';
import { type ReportContext, ReportContextLoader } from './report-context.js';

export const READ = 'incidents.reports.read';
export const WRITE = 'incidents.reports.write';
export const RELEASE = 'incidents.reports.release';
export const UNLOCK = 'incidents.reports.unlock';
/** Department-level pre-review: return reports to their authors and remind authors (e.g. department commanders). */
export const REVIEW = 'incidents.reports.review';
/** Own incidents in "My area". */
export const SELF = 'incidents.self';
/** Costs and notes of the whole incident (commander). */
export const COSTS = 'incidents.costs';

const iso = (date: Date | null | undefined) => (date ? date.toISOString() : null);

const REVISION_WINDOW_MS = 10 * 60_000;
const MAX_REVISIONS = 50;

/**
 * Every vehicle with crew belongs to the report's vehicles (times empty = those of the report), whether the report
 * comes from the editor, an import or the API; cost recovery bills these vehicles. Needs `personnel` and `vehicles`
 * loaded.
 */
export function addCrewVehicles(em: EntityManager, report: ReportEntity): void {
  const listed = new Set(report.vehicles.getItems().map((v) => v.vehicleId));
  for (const p of report.personnel.getItems()) {
    if (!p.vehicleId || listed.has(p.vehicleId)) continue;
    listed.add(p.vehicleId);
    report.vehicles.add(em.create(ReportVehicleEntity, { report, vehicleId: p.vehicleId, alarmedAt: null, departedAt: null, returnedAt: null, kilometres: null }));
  }
}

/** The editable content of a stored report, in the form of `ReportInput`. */
export function reportToInput(report: ReportEntity): ParsedReportInput {
  return ReportInput.parse({
    endConfirmed: report.endConfirmed,
    authorPersonId: report.authorPersonId ?? null,
    times: {
      alarmedAt: report.alarmedAt.toISOString(),
      departedAt: iso(report.departedAt),
      arrivedAt: iso(report.arrivedAt),
      endedAt: iso(report.endedAt),
      returnedAt: report.returnedAt.toISOString(),
    },
    situation: report.situation,
    actions: report.actions,
    cause: report.cause,
    incidentCommander: report.incidentCommander,
    weather: report.weather,
    equipment: report.equipment,
    personnel: report.personnel.getItems().map((p) => ({
      personId: p.personId ?? null,
      guestName: p.guestName,
      vehicleId: p.vehicleId ?? null,
      standbyStationId: p.standbyStationId ?? null,
      function: p.function ?? null,
      breathingApparatus: p.breathingApparatus,
      breathingMinutes: p.breathingMinutes ?? null,
      chemicalSuit: p.chemicalSuit,
      breathingDevice: p.breathingDevice ?? null,
      from: iso(p.from),
      to: iso(p.to),
      lossOfEarnings: p.lossOfEarnings,
      duringWorkingHours: p.duringWorkingHours,
      allowances: p.allowances,
      compensationOverride: p.compensationOverride ?? null,
      injured: p.injured,
      killed: p.killed,
    })),
    vehicles: report.vehicles.getItems().map((v) => ({
      vehicleId: v.vehicleId,
      alarmedAt: iso(v.alarmedAt),
      departedAt: iso(v.departedAt),
      returnedAt: iso(v.returnedAt),
      kilometres: v.kilometres ?? null,
    })),
    involvedParties: report.involvedParties.getItems().map(({ role, name, street, postalCode, city, phone, licensePlate, notes }) => ({
      role, name, street, postalCode, city, phone, licensePlate, notes,
    })),
    otherAgencies: report.otherAgencies.getItems().map(({ organization, forces, vehicles, notes }) => ({
      organization, forces: forces ?? null, vehicles: vehicles ?? null, notes,
    })),
  });
}

export const REPORT_POPULATE = ['incident', 'personnel', 'vehicles', 'involvedParties', 'otherAgencies'] as const;

type ParsedReportInput = ReturnType<typeof ReportInput.parse>;


/** Own times of a vehicle of the report (`null` = those of the report); needs `vehicles` loaded. */
export function vehicleTimes(report: ReportEntity, vehicleId: string | null | undefined): VehicleTimes | null {
  if (!vehicleId) return null;
  const vehicle = report.vehicles.getItems().find((v) => v.vehicleId === vehicleId);
  return vehicle ? { alarmedAt: iso(vehicle.alarmedAt), departedAt: iso(vehicle.departedAt), returnedAt: iso(vehicle.returnedAt) } : null;
}

/**
 * Begin and end of a personnel entry: own times, else those of the person's vehicle, else those of the report
 * (`null` in the database means inherited). Persons on standby follow the report. Needs `vehicles` loaded.
 */
export function assignmentTimes(entry: ReportPersonnelEntity, report: ReportEntity): { from: string; to: string } {
  return effectiveTimes(
    { from: iso(entry.from), to: iso(entry.to) },
    { alarmedAt: report.alarmedAt.toISOString(), returnedAt: report.returnedAt.toISOString() },
    entry.standbyStationId ? null : vehicleTimes(report, entry.vehicleId),
  );
}

/** Uses the keyword and the incident city to pre-fill the statistics. */
export function suggestStatistics(incident: IncidentEntity, keyword: AlarmKeywordEntity | undefined, homeMunicipalities: readonly string[]): StatisticsSuggestion {
  const city = incident.location.city.trim().toLowerCase();
  const own = homeMunicipalities.map((m) => m.toLowerCase());
  return {
    ownMunicipality: own.length === 0 || !city || own.includes(city),
    mainType: keyword?.mainType ?? null,
    technicalCategory: keyword?.technicalCategory ?? null,
    falseAlarmType: keyword?.falseAlarmType ?? null,
  };
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly contexts: ReportContextLoader,
    private readonly events: DomainEvents,
    private readonly audit: Audit,
    readonly units: IncidentUnitsRegistry,
    @Inject(ORGANIZATION) private readonly organization: Organization,
    @Optional() @Inject(RESPIRATORY_PROTECTION_FITNESS) private readonly fitness?: FitnessLookup,
  ) {}

  // ----- Access -----

  /** The registered unit of a unit report; reports of a unit no module registers any more are handled by releasers only. */
  unitOf(report: Pick<ReportEntity, 'unit'>): IncidentUnit | undefined {
    return this.units.get(report.unit);
  }

  /**
   * Department reports: readers of the department. Unit reports: brigade-wide readers of incident reports and those
   * with a permission of the unit. Releasers read all reports.
   */
  canRead(user: AuthenticatedUser, report: Pick<ReportEntity, 'departmentId' | 'unit'>): boolean {
    if (user.grant(RELEASE) === 'brigade') return true;
    if (report.departmentId) return user.can(READ, report.departmentId);
    const unit = this.unitOf(report);
    return user.grant(READ) === 'brigade' || Boolean(unit && [unit.readPermission, unit.writePermission, unit.reviewPermission].some((p) => user.can(p)));
  }

  /** Releasers write every report; writers of the department its reports; the writers of a unit its reports. */
  canWrite(user: AuthenticatedUser, report: Pick<ReportEntity, 'departmentId' | 'unit'>): boolean {
    if (user.grant(RELEASE) === 'brigade') return true;
    if (report.departmentId) return user.can(WRITE, report.departmentId);
    const unit = this.unitOf(report);
    return Boolean(unit && user.can(unit.writePermission));
  }

  /** Releasers (brigade) and pre-reviewers of the department (or of the unit) may return reports and remind their authors. */
  canReview(user: AuthenticatedUser, report: Pick<ReportEntity, 'departmentId' | 'unit'>): boolean {
    if (user.grant(RELEASE) === 'brigade') return true;
    if (report.departmentId) return user.can(REVIEW, report.departmentId);
    const unit = this.unitOf(report);
    return Boolean(unit && user.can(unit.reviewPermission));
  }

  /** Keys of the units whose reports the user may read. */
  readableUnits(user: AuthenticatedUser): string[] {
    return this.units.all().filter((unit) => this.canRead(user, { departmentId: null, unit: unit.key })).map((unit) => unit.key);
  }

  /** Filter for the reports the user may read; `null` if none. */
  readableFilter(user: AuthenticatedUser): FilterQuery<ReportEntity> | null {
    const grant = user.grant(RELEASE) === 'brigade' ? 'brigade' : user.grant(READ);
    if (grant === 'brigade') return {};
    const units = this.readableUnits(user);
    const or: FilterQuery<ReportEntity>[] = [];
    if (grant?.length) or.push({ departmentId: { $in: grant } });
    if (units.length) or.push({ unit: { $in: units } });
    return or.length ? { $or: or } : null;
  }

  /**
   * Released reports are changed by nobody: they are unlocked first, so the receivers of the release learn about the
   * change. Otherwise releasers may edit; writers of the department
   * only drafts that are not locked.
   */
  assertWrite(user: AuthenticatedUser, report: ReportEntity): void {
    if (report.status.startsWith('released')) throw new ForbiddenException({ code: 'incidents.reportReleased' });
    if (user.grant(RELEASE) === 'brigade') return;
    if (!this.canWrite(user, report)) throw new ForbiddenException({ code: 'auth.forbidden', permissions: [report.departmentId ? WRITE : (this.unitOf(report)?.writePermission ?? RELEASE)] });
    if (report.locked) throw new ForbiddenException({ code: 'incidents.reportLocked', lockedBy: report.lockedBy ?? '' });
    // After submitting, the author changes the report only once it is returned.
    if (report.status !== 'draft') throw new ForbiddenException({ code: 'incidents.notDraft', status: report.status });
  }

  async load(em: EntityManager, id: string, user: AuthenticatedUser): Promise<ReportEntity> {
    const report = await em.findOne(ReportEntity, id, { populate: REPORT_POPULATE });
    if (!report || !this.canRead(user, report)) throw new NotFoundException();
    return report;
  }

  // ----- Content -----

  async requireKeyword(em: EntityManager, key: string): Promise<void> {
    if (!(await em.count(AlarmKeywordEntity, { key }))) throw new BadRequestException({ code: 'incidents.unknownKeyword', key });
  }

  async createIncident(em: EntityManager, input: ReturnType<typeof IncidentInput.parse>, via: 'ui' | 'api' | 'import'): Promise<IncidentEntity> {
    await this.requireKeyword(em, input.alarmKeyword);
    const alarmedAt = new Date(input.alarmedAt);
    let dispatchNumber = input.dispatchNumber;
    if (dispatchNumber && (await em.count(IncidentEntity, { dispatchNumber }))) {
      throw new ConflictException({ code: 'incidents.dispatchNumberTaken' });
    }
    if (!dispatchNumber) {
      const year = localDate(input.alarmedAt).slice(0, 4);
      // Highest suffix used so far (also by incidents whose number was replaced later), not the count.
      const used = await em.find(IncidentEntity, { dispatchNumber: { $like: `INT-${year}-%` } }, { fields: ['dispatchNumber'] });
      const highest = Math.max(0, ...used.map((i) => Number(i.dispatchNumber.slice(`INT-${year}-`.length)) || 0));
      dispatchNumber = `INT-${year}-${String(highest + 1).padStart(4, '0')}`;
    }
    return em.create(IncidentEntity, {
      dispatchNumber,
      internalNumber: !input.dispatchNumber,
      alarmKeyword: input.alarmKeyword,
      alarmMessage: input.alarmMessage,
      alarmedAt,
      location: input.location,
      createdVia: via,
    });
  }

  /** Tells other modules about a new incident (e.g. the duty officer module adds its report); after the commit. */
  async publishCreated(incident: IncidentEntity, requested: { units: string[]; personId: string | null } = { units: [], personId: null }): Promise<void> {
    await this.events.publish<IncidentCreatedEvent>(INCIDENTS_EVENTS.incidentCreated, {
      incidentId: incident.id,
      dispatchNumber: incident.dispatchNumber,
      alarmKeyword: incident.alarmKeyword,
      alarmedAt: incident.alarmedAt.toISOString(),
      createdVia: incident.createdVia,
      units: requested.units,
      requestedByPersonId: requested.personId,
    });
  }

  /**
   * Only operational departments write incident reports (not e.g. youth, veterans or the command group): throws
   * `incidents.departmentNotOperational` with the name of the department.
   */
  async requireOperational(departmentId: string): Promise<void> {
    const department = (await this.organization.departments()).find((d) => d.id === departmentId);
    if (!department) throw new BadRequestException({ code: 'masterdata.unknownDepartment' });
    if (department.type !== 'operational') throw new BadRequestException({ code: 'incidents.departmentNotOperational', name: department.name });
  }

  /**
   * New draft report of an operational department or (with `{ unit }`) of a brigade-wide unit. Primary report: the
   * first department report of an incident; while an incident has no department report, its first unit report. The
   * first department report takes over the primary role from a unit report. Times default to
   * alarm + 1 h, with the end unconfirmed until the author confirms or changes it.
   */
  async createReport(em: EntityManager, incident: IncidentEntity, owner: string | { unit: string }, authorPersonId: string | null): Promise<ReportEntity> {
    await em.populate(incident, ['reports']);
    const departmentId = typeof owner === 'string' ? owner : null;
    const unit = typeof owner === 'string' ? null : this.units.get(owner.unit);
    if (!departmentId && !unit) throw new BadRequestException({ code: 'incidents.unknownUnit' });
    if (departmentId) await this.requireOperational(departmentId);
    const existing = incident.reports.getItems();
    const primary = existing.find((r) => r.primary);
    const report = em.create(ReportEntity, {
      incident,
      departmentId,
      unit: unit?.key ?? null,
      number: unit ? await this.nextUnitNumber(em, unit, incident.alarmedAt) : await this.nextNumber(em, departmentId!, incident.alarmedAt),
      primary: !primary && (Boolean(departmentId) || !existing.some((r) => r.departmentId)),
      authorPersonId,
      alarmedAt: incident.alarmedAt,
      returnedAt: new Date(incident.alarmedAt.getTime() + 3_600_000),
      endConfirmed: false,
      weather: { influence: false, conditions: [] },
      acknowledgements: [],
    });
    incident.reports.add(report);
    if (departmentId && primary?.unit) await this.setPrimary(em, report, true);
    return report;
  }

  /** Validates and applies the content; releasers lock the report by editing it. */
  async save(em: EntityManager, report: ReportEntity, input: ParsedReportInput, user: AuthenticatedUser): Promise<void> {
    assertVersion(report, input.version);
    const personIds = input.personnel.flatMap((p) => (p.personId ? [p.personId] : []));
    const context = await this.contexts.load(personIds, input.times.alarmedAt);
    await this.validateReferences(report, context, input);
    await this.recordRevision(em, report, input, user);
    // Other systems sending their own times leave the flag out: their end counts as confirmed.
    report.endConfirmed = input.endConfirmed ?? true;
    this.applyContent(em, report, input);
    report.externallyManaged = false;
    this.lockBy(report, user);
  }

  /**
   * Keeps the content for undo. The state before the first save is kept as well (e.g. after an import).
   * Saves of the same user within REVISION_WINDOW_MS update the latest revision (auto-save).
   */
  private async recordRevision(em: EntityManager, report: ReportEntity, input: ParsedReportInput, user: AuthenticatedUser) {
    const now = new Date();
    const latest = await em.findOne(ReportRevisionEntity, { report }, { orderBy: { savedAt: 'desc' } });
    if (!latest && report.version) {
      em.create(ReportRevisionEntity, {
        report,
        content: reportToInput(report) as unknown as Record<string, unknown>,
        userId: null,
        userName: '',
        savedAt: new Date(now.getTime() - 1),
      });
    }
    // The content of a version is the report, not the version number the client sent.
    const { version: _version, ...content } = input;
    if (latest && latest.userId === user.id && now.getTime() - latest.savedAt.getTime() < REVISION_WINDOW_MS) {
      latest.content = content as unknown as Record<string, unknown>;
      latest.savedAt = now;
    } else {
      em.create(ReportRevisionEntity, { report, content: content as unknown as Record<string, unknown>, userId: user.id, userName: user.displayName, savedAt: now });
    }
    // Keep the most recent revisions only.
    const all = await em.find(ReportRevisionEntity, { report }, { orderBy: { savedAt: 'desc' }, offset: MAX_REVISIONS - 1 });
    for (const old of all) em.remove(old);
  }


  async nextNumber(em: EntityManager, departmentId: string, alarmedAt: Date): Promise<string> {
    const year = localDate(alarmedAt.toISOString()).slice(0, 4);
    const existing = await em.find(ReportEntity, { departmentId, number: { $like: `${year}-%` } }, { fields: ['number'] });
    const highest = existing.reduce((max, r) => Math.max(max, Number(r.number.split('-')[1]) || 0), 0);
    return `${year}-${String(highest + 1).padStart(3, '0')}`;
  }

  /** Numbers of unit reports carry the prefix of the unit, e.g. `EvD-2026-001`. */
  async nextUnitNumber(em: EntityManager, unit: IncidentUnit, alarmedAt: Date): Promise<string> {
    const prefix = `${unit.numberPrefix}-${localDate(alarmedAt.toISOString()).slice(0, 4)}-`;
    const existing = await em.find(ReportEntity, { unit: unit.key, number: { $like: `${prefix}%` } }, { fields: ['number'] });
    const highest = existing.reduce((max, r) => Math.max(max, Number(r.number.slice(prefix.length)) || 0), 0);
    return `${prefix}${String(highest + 1).padStart(3, '0')}`;
  }

  /** Replaces the editable content of a report including all child lists. */
  applyContent(em: EntityManager, report: ReportEntity, input: ParsedReportInput): void {
    em.assign(report, {
      authorPersonId: input.authorPersonId,
      alarmedAt: new Date(input.times.alarmedAt),
      departedAt: input.times.departedAt ? new Date(input.times.departedAt) : null,
      arrivedAt: input.times.arrivedAt ? new Date(input.times.arrivedAt) : null,
      endedAt: input.times.endedAt ? new Date(input.times.endedAt) : null,
      returnedAt: new Date(input.times.returnedAt),
      situation: input.situation,
      actions: input.actions,
      cause: input.cause,
      incidentCommander: input.incidentCommander,
      weather: input.weather,
      equipment: input.equipment,
    });
    report.personnel.removeAll();
    for (const p of input.personnel) {
      report.personnel.add(
        em.create(ReportPersonnelEntity, {
          report,
          personId: p.personId,
          guestName: p.personId ? '' : p.guestName.trim(),
          vehicleId: p.vehicleId,
          standbyStationId: p.standbyStationId,
          function: p.function,
          breathingApparatus: p.breathingApparatus,
          breathingMinutes: p.breathingApparatus ? p.breathingMinutes : null,
          chemicalSuit: p.breathingApparatus && p.chemicalSuit,
          breathingDevice: p.breathingApparatus ? p.breathingDevice : null,
          from: p.from ? new Date(p.from) : null,
          to: p.to ? new Date(p.to) : null,
          lossOfEarnings: p.lossOfEarnings,
          duringWorkingHours: p.duringWorkingHours,
          allowances: p.allowances,
          compensationOverride: p.compensationOverride,
          injured: p.injured,
          killed: p.killed,
        }),
      );
    }
    report.vehicles.removeAll();
    for (const v of input.vehicles) {
      report.vehicles.add(
        em.create(ReportVehicleEntity, {
          report,
          vehicleId: v.vehicleId,
          alarmedAt: v.alarmedAt ? new Date(v.alarmedAt) : null,
          departedAt: v.departedAt ? new Date(v.departedAt) : null,
          returnedAt: v.returnedAt ? new Date(v.returnedAt) : null,
          kilometres: v.kilometres,
        }),
      );
    }
    addCrewVehicles(em, report);
    report.involvedParties.removeAll();
    for (const party of input.involvedParties) report.involvedParties.add(em.create(InvolvedPartyEntity, { report, ...party }));
    report.otherAgencies.removeAll();
    for (const agency of input.otherAgencies) report.otherAgencies.add(em.create(OtherAgencyEntity, { report, ...agency }));
  }

  /** Validates references to masterdata (department, persons, vehicles, stations) against the directory. */
  async validateReferences(report: ReportEntity, context: ReportContext, input: ParsedReportInput): Promise<void> {
    const unknownPersons = input.personnel.filter((p) => p.personId && !context.persons.has(p.personId));
    if (unknownPersons.length) throw new BadRequestException({ code: 'incidents.unknownPerson' });
    const vehicleIds = [...input.vehicles.map((v) => v.vehicleId), ...input.personnel.flatMap((p) => (p.vehicleId ? [p.vehicleId] : []))];
    if (vehicleIds.some((id) => !context.vehicles.has(id))) throw new BadRequestException({ code: 'incidents.unknownVehicle' });
    const personIds = input.personnel.flatMap((p) => (p.personId ? [p.personId] : []));
    if (new Set(personIds).size !== personIds.length) throw new BadRequestException({ code: 'incidents.personTwiceInReport' });
    if (report.departmentId ? !context.departments.has(report.departmentId) : !this.unitOf(report)) {
      throw new BadRequestException({ code: report.departmentId ? 'masterdata.unknownDepartment' : 'incidents.unknownUnit' });
    }
  }

  // ----- Findings and DTO -----

  /** Findings of the report; `acknowledgements` replaces the stored ones (e.g. those sent with a submit). */
  async findings(em: EntityManager, report: ReportEntity, context: ReportContext, acknowledgements = report.acknowledgements ?? []): Promise<Finding[]> {
    const incident = report.incident;
    const keyword = context.keywords.get(incident.alarmKeyword);
    const kind = keyword?.compensationKind ?? 'incident';
    const siblings = await em.find(ReportEntity, { incident, id: { $ne: report.id } }, { populate: ['personnel', 'vehicles'] });
    const personIds = report.personnel.getItems().flatMap((p) => (p.personId ? [p.personId] : []));

    // Assignments of the same persons in other incidents around the same time.
    const window = 2 * 24 * 3_600_000;
    const others = personIds.length
      ? await em.find(
          ReportPersonnelEntity,
          {
            personId: { $in: personIds },
            report: {
              incident: { $ne: incident.id },
              alarmedAt: { $lte: new Date(report.returnedAt.getTime() + window) },
              returnedAt: { $gte: new Date(report.alarmedAt.getTime() - window) },
            },
          },
          { populate: ['report.incident', 'report.vehicles'] },
        )
      : [];

    const assignments: Assignment[] = report.personnel.getItems().map((p) => {
      const times = assignmentTimes(p, report);
      const person = p.personId ? context.persons.get(p.personId) : undefined;
      const compensation = computeCompensation(
        { ...times, guest: !p.personId, standby: Boolean(p.standbyStationId), duringWorkingHours: p.duringWorkingHours, allowances: p.allowances, override: p.compensationOverride ?? null },
        context.settings,
        kind,
      );
      return {
        key: p.personId ?? `guest:${p.guestName}`,
        personId: p.personId ?? null,
        label: person ? `${person.lastName}, ${person.firstName}` : p.guestName,
        vehicleId: p.vehicleId ?? null,
        standbyStationId: p.standbyStationId ?? null,
        ...times,
        breathingApparatus: p.breathingApparatus,
        lossOfEarnings: p.lossOfEarnings,
        duringWorkingHours: p.duringWorkingHours,
        rateMissing: Boolean(p.personId) && !p.duringWorkingHours && !p.compensationOverride && compensation.rate === null,
      };
    });

    const wearers = assignments.flatMap((a) => (a.breathingApparatus && a.personId ? [a.personId] : []));
    const breathingFitness = this.fitness && wearers.length ? await this.fitness.colors(wearers, localDate(report.alarmedAt.toISOString())) : undefined;
    const raw = evaluateRules(
      {
        primary: report.primary,
        incidentHasPrimary: report.primary || siblings.some((s) => s.primary),
        times: {
          alarmedAt: report.alarmedAt.toISOString(),
          departedAt: iso(report.departedAt),
          arrivedAt: iso(report.arrivedAt),
          endedAt: iso(report.endedAt),
          returnedAt: report.returnedAt.toISOString(),
        },
        endConfirmed: report.endConfirmed,
        incidentAlarmedAt: incident.alarmedAt.toISOString(),
        situation: report.situation,
        actions: report.actions,
        incidentHasStatistics: Boolean(incident.statistics),
        departmentId: report.departmentId ?? undefined,
        unit: report.unit ? { vehicleRequired: this.unitOf(report)?.vehicleRequired ?? false } : undefined,
        keyword: keyword ? { mainType: keyword.mainType ?? null, requiresVehicle: keyword.requiresVehicle } : null,
        personnel: assignments,
        sameIncident: siblings.map((s) => ({
          // Units are named by the UI in its language (`unit:<key>`).
          department: s.departmentId ? (context.departments.get(s.departmentId)?.name ?? s.departmentId) : `unit:${s.unit ?? ''}`,
          assignments: s.personnel.getItems().map((p) => ({ personId: p.personId ?? null, ...assignmentTimes(p, s) })),
        })),
        otherIncidents: others.flatMap((o) =>
          o.personId ? [{ dispatchNumber: o.report.incident.dispatchNumber, personId: o.personId, ...assignmentTimes(o, o.report) }] : [],
        ),
        vehicleTimes: report.vehicles.getItems().map((v) => ({ vehicleId: v.vehicleId, alarmedAt: iso(v.alarmedAt), departedAt: iso(v.departedAt), returnedAt: iso(v.returnedAt) })),
        vehicles: new Map([...context.vehicles.values()].map((v) => [v.id, { seats: v.seats, designation: v.designation }])),
        qualifications: new Map([...context.persons.values()].map((p) => [p.id, p.qualifications])),
        persons: new Map([...context.persons.values()].map((p) => [p.id, { status: p.status, departmentIds: p.departmentIds, birthDate: p.birthDate }])),
        minimumAge: context.minimumAge,
        breathingFitness,
      },
      context.settings,
    );
    const reasons = new Map(acknowledgements.map((a) => [`${a.rule}|${a.subject ?? ''}`, a.reason]));
    return raw.map((f) => {
      const reason = f.level === 'warning' ? (reasons.get(`${f.rule}|${f.subject ?? ''}`) ?? null) : null;
      return { ...f, acknowledged: reason !== null, reason };
    });
  }

  async contextFor(report: ReportEntity): Promise<ReportContext> {
    const personIds = report.personnel.getItems().flatMap((p) => (p.personId ? [p.personId] : []));
    return this.contexts.load(personIds, report.alarmedAt.toISOString());
  }

  async toDto(em: EntityManager, report: ReportEntity, context?: ReportContext): Promise<Report> {
    const ctx = context ?? (await this.contextFor(report));
    const kind = ctx.keywords.get(report.incident.alarmKeyword)?.compensationKind ?? 'incident';
    const personnel = report.personnel.getItems().map((p) => {
      const times = assignmentTimes(p, report);
      return {
        id: p.id,
        personId: p.personId ?? null,
        guestName: p.guestName,
        vehicleId: p.vehicleId ?? null,
        standbyStationId: p.standbyStationId ?? null,
        function: p.function ?? null,
        breathingApparatus: p.breathingApparatus,
        breathingMinutes: p.breathingMinutes ?? null,
        chemicalSuit: p.chemicalSuit,
        breathingDevice: p.breathingDevice ?? null,
        ...times,
        lossOfEarnings: p.lossOfEarnings,
        duringWorkingHours: p.duringWorkingHours,
        allowances: p.allowances,
        compensationOverride: p.compensationOverride ?? null,
        injured: p.injured,
        killed: p.killed,
        compensation: computeCompensation(
          { ...times, guest: !p.personId, standby: Boolean(p.standbyStationId), duringWorkingHours: p.duringWorkingHours, allowances: p.allowances, override: p.compensationOverride ?? null },
          ctx.settings,
          kind,
        ),
      };
    });
    return {
      id: report.id,
      incidentId: report.incident.id,
      departmentId: report.departmentId ?? null,
      unit: report.unit ?? null,
      number: report.number,
      primary: report.primary,
      status: report.status,
      locked: report.locked,
      lockedBy: report.lockedBy ?? null,
      lockedAt: iso(report.lockedAt),
      returnComment: report.returnComment ?? null,
      authorPersonId: report.authorPersonId ?? null,
      endConfirmed: report.endConfirmed,
      times: {
        alarmedAt: report.alarmedAt.toISOString(),
        departedAt: iso(report.departedAt),
        arrivedAt: iso(report.arrivedAt),
        endedAt: iso(report.endedAt),
        returnedAt: report.returnedAt.toISOString(),
      },
      situation: report.situation,
      actions: report.actions,
      cause: report.cause,
      incidentCommander: report.incidentCommander,
      weather: report.weather,
      equipment: report.equipment,
      personnel,
      vehicles: report.vehicles.getItems().map((v) => ({
        id: v.id,
        vehicleId: v.vehicleId,
        alarmedAt: iso(v.alarmedAt),
        departedAt: iso(v.departedAt),
        returnedAt: iso(v.returnedAt),
        kilometres: v.kilometres ?? null,
      })),
      involvedParties: report.involvedParties.getItems().map((p) => ({
        id: p.id,
        role: p.role,
        name: p.name,
        street: p.street,
        postalCode: p.postalCode,
        city: p.city,
        phone: p.phone,
        licensePlate: p.licensePlate,
        notes: p.notes,
      })),
      otherAgencies: report.otherAgencies.getItems().map((a) => ({
        id: a.id,
        organization: a.organization,
        forces: a.forces ?? null,
        vehicles: a.vehicles ?? null,
        notes: a.notes,
      })),
      findings: await this.findings(em, report, ctx),
      compensationTotal: Math.round(personnel.reduce((sum, p) => sum + p.compensation.amount, 0) * 100) / 100,
      version: report.version,
    };
  }

  // ----- Workflow -----

  /** Marks the report as edited by a releaser: from now on only releasers may change it. */
  lockBy(report: ReportEntity, user: AuthenticatedUser): void {
    if (user.grant(RELEASE) !== 'brigade') return;
    report.locked = true;
    report.lockedBy = user.displayName;
    report.lockedAt = new Date();
  }

  /**
   * Makes the report primary. A unit report only while the incident has no department report. `force` (data of
   * another system, a department report replacing a unit report as primary) also moves the role of released reports.
   */
  async setPrimary(em: EntityManager, report: ReportEntity, force = false): Promise<void> {
    if (report.primary) return;
    if (report.unit && (await em.count(ReportEntity, { incident: report.incident, departmentId: { $ne: null } }))) {
      throw new BadRequestException({ code: 'incidents.unitReportNotPrimary' });
    }
    const current = await em.findOne(ReportEntity, { incident: report.incident, primary: true });
    // A released primary report keeps its role: it is unlocked first. The statistics stay with the incident.
    if (!force && current?.status.startsWith('released')) throw new ForbiddenException({ code: 'incidents.reportReleased' });
    if (current) {
      current.primary = false;
      // The unique index allows one primary report; switch in two steps.
      await em.flush();
    }
    report.primary = true;
  }

  /** Author reports the report as finished. Errors block; warnings need an acknowledgement with reason. */
  async submit(em: EntityManager, report: ReportEntity, user: AuthenticatedUser, acknowledgements: Acknowledgement[]): Promise<void> {
    if (report.status !== 'draft') throw new ConflictException({ code: 'incidents.invalidTransition', from: report.status });
    // The acknowledgements are stored only if the report is submitted: a refused submit changes nothing.
    const acknowledged = this.withAcknowledgements(report, user, acknowledgements);
    const findings = await this.findings(em, report, await this.contextFor(report), acknowledged);
    const blocking = findings.filter((f) => f.level === 'error' && f.rule !== 'primary-missing');
    if (blocking.length) throw new BadRequestException({ code: 'incidents.findingsOpen', findings: blocking });
    const open = findings.filter((f) => f.level === 'warning' && !f.acknowledged);
    if (open.length) throw new BadRequestException({ code: 'incidents.warningsNotAcknowledged', findings: open });
    report.acknowledgements = acknowledged;
    report.status = 'review';
    report.returnComment = null;
  }

  /**
   * Gives a submitted report back to its author. A report locked by a releaser is returned only by releasers; the
   * lock is lifted only with the permission to unlock, otherwise it stays (the releasers complete the draft).
   */
  async returnToAuthor(report: ReportEntity, comment: string, user: AuthenticatedUser): Promise<void> {
    if (report.status !== 'review') throw new ConflictException({ code: 'incidents.invalidTransition', from: report.status });
    if (report.locked && user.grant(RELEASE) !== 'brigade') throw new ForbiddenException({ code: 'incidents.reportLocked', lockedBy: report.lockedBy ?? '' });
    report.status = 'draft';
    report.returnComment = comment;
    if (user.grant(UNLOCK) === 'brigade') {
      report.locked = false;
      report.lockedBy = null;
      report.lockedAt = null;
    }
    await this.audit.log('incidents.report-returned', { reportId: report.id, reportNumber: report.number, dispatchNumber: report.incident.dispatchNumber, comment });
  }

  /**
   * Releases for compensation or for billing (which includes compensation).
   * Errors block; releasing acknowledges the remaining warnings. The report gets locked.
   */
  async release(em: EntityManager, report: ReportEntity, user: AuthenticatedUser, level: ReleaseLevel): Promise<void> {
    const target: ReportStatus = level === 'billing' ? 'released-billing' : 'released-compensation';
    if (level === 'compensation' && !(await this.contexts.settingsOnly()).compensationRelease) {
      throw new BadRequestException({ code: 'incidents.compensationReleaseDisabled' });
    }
    // Only submitted reports are released (drafts are submitted first, with their warnings explained);
    // billing also follows the release for compensation.
    const from: ReportStatus[] = level === 'billing' ? ['review', 'released-compensation'] : ['review'];
    if (!from.includes(report.status)) {
      throw new ConflictException({ code: 'incidents.invalidTransition', from: report.status });
    }
    const findings = await this.findings(em, report, await this.contextFor(report));
    const blocking = findings.filter((f) => f.level === 'error');
    if (blocking.length) throw new BadRequestException({ code: 'incidents.findingsOpen', findings: blocking });
    this.addAcknowledgements(
      report,
      user,
      findings.filter((f) => f.level === 'warning' && !f.acknowledged).map((f) => ({ rule: f.rule, subject: f.subject, reason: 'released' })),
    );
    report.status = target;
    this.lockBy(report, user);
    await em.flush();
    await this.audit.log('incidents.report-released', { reportId: report.id, reportNumber: report.number, dispatchNumber: report.incident.dispatchNumber, level });
    await this.publishReleased(em, report, level);
  }

  /**
   * Publishes `incidents.report.released` again for released reports of a period,
   * e.g. after installing the compensation or respiratory protection module. Receivers replace their data.
   */
  async republish(em: EntityManager, from: string, to: string): Promise<number> {
    const reports = await em.find(
      ReportEntity,
      { status: { $in: ['released-compensation', 'released-billing'] }, alarmedAt: { $gte: berlinDayStart(from), $lt: berlinDayAfter(to) } },
      { populate: REPORT_POPULATE },
    );
    for (const report of reports) await this.publishReleased(em, report, report.status === 'released-billing' ? 'billing' : 'compensation');
    return reports.length;
  }

  private async publishReleased(em: EntityManager, report: ReportEntity, level: 'compensation' | 'billing'): Promise<void> {
    const context = await this.contextFor(report);
    const dto = await this.toDto(em, report, context);
    await this.events.publish<ReportReleasedEvent>(INCIDENTS_EVENTS.reportReleased, {
      reportId: report.id,
      incidentId: report.incident.id,
      departmentId: report.departmentId ?? null,
      unit: report.unit ?? null,
      level,
      alarmedAt: report.alarmedAt.toISOString(),
      dispatchNumber: report.incident.dispatchNumber,
      reportNumber: report.number,
      alarmKeyword: report.incident.alarmKeyword,
      compensationKind: context.keywords.get(report.incident.alarmKeyword)?.compensationKind ?? 'incident',
      personnel: dto.personnel.flatMap((p) =>
        p.personId
          ? [
              {
                personId: p.personId,
                vehicleId: p.vehicleId,
                breathingApparatus: p.breathingApparatus,
                breathingMinutes: p.breathingMinutes,
                chemicalSuit: p.chemicalSuit,
                breathingDevice: p.breathingDevice,
                from: p.from,
                to: p.to,
                hours: p.compensation.hours,
                rate: p.compensation.rate,
                amount: p.compensation.amount,
                duringWorkingHours: p.duringWorkingHours,
                lossOfEarnings: p.lossOfEarnings,
              },
            ]
          : [],
      ),
      vehicleIds: report.vehicles.getItems().map((v) => v.vehicleId),
    });
  }

  async unlock(em: EntityManager, report: ReportEntity, reason: string, toStatus: 'draft' | 'review'): Promise<void> {
    if (!report.locked && !report.status.startsWith('released')) {
      throw new ConflictException({ code: 'incidents.notLocked' });
    }
    // A locked draft was never submitted: it stays a draft, so submitting and its warnings are not skipped.
    if (report.status === 'draft' && toStatus !== 'draft') {
      throw new ConflictException({ code: 'incidents.invalidTransition', from: report.status });
    }
    report.locked = false;
    report.lockedBy = null;
    report.lockedAt = null;
    report.status = toStatus;
    await em.flush();
    await this.audit.log('incidents.report-unlocked', { reportId: report.id, reportNumber: report.number, dispatchNumber: report.incident.dispatchNumber, reason, toStatus });
    await this.publishUnlocked(report, reason);
  }

  /**
   * Tells the receivers of the release (compensation, respiratory protection) to withdraw what they took from the
   * report: after unlocking it and after deleting it (a deleted draft may have been released before).
   */
  async publishUnlocked(report: Pick<ReportEntity, 'id' | 'incident'>, reason: string): Promise<void> {
    await this.events.publish<ReportUnlockedEvent>(INCIDENTS_EVENTS.reportUnlocked, { reportId: report.id, incidentId: report.incident.id, reason });
  }

  // ----- Incident -----

  /** Whether the annual statistics of the incident's year (Europe/Berlin) are closed: then its statistics are fixed. */
  async statisticsClosed(em: EntityManager, incident: IncidentEntity): Promise<boolean> {
    const year = Number(localDate(incident.alarmedAt.toISOString()).slice(0, 4));
    return Boolean((await em.findOne(StatisticsYearEntity, year))?.closedAt);
  }

  /**
   * Who changes the statistics of an incident (apart from a closed year): releasers always, writers of a report of
   * the incident (its department or unit) while one of those reports is an unlocked draft.
   */
  statisticsAccess(user: AuthenticatedUser, reports: readonly ReportEntity[]): 'write' | 'submitted' | 'none' {
    if (user.grant(RELEASE) === 'brigade') return 'write';
    const own = reports.filter((r) => this.canWrite(user, r));
    if (!own.length) return 'none';
    return own.some((r) => r.status === 'draft' && !r.locked) ? 'write' : 'submitted';
  }

  /**
   * Sets or removes (`null`) the statistics of an incident. Changes nothing else: no lock, no new release and no
   * events (compensation and respiratory protection do not depend on them). Only keywords counted in the statistics
   * (with a main type) carry statistics; a closed year keeps its statistics.
   */
  async setStatistics(em: EntityManager, incident: IncidentEntity, statistics: IncidentStatistics | null, version: number, user: AuthenticatedUser): Promise<void> {
    await em.populate(incident, ['reports']);
    const access = this.statisticsAccess(user, incident.reports.getItems());
    if (access === 'none') throw new ForbiddenException({ code: 'auth.forbidden', permissions: [WRITE] });
    if (access === 'submitted') throw new ForbiddenException({ code: 'incidents.statisticsSubmitted' });
    if (await this.statisticsClosed(em, incident)) throw new ConflictException({ code: 'incidents.statisticsClosed' });
    assertVersion(incident, version);
    if (statistics) {
      const keyword = await em.findOne(AlarmKeywordEntity, { key: incident.alarmKeyword });
      if (!keyword?.mainType) throw new BadRequestException({ code: 'incidents.statisticsNotCounted', keyword: incident.alarmKeyword });
    }
    incident.statistics = statistics;
  }

  /** Incidents as the API returns them, with the statistics and what the user may do with them; needs `reports`. */
  async incidentDtos(em: EntityManager, incidents: readonly IncidentEntity[], user: AuthenticatedUser): Promise<Incident[]> {
    if (!incidents.length) return [];
    const [keywords, settings, closed] = await Promise.all([
      em.find(AlarmKeywordEntity, { key: { $in: [...new Set(incidents.map((i) => i.alarmKeyword))] } }),
      this.contexts.settingsOnly(),
      em.find(StatisticsYearEntity, { closedAt: { $ne: null } }, { fields: ['year'] }),
    ]);
    const byKey = new Map(keywords.map((k) => [k.key, k]));
    const closedYears = new Set(closed.map((y) => y.year));
    return incidents.map((incident) => {
      const keyword = byKey.get(incident.alarmKeyword);
      const counted = Boolean(keyword?.mainType);
      const reports = incident.reports.getItems();
      const year = Number(localDate(incident.alarmedAt.toISOString()).slice(0, 4));
      return {
        id: incident.id,
        dispatchNumber: incident.dispatchNumber,
        internalNumber: incident.internalNumber,
        alarmKeyword: incident.alarmKeyword,
        alarmMessage: incident.alarmMessage,
        alarmedAt: incident.alarmedAt.toISOString(),
        location: incident.location,
        createdVia: incident.createdVia,
        chargeable: incident.chargeable,
        chargeableReason: incident.chargeableReason,
        notes: incident.notes,
        statistics: incident.statistics ?? null,
        statisticsSuggestion: counted && !incident.statistics ? suggestStatistics(incident, keyword, settings.homeMunicipalities) : null,
        statisticsCounted: counted,
        statisticsEditable: !closedYears.has(year) && this.statisticsAccess(user, reports) === 'write',
        reports: reports
          .toSorted((a, b) => Number(b.primary) - Number(a.primary) || a.number.localeCompare(b.number))
          .map((r) => ({
            id: r.id,
            departmentId: r.departmentId ?? null,
            unit: r.unit ?? null,
            number: r.number,
            primary: r.primary,
            status: r.status,
            locked: r.locked,
            authorPersonId: r.authorPersonId ?? null,
          })),
        version: incident.version,
      };
    });
  }

  /**
   * Moves the alarm time of the reports that still start with the old alarm time of the incident, and with it
   * the default end (alarm + 1 h) of reports whose end is not confirmed, and personnel and vehicles starting at the old time.
   */
  moveAlarm(incident: IncidentEntity, previous: Date, next: Date): void {
    const shift = next.getTime() - previous.getTime();
    if (!shift) return;
    for (const report of incident.reports.getItems()) {
      if (report.alarmedAt.getTime() !== previous.getTime()) continue;
      report.alarmedAt = next;
      if (!report.endConfirmed) report.returnedAt = new Date(report.returnedAt.getTime() + shift);
      for (const p of report.personnel.isInitialized() ? report.personnel.getItems() : []) {
        if (p.from && p.from.getTime() === previous.getTime()) p.from = next;
      }
      for (const v of report.vehicles.isInitialized() ? report.vehicles.getItems() : []) {
        if (v.alarmedAt && v.alarmedAt.getTime() === previous.getTime()) v.alarmedAt = next;
        if (v.departedAt && v.departedAt.getTime() === previous.getTime()) v.departedAt = next;
      }
    }
  }

  /** The stored acknowledgements plus the new ones (the first reason of a warning counts); changes nothing. */
  private withAcknowledgements(report: ReportEntity, user: AuthenticatedUser, acknowledgements: Acknowledgement[]): StoredAcknowledgement[] {
    const existing = report.acknowledgements ?? [];
    const keys = new Set(existing.map((a) => `${a.rule}|${a.subject ?? ''}`));
    const added = acknowledgements
      .filter((a) => !keys.has(`${a.rule}|${a.subject ?? ''}`))
      .map((a) => ({ rule: a.rule, subject: a.subject ?? null, reason: a.reason, userId: user.id, at: new Date().toISOString() }));
    return added.length ? [...existing, ...added] : existing;
  }

  private addAcknowledgements(report: ReportEntity, user: AuthenticatedUser, acknowledgements: Acknowledgement[]): void {
    const next = this.withAcknowledgements(report, user, acknowledgements);
    if (next !== report.acknowledgements) report.acknowledgements = next;
  }
}
