import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { addBerlinDays, Audit, berlinDate, berlinDayAfter, ModuleStateService, SettingsService } from '@forga/core-api';
import type { BrigadeSettings, LocalizedText } from '@forga/core-contracts';
import {
  type BookingWindowSettings,
  INCIDENT_UNITS,
  type IncidentUnits,
  INCIDENTS_TERMINAL_BOOKING,
  type IncidentsTerminalBooking,
  type TerminalActor,
  type TerminalBookingInput,
  type TerminalReport,
} from '@forga/incidents-contracts';
import {
  type InfoTerminalSettings,
  type KioskAttendance,
  type KioskDepartment,
  type KioskDriverLicense,
  KioskDriverLicenseInput,
  type KioskEntry,
  type KioskIncident,
  KioskIncidentInput,
  type KioskMatch,
  type KioskOverview,
  type KioskPerson,
  type KioskReport,
  type KioskSession,
  type KioskSessionDetail,
  type KioskTerminal,
  type KioskVehicle,
} from '@forga/info-terminal-contracts';
import {
  type Department,
  type DepartmentType,
  MASTERDATA_LICENSE_SELF_CHECK,
  type MasterdataLicenseSelfCheck,
  ORGANIZATION,
  type Organization,
  PERSON_DIRECTORY,
  type PersonDirectory,
  type PersonStatus,
  type Station,
  vehicleLabel,
} from '@forga/masterdata-contracts';
import {
  TRAINING_TERMINAL_CHECK_IN,
  type TerminalCheckInInput,
  type TerminalSession,
  type TerminalSessionScope,
  type TrainingTerminalCheckIn,
} from '@forga/training-contracts';
import type { z } from 'zod';
import type { TerminalEntity } from '../info-terminal.entities.js';
import { RateLimiter } from '../security/rate-limit.js';

/** Statuses of the persons on the name tiles of a department: active members there (in youth and veterans departments their status there). */
function tileStatuses(type: DepartmentType): readonly PersonStatus[] {
  if (type === 'youth' || type === 'children') return ['youth'];
  if (type === 'veterans') return ['veterans'];
  return ['probation', 'active'];
}

const tooMany = () => new HttpException({ code: 'info-terminal.tooManyRequests' }, HttpStatus.TOO_MANY_REQUESTS);

/** Tolerance for clocks: an alarm a few minutes in the future (clock of the device ahead) is still accepted. */
const FUTURE_TOLERANCE_MS = 5 * 60_000;

/**
 * What an info terminal may do: book persons into the open department reports and sessions of its departments, and
 * create incidents. It reads only what it needs (names, keyword, alarm, location, the bookings of the own report).
 */
@Injectable()
export class KioskService {
  /** At most 120 changes in 10 minutes and 30 searches a minute per terminal. */
  private readonly writes = new RateLimiter(120, 10 * 60_000);
  private readonly searches = new RateLimiter(30, 60_000);
  /** At most 10 unknown licence stickers in 10 minutes per terminal (then blocked for 10 minutes); one audit entry an hour. */
  private readonly unknownCodes = new RateLimiter(10, 10 * 60_000, 10 * 60_000);
  private readonly unknownCodesLogged = new RateLimiter(1, 60 * 60_000);

  constructor(
    private readonly settings: SettingsService,
    private readonly modules: ModuleStateService,
    private readonly audit: Audit,
    @Inject(ORGANIZATION) private readonly organization: Organization,
    @Inject(PERSON_DIRECTORY) private readonly directory: PersonDirectory,
    @Inject(INCIDENTS_TERMINAL_BOOKING) private readonly booking: IncidentsTerminalBooking,
    @Inject(INCIDENT_UNITS) private readonly units: IncidentUnits,
    @Optional() @Inject(TRAINING_TERMINAL_CHECK_IN) private readonly checkIns?: TrainingTerminalCheckIn,
    @Optional() @Inject(MASTERDATA_LICENSE_SELF_CHECK) private readonly licenses?: MasterdataLicenseSelfCheck,
  ) {}

  async moduleSettings(): Promise<InfoTerminalSettings> {
    return (await this.settings.get<InfoTerminalSettings>('info-terminal.general')) as InfoTerminalSettings;
  }

  private window(settings: InfoTerminalSettings): BookingWindowSettings {
    return { afterEndMinutes: settings.afterEndMinutes, openEndHours: settings.openEndHours };
  }

  /** Sessions at the terminal: allowed for it and the module training active. */
  private async trainingEnabled(terminal: TerminalEntity): Promise<boolean> {
    return terminal.allowTraining && Boolean(this.checkIns) && !(await this.modules.inactiveIds()).has('training');
  }

  private async station(terminal: TerminalEntity): Promise<Station> {
    const station = (await this.organization.stations()).find((s) => s.id === terminal.stationId);
    if (!station) throw new ForbiddenException({ code: 'info-terminal.revoked' });
    return station;
  }

  /** Departments of the switcher: still existing, the station's first; without training only operational ones. */
  private async departments(terminal: TerminalEntity, training: boolean): Promise<Department[]> {
    const all = await this.organization.departments();
    return terminal.departmentIds.flatMap((id, index) => {
      const department = all.find((d) => d.id === id);
      if (!department) return [];
      return index === 0 || training || department.type === 'operational' ? [department] : [];
    });
  }

  /** The department of a request: one of the terminal's, else `403 info-terminal.departmentNotAllowed`. */
  async department(terminal: TerminalEntity, departmentId: string | undefined): Promise<Department> {
    const department = (await this.departments(terminal, true)).find((d) => d.id === departmentId);
    if (!department) throw new ForbiddenException({ code: 'info-terminal.departmentNotAllowed' });
    return department;
  }

  private operational(department: Department): void {
    if (department.type !== 'operational') throw new ForbiddenException({ code: 'info-terminal.notOperational' });
  }

  /** Counts a change of the terminal; `429` above the limit. */
  write(terminal: TerminalEntity): void {
    if (!this.writes.hit(terminal.id)) throw new HttpException({ code: 'info-terminal.tooManyRequests' }, HttpStatus.TOO_MANY_REQUESTS);
  }

  private actor(terminal: TerminalEntity, userName: string): TerminalActor {
    return { terminalId: terminal.id, userId: terminal.userId, userName, stationId: terminal.stationId };
  }

  private async actorName(terminal: TerminalEntity): Promise<string> {
    const station = await this.station(terminal);
    return `Infoterminal ${station.name} · ${terminal.name}`;
  }

  async terminal(terminal: TerminalEntity): Promise<KioskTerminal> {
    const [settings, station, training, brigade, driverLicenseCheck] = await Promise.all([
      this.moduleSettings(),
      this.station(terminal),
      this.trainingEnabled(terminal),
      this.settings.get<BrigadeSettings>('brigade'),
      this.licenses?.enabled() ?? Promise.resolve(false),
    ]);
    const departments = await this.departments(terminal, training);
    return {
      brigadeName: brigade?.name ?? '',
      station: { id: station.id, name: station.name, city: station.city },
      name: terminal.name,
      departments: departments.map((d): KioskDepartment => ({ id: d.id, name: d.name, shortName: d.shortName, operational: d.type === 'operational' })),
      allowNewIncident: terminal.allowNewIncident,
      training,
      driverLicenseCheck,
      language: terminal.language,
      idleSeconds: settings.idleSeconds,
      maxAlarmAgeHours: settings.maxAlarmAgeHours,
      afterEndMinutes: settings.afterEndMinutes,
      openEndHours: settings.openEndHours,
      now: new Date().toISOString(),
    };
  }

  private incident(r: TerminalReport): KioskIncident {
    return { reportId: r.reportId, alarmKeyword: r.alarmKeyword, alarmedAt: r.alarmedAt, street: r.street, city: r.city, endedAt: r.endedAt, closesAt: r.closesAt, bookable: r.bookable, booked: r.booked };
  }

  private scope(terminal: TerminalEntity, department: Department, settings: InfoTerminalSettings): TerminalSessionScope {
    return { departmentId: department.id, stationId: terminal.stationId, afterEndMinutes: settings.afterEndMinutes };
  }

  private session(s: TerminalSession, station: Station): KioskSession {
    return {
      sessionId: s.sessionId,
      title: s.title,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      stationName: s.stationId === station.id ? station.name : null,
      opensAt: s.opensAt,
      closesAt: s.closesAt,
      present: s.present,
    };
  }

  /** Open incidents of operational departments, and sessions: open, opening later today, the next one after today. */
  async overview(terminal: TerminalEntity, departmentId: string | undefined): Promise<KioskOverview> {
    const department = await this.department(terminal, departmentId);
    const settings = await this.moduleSettings();
    const now = new Date();
    const incidents = department.type === 'operational' ? (await this.booking.openReports(department.id, this.window(settings), now)).map((r) => this.incident(r)) : [];
    const result: KioskOverview = { incidents, sessions: [], upcoming: [], next: null, now: now.toISOString() };
    if (!(await this.trainingEnabled(terminal))) return result;
    const station = await this.station(terminal);
    const tomorrow = berlinDayAfter(berlinDate(now));
    const sessions = await this.checkIns!.sessions(this.scope(terminal, department, settings), now, addBerlinDays(now, 14));
    for (const s of sessions) {
      const opens = new Date(s.opensAt);
      if (opens <= now && new Date(s.closesAt) >= now) result.sessions.push(this.session(s, station));
      else if (opens > now && opens < tomorrow) result.upcoming.push(this.session(s, station));
      else if (opens >= tomorrow && !result.next) result.next = this.session(s, station);
    }
    return result;
  }

  /** Name tiles: persons with a membership in the department today and active there, by last name. */
  async members(terminal: TerminalEntity, departmentId: string | undefined): Promise<KioskPerson[]> {
    const department = await this.department(terminal, departmentId);
    const statuses = tileStatuses(department.type);
    const members = await this.directory.membersOn(berlinDate());
    return members
      .filter((p) => p.departmentIds.includes(department.id) && statuses.includes(p.status))
      .map((p) => ({ id: p.id, firstName: p.firstName, lastName: p.lastName, departments: [] }))
      .toSorted((a, b) => a.lastName.localeCompare(b.lastName, 'de') || a.firstName.localeCompare(b.firstName, 'de'));
  }

  /** Search over all persons who have not left (from 3 letters, at most 10): name and short names of the departments. */
  async search(terminal: TerminalEntity, departmentId: string | undefined, query: string): Promise<KioskPerson[]> {
    await this.department(terminal, departmentId);
    if (!this.searches.hit(terminal.id)) throw new HttpException({ code: 'info-terminal.tooManyRequests' }, HttpStatus.TOO_MANY_REQUESTS);
    if (query.trim().length < 3) return [];
    const [found, departments] = await Promise.all([this.directory.search(query.trim(), { limit: 10 }), this.organization.departments()]);
    const short = new Map(departments.map((d) => [d.id, d.shortName]));
    return found
      .filter((p) => p.status !== 'left')
      .slice(0, 10)
      .map((p) => ({ id: p.id, firstName: p.firstName, lastName: p.lastName, departments: p.departmentIds.flatMap((d) => (short.has(d) ? [short.get(d)!] : [])) }));
  }

  private async names(personIds: readonly string[]): Promise<Map<string, { firstName: string; lastName: string }>> {
    return new Map((await this.directory.snapshots([...new Set(personIds)])).map((p) => [p.id, { firstName: p.firstName, lastName: p.lastName }]));
  }

  async report(terminal: TerminalEntity, departmentId: string | undefined, reportId: string): Promise<KioskReport> {
    const department = await this.department(terminal, departmentId);
    this.operational(department);
    const settings = await this.moduleSettings();
    const detail = await this.booking.report(reportId, department.id, this.window(settings));
    const [names, departments, vehicles, functions] = await Promise.all([
      this.names(detail.entries.map((e) => e.personId)),
      this.organization.departments(),
      this.organization.vehicles(),
      this.organization.catalog('function'),
    ]);
    const departmentName = new Map(departments.map((d) => [d.id, d.name]));
    const shortName = new Map(departments.map((d) => [d.id, d.shortName]));
    const elsewhere: Record<string, LocalizedText> = {};
    for (const [personId, owner] of Object.entries(detail.elsewhere)) {
      const unit = owner.unit ? this.units.get(owner.unit) : undefined;
      const name = owner.departmentId ? departmentName.get(owner.departmentId) : undefined;
      elsewhere[personId] = name ? { de: name, en: name } : (unit?.label ?? { de: owner.unit ?? '', en: owner.unit ?? '' });
    }
    const entries: KioskEntry[] = detail.entries.map((e) => ({
      personId: e.personId,
      firstName: names.get(e.personId)?.firstName ?? '',
      lastName: names.get(e.personId)?.lastName ?? '',
      vehicleId: e.vehicleId,
      standby: Boolean(e.standbyStationId),
      function: e.function,
      breathingApparatus: e.breathingApparatus,
      from: e.from,
      to: e.to,
      lossOfEarnings: e.lossOfEarnings,
      duringWorkingHours: e.duringWorkingHours,
      editable: e.editable,
      bookedAt: e.bookedAt,
    }));
    // Vehicles in service, and those already in the report (e.g. one taken out of service since).
    const listed = new Set(detail.entries.flatMap((e) => (e.vehicleId ? [e.vehicleId] : [])));
    const offered = vehicles
      .filter((v) => v.status === 'in-service' || listed.has(v.id))
      .map((v): KioskVehicle => ({ id: v.id, label: vehicleLabel(v, shortName.get(v.departmentId)), seats: v.seats, atStation: v.stationId === terminal.stationId }))
      .toSorted((a, b) => Number(b.atStation) - Number(a.atStation) || a.label.localeCompare(b.label, 'de'));
    return {
      ...this.incident(detail),
      entries,
      elsewhere,
      vehicles: offered,
      functions: functions.filter((f) => f.active).map((f) => ({ key: f.key, name: f.name })),
      returnedAt: detail.returnedAt,
    };
  }

  private async entry(terminal: TerminalEntity, departmentId: string | undefined, reportId: string, personId: string): Promise<KioskEntry> {
    const report = await this.report(terminal, departmentId, reportId);
    const entry = report.entries.find((e) => e.personId === personId);
    if (!entry) throw new NotFoundException({ code: 'info-terminal.entryNotFound' });
    return entry;
  }

  async book(terminal: TerminalEntity, departmentId: string | undefined, reportId: string, input: TerminalBookingInput): Promise<KioskEntry> {
    const department = await this.department(terminal, departmentId);
    this.operational(department);
    this.write(terminal);
    const settings = await this.moduleSettings();
    await this.booking.book(reportId, department.id, input, this.actor(terminal, await this.actorName(terminal)), this.window(settings));
    return this.entry(terminal, department.id, reportId, input.personId);
  }

  async cancel(terminal: TerminalEntity, departmentId: string | undefined, reportId: string, personId: string): Promise<void> {
    const department = await this.department(terminal, departmentId);
    this.operational(department);
    this.write(terminal);
    const settings = await this.moduleSettings();
    await this.booking.cancel(reportId, department.id, personId, this.actor(terminal, await this.actorName(terminal)), this.window(settings));
  }

  async keywords(terminal: TerminalEntity) {
    if (!terminal.allowNewIncident) throw new ForbiddenException({ code: 'info-terminal.newIncidentNotAllowed' });
    return this.booking.keywords();
  }

  /** Checks the form of "Neuer Einsatz": allowed, operational department, alarm today within `maxAlarmAgeHours`. */
  private async assertNewIncident(terminal: TerminalEntity, input: z.output<typeof KioskIncidentInput>): Promise<Department> {
    if (!terminal.allowNewIncident) throw new ForbiddenException({ code: 'info-terminal.newIncidentNotAllowed' });
    const department = await this.department(terminal, input.departmentId);
    this.operational(department);
    const settings = await this.moduleSettings();
    const alarm = new Date(input.alarmedAt).getTime();
    const now = Date.now();
    if (alarm > now + FUTURE_TOLERANCE_MS) throw new BadRequestException({ code: 'info-terminal.alarmInFuture' });
    if (alarm < now - settings.maxAlarmAgeHours * 3_600_000) throw new BadRequestException({ code: 'info-terminal.alarmTooOld', hours: settings.maxAlarmAgeHours });
    return department;
  }

  async matches(terminal: TerminalEntity, input: z.output<typeof KioskIncidentInput>): Promise<KioskMatch[]> {
    const department = await this.assertNewIncident(terminal, input);
    const [matches, departments] = await Promise.all([this.booking.matches({ ...input, dispatchNumber: input.dispatchNumber || null }), this.organization.departments()]);
    const short = new Map(departments.map((d) => [d.id, d.shortName]));
    return matches.map((m) => ({
      incidentId: m.incidentId,
      alarmKeyword: m.alarmKeyword,
      alarmedAt: m.alarmedAt,
      street: m.street,
      city: m.city,
      departments: m.departmentIds.flatMap((d) => (short.has(d) ? [short.get(d)!] : [])),
      ownReport: m.departmentIds.includes(department.id),
    }));
  }

  async createIncident(terminal: TerminalEntity, input: z.output<typeof KioskIncidentInput>): Promise<{ reportId: string }> {
    const department = await this.assertNewIncident(terminal, input);
    this.write(terminal);
    const result = await this.booking.createIncident(
      { alarmKeyword: input.alarmKeyword, alarmedAt: input.alarmedAt, dispatchNumber: input.dispatchNumber || null, street: input.street, city: input.city },
      department.id,
      input.joinIncidentId,
      this.actor(terminal, await this.actorName(terminal)),
    );
    if (result.created !== 'existing') {
      await this.audit.log('info-terminal.incident-created', { terminalId: terminal.id, incidentId: result.incidentId, reportId: result.reportId, departmentId: department.id, joined: result.created === 'report' });
    }
    return { reportId: result.reportId };
  }

  private async training(terminal: TerminalEntity): Promise<TrainingTerminalCheckIn> {
    if (!(await this.trainingEnabled(terminal))) throw new ForbiddenException({ code: 'info-terminal.trainingNotAllowed' });
    return this.checkIns!;
  }

  async sessionDetail(terminal: TerminalEntity, departmentId: string | undefined, sessionId: string): Promise<KioskSessionDetail> {
    const department = await this.department(terminal, departmentId);
    const checkIns = await this.training(terminal);
    const settings = await this.moduleSettings();
    const { session, attendance } = await checkIns.session(sessionId, this.scope(terminal, department, settings));
    const names = await this.names(attendance.map((a) => a.personId));
    return {
      ...this.session(session, await this.station(terminal)),
      attendance: attendance
        .map((a): KioskAttendance => ({ ...a, firstName: names.get(a.personId)?.firstName ?? '', lastName: names.get(a.personId)?.lastName ?? '' }))
        .toSorted((a, b) => a.lastName.localeCompare(b.lastName, 'de') || a.firstName.localeCompare(b.firstName, 'de')),
      breathingApparatus: department.type === 'operational',
    };
  }

  async checkIn(terminal: TerminalEntity, departmentId: string | undefined, sessionId: string, input: TerminalCheckInInput): Promise<void> {
    const department = await this.department(terminal, departmentId);
    const checkIns = await this.training(terminal);
    this.write(terminal);
    const settings = await this.moduleSettings();
    // Breathing apparatus only in the view of an operational department.
    await checkIns.checkIn(sessionId, this.scope(terminal, department, settings), { ...input, breathingApparatus: department.type === 'operational' && Boolean(input.breathingApparatus) });
  }

  async cancelCheckIn(terminal: TerminalEntity, departmentId: string | undefined, sessionId: string, personId: string): Promise<void> {
    const department = await this.department(terminal, departmentId);
    const checkIns = await this.training(terminal);
    this.write(terminal);
    const settings = await this.moduleSettings();
    await checkIns.cancel(sessionId, this.scope(terminal, department, settings), personId);
  }

  /**
   * Self-check of a driving licence: shows name, classes and the latest check of the person whose sticker was scanned,
   * and records the check once the person confirmed the self-declaration. Unknown and revoked stickers look the same.
   */
  async driverLicense(terminal: TerminalEntity, input: z.output<typeof KioskDriverLicenseInput>): Promise<KioskDriverLicense> {
    if (!this.licenses) throw new ForbiddenException({ code: 'info-terminal.licenseCheckOff' });
    if (this.unknownCodes.blocked(terminal.id)) throw tooMany();
    const view = await this.licenses.lookup(input.code);
    if (!view) {
      if (!this.unknownCodes.hit(terminal.id)) throw tooMany();
      if (this.unknownCodesLogged.hit(terminal.id)) await this.audit.log('info-terminal.unknown-license-code', { terminalId: terminal.id }, terminal.userId);
      throw new NotFoundException({ code: 'info-terminal.licenseNotRegistered' });
    }
    if (!input.confirm) return { ...view, confirmed: null };
    this.write(terminal);
    try {
      const confirmed = await this.licenses.confirm(input.code, { terminalId: terminal.id, device: await this.actorName(terminal), language: input.language ?? terminal.language });
      return { ...view, confirmed };
    } catch (error) {
      const code = error instanceof HttpException ? (error.getResponse() as { code?: string }).code : undefined;
      if (code === 'masterdata.inPersonRequired') throw new ConflictException({ code: 'info-terminal.licenseInPerson' });
      if (code === 'masterdata.selfCheckOff') throw new ForbiddenException({ code: 'info-terminal.licenseCheckOff' });
      if (code === 'masterdata.licenseNotRegistered') throw new NotFoundException({ code: 'info-terminal.licenseNotRegistered' });
      throw error;
    }
  }
}
