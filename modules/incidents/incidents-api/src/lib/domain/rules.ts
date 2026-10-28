import {
  DEFAULT_RULE_LEVELS,
  type IncidentSettings,
  type IncidentStatistics,
  type MainType,
  type RuleId,
  type RuleLevel,
} from '@forga/incidents-contracts';

const HOUR = 3_600_000;

/** One assignment of a person, as the rules need it. */
export interface Assignment {
  /** Person ID, or `guest:<name>` for guests. */
  key: string;
  personId: string | null;
  label: string;
  vehicleId: string | null;
  standbyStationId: string | null;
  from: string;
  to: string;
  breathingApparatus: boolean;
  lossOfEarnings: boolean;
  duringWorkingHours: boolean;
  /** `null` if no rate is configured for the date (and the person would be compensated). */
  rateMissing: boolean;
}

/** What the rules need to know about a person on the incident date (from the master data). */
export interface PersonFacts {
  status: string;
  /** Departments with a membership on the incident date. */
  departmentIds: readonly string[];
  birthDate: string | null;
}

export interface RuleInput {
  primary: boolean;
  incidentHasPrimary: boolean;
  times: { alarmedAt: string; departedAt?: string | null; arrivedAt?: string | null; endedAt?: string | null; returnedAt: string };
  /** `false` while the end is still the default (alarm + 1 h) and not confirmed by the author. */
  endConfirmed?: boolean;
  /** Alarm time of the incident; the primary report starts with it. */
  incidentAlarmedAt?: string;
  situation: string;
  actions: string;
  statistics: IncidentStatistics | null;
  /** Department of the report (always operational); unset for the report of a unit. */
  departmentId?: string;
  /**
   * Set for the report of a brigade-wide unit (e.g. the duty officer): its persons come from every department, and
   * they need a vehicle only if the unit says so.
   */
  unit?: { vehicleRequired: boolean };
  /** Keyword of the incident; `null` if unknown. */
  keyword: { mainType: MainType | null; requiresVehicle: boolean } | null;
  personnel: Assignment[];
  /** Assignments in the other reports of the same incident. */
  sameIncident: { department: string; assignments: Pick<Assignment, 'personId' | 'from' | 'to'>[] }[];
  /** Assignments of the same persons in other incidents. */
  otherIncidents: { dispatchNumber: string; personId: string; from: string; to: string }[];
  /** Seats and designation per vehicle ID. */
  vehicles: ReadonlyMap<string, { seats: number; designation: string }>;
  /** Valid qualification keys per person ID. */
  qualifications: ReadonlyMap<string, readonly string[]>;
  /** Status, memberships and birth date per person ID on the incident date; persons missing here are not checked. */
  persons?: ReadonlyMap<string, PersonFacts>;
  /** Minimum age for incidents from the membership settings (statute). */
  minimumAge?: number;
  /** Traffic light of the respiratory protection module on the alarm date; empty without that module. */
  breathingFitness?: ReadonlyMap<string, 'green' | 'yellow' | 'red' | 'grey'>;
}

export interface RawFinding {
  rule: RuleId;
  level: RuleLevel;
  subject: string | null;
  params: Record<string, string | number>;
}

/** Person statuses that do not take part in incidents. */
const NOT_OPERATIONAL = new Set(['youth', 'veterans', 'passive', 'left']);

/** Intervals that only touch at their ends do not overlap. */
export function overlaps(a: { from: string; to: string }, b: { from: string; to: string }): boolean {
  return new Date(a.from) < new Date(b.to) && new Date(b.from) < new Date(a.to);
}

const durationHours = (a: { from: string; to: string }) => (new Date(a.to).getTime() - new Date(a.from).getTime()) / HOUR;
const time = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : null);

/** Age in full years on the date (`YYYY-MM-DD` or ISO). */
export function ageOn(birthDate: string, date: string): number {
  const [by, bm, bd] = birthDate.slice(0, 10).split('-').map(Number);
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

/** The first pair of report times in the wrong order, e.g. `arrivedAt` before `alarmedAt`. */
function wrongOrder(times: RuleInput['times']): { first: string; second: string } | null {
  const steps = (['alarmedAt', 'departedAt', 'arrivedAt', 'endedAt', 'returnedAt'] as const)
    .map((key) => ({ key, at: time(times[key]) }))
    .filter((s): s is { key: (typeof s)['key']; at: number } => s.at !== null);
  for (let i = 1; i < steps.length; i++) {
    for (let j = 0; j < i; j++) {
      // Start and end of the whole report are covered by `times-invalid`.
      if (steps[j].key === 'alarmedAt' && steps[i].key === 'returnedAt') continue;
      if (steps[i].at < steps[j].at) return { first: steps[j].key, second: steps[i].key };
    }
  }
  return null;
}

/**
 * Checks a report against the rules of the former MP-Feuer check app and further plausibility rules.
 * Rules can be switched off and their level changed in the settings.
 */
export function evaluateRules(input: RuleInput, settings: IncidentSettings): RawFinding[] {
  const findings: RawFinding[] = [];
  const add = (rule: RuleId, subject: string | null = null, params: Record<string, string | number> = {}) => {
    const configured = settings.rules[rule];
    if (configured?.enabled === false) return;
    findings.push({ rule, level: configured?.level ?? DEFAULT_RULE_LEVELS[rule], subject, params });
  };
  const long = settings.longDurationHours;

  if (!input.incidentHasPrimary) add('primary-missing');
  if (!input.situation.trim() && !input.actions.trim()) add('report-empty');

  const counted = input.keyword?.mainType !== null && input.keyword !== null;
  if (input.primary && counted && !input.statistics) add('statistics-missing');
  if (input.statistics && (!input.primary || !counted)) add('statistics-not-allowed');

  if (input.personnel.length === 0) add('no-personnel');

  const reportFrom = time(input.times.alarmedAt)!;
  const reportTo = time(input.times.returnedAt)!;
  if (reportTo <= reportFrom) add('times-invalid');
  else if (durationHours({ from: input.times.alarmedAt, to: input.times.returnedAt }) > long) add('duration-long', null, { hours: long });
  const order = wrongOrder(input.times);
  if (order) add('times-order', null, order);
  if (input.endConfirmed === false) add('end-unconfirmed');
  if (input.incidentAlarmedAt) {
    // The primary report starts with the alarm of the incident; departments alerted later start later, never earlier.
    const incidentAlarm = time(input.incidentAlarmedAt)!;
    if (input.primary ? reportFrom !== incidentAlarm : reportFrom < incidentAlarm) add('incident-time-differs');
  }

  const vehicleRequired = (input.keyword?.requiresVehicle ?? true) && (input.unit?.vehicleRequired ?? true);
  const crew = new Map<string, number>();

  for (const p of input.personnel) {
    if (vehicleRequired && !p.vehicleId && !p.standbyStationId) add('vehicle-missing', p.key, { person: p.label });
    const invalid = new Date(p.to) <= new Date(p.from);
    if (invalid) add('times-invalid', p.key, { person: p.label });
    else if (durationHours(p) > long) add('personnel-duration-long', p.key, { person: p.label, hours: long });
    if (!invalid && reportTo > reportFrom && (time(p.from)! < reportFrom || time(p.to)! > reportTo)) add('personnel-times-outside', p.key, { person: p.label });
    if (p.duringWorkingHours && p.lossOfEarnings) add('working-hours-and-loss-of-earnings', p.key, { person: p.label });
    if (p.rateMissing) add('rate-missing', p.key, { person: p.label });
    if (p.vehicleId) crew.set(p.vehicleId, (crew.get(p.vehicleId) ?? 0) + 1);
    if (!p.personId) continue;

    const facts = input.persons?.get(p.personId);
    if (facts) {
      if (NOT_OPERATIONAL.has(facts.status)) add('person-not-operational', p.key, { person: p.label, status: facts.status });
      else if (input.departmentId && !input.unit && !facts.departmentIds.includes(input.departmentId)) {
        add('person-not-member', p.key, { person: p.label });
      }
      if (facts.birthDate && input.minimumAge && ageOn(facts.birthDate, localDay(input.times.alarmedAt)) < input.minimumAge) {
        add('person-too-young', p.key, { person: p.label, age: input.minimumAge });
      }
    }
    if (p.breathingApparatus && !(input.qualifications.get(p.personId) ?? []).includes('breathing-apparatus')) {
      add('breathing-without-qualification', p.key, { person: p.label });
    } else if (p.breathingApparatus && input.breathingFitness?.get(p.personId) === 'red') {
      add('breathing-not-fit', p.key, { person: p.label });
    }
    for (const other of input.sameIncident) {
      if (other.assignments.some((a) => a.personId === p.personId && overlaps(a, p))) {
        add('personnel-overlap-incident', p.key, { person: p.label, department: other.department });
      }
    }
    // Long periods in other incidents (e.g. imported duty officer periods) are not compared; a long assignment
    // in this report is reported by `personnel-duration-long` and still compared.
    for (const other of input.otherIncidents) {
      if (other.personId === p.personId && durationHours(other) <= long && overlaps(other, p)) {
        add('personnel-overlap-other', p.key, { person: p.label, dispatchNumber: other.dispatchNumber });
      }
    }
  }

  for (const [vehicleId, count] of crew) {
    const vehicle = input.vehicles.get(vehicleId);
    if (vehicle && vehicle.seats > 0 && count > vehicle.seats) add('crew-exceeded', vehicleId, { count, seats: vehicle.seats, vehicle: vehicle.designation });
  }
  return findings;
}

/** Calendar day in Europe/Berlin of an ISO time. */
function localDay(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
}
