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

export interface RuleInput {
  primary: boolean;
  incidentHasPrimary: boolean;
  times: { alarmedAt: string; returnedAt: string };
  situation: string;
  actions: string;
  statistics: IncidentStatistics | null;
  departmentType: string;
  /** Keyword of the incident; `null` if unknown. */
  keyword: { mainType: MainType | null; requiresVehicle: boolean } | null;
  personnel: Assignment[];
  /** Assignments in the other reports of the same incident. */
  sameIncident: { department: string; assignments: Pick<Assignment, 'personId' | 'from' | 'to'>[] }[];
  /** Assignments of the same persons in other incidents. */
  otherIncidents: { dispatchNumber: string; personId: string; from: string; to: string }[];
  vehicleSeats: ReadonlyMap<string, number>;
  /** Valid qualification keys per person ID. */
  qualifications: ReadonlyMap<string, readonly string[]>;
  /** Traffic light of the respiratory protection module on the alarm date; empty without that module. */
  breathingFitness?: ReadonlyMap<string, 'green' | 'yellow' | 'red' | 'grey'>;
}

export interface RawFinding {
  rule: RuleId;
  level: RuleLevel;
  subject: string | null;
  params: Record<string, string | number>;
}

/** Departments whose personnel need no vehicle (command units, special services). */
const NO_VEHICLE_DEPARTMENTS = new Set(['command', 'special-service']);

/** Intervals that only touch at their ends do not overlap. */
export function overlaps(a: { from: string; to: string }, b: { from: string; to: string }): boolean {
  return new Date(a.from) < new Date(b.to) && new Date(b.from) < new Date(a.to);
}

const durationHours = (a: { from: string; to: string }) => (new Date(a.to).getTime() - new Date(a.from).getTime()) / HOUR;

/**
 * Checks a report against the rules of the former MP-Feuer check app.
 * Rules can be switched off and their level changed in the settings.
 */
export function evaluateRules(input: RuleInput, settings: IncidentSettings): RawFinding[] {
  const findings: RawFinding[] = [];
  const add = (rule: RuleId, subject: string | null = null, params: Record<string, string | number> = {}) => {
    const configured = settings.rules[rule];
    if (configured?.enabled === false) return;
    findings.push({ rule, level: configured?.level ?? DEFAULT_RULE_LEVELS[rule], subject, params });
  };

  if (!input.incidentHasPrimary) add('primary-missing');
  if (!input.situation.trim() && !input.actions.trim()) add('report-empty');

  const counted = input.keyword?.mainType !== null && input.keyword !== null;
  if (input.primary && counted && !input.statistics) add('statistics-missing');
  if (input.statistics && (!input.primary || !counted)) add('statistics-not-allowed');

  if (input.personnel.length === 0) add('no-personnel');

  if (new Date(input.times.returnedAt) <= new Date(input.times.alarmedAt)) add('times-invalid');
  else if (durationHours({ from: input.times.alarmedAt, to: input.times.returnedAt }) > settings.longDurationHours) add('duration-long');

  const vehicleRequired = (input.keyword?.requiresVehicle ?? true) && !NO_VEHICLE_DEPARTMENTS.has(input.departmentType);
  const crew = new Map<string, number>();

  for (const p of input.personnel) {
    if (vehicleRequired && !p.vehicleId && !p.standbyStationId) add('vehicle-missing', p.key, { person: p.label });
    if (new Date(p.to) <= new Date(p.from)) add('times-invalid', p.key, { person: p.label });
    if (p.duringWorkingHours && p.lossOfEarnings) add('working-hours-and-loss-of-earnings', p.key, { person: p.label });
    if (p.rateMissing) add('rate-missing', p.key, { person: p.label });
    if (p.vehicleId) crew.set(p.vehicleId, (crew.get(p.vehicleId) ?? 0) + 1);
    if (!p.personId) continue;

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
    // Long assignments (e.g. duty officer periods) are not compared.
    if (durationHours(p) <= settings.longDurationHours) {
      for (const other of input.otherIncidents) {
        if (other.personId === p.personId && durationHours(other) <= settings.longDurationHours && overlaps(other, p)) {
          add('personnel-overlap-other', p.key, { person: p.label, dispatchNumber: other.dispatchNumber });
        }
      }
    }
  }

  for (const [vehicleId, count] of crew) {
    const seats = input.vehicleSeats.get(vehicleId);
    if (seats !== undefined && seats > 0 && count > seats) add('crew-exceeded', vehicleId, { count, seats });
  }
  return findings;
}
