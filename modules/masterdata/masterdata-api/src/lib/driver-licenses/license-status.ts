import {
  type DriverLicense,
  type DriverLicenseCheckMethod,
  type DriverLicenseDue,
  type DriverLicenseSettings,
  type DriverLicenseState,
  type LicenseSelfCheckState,
  type PersonStatus,
  selfCheckEnabled,
} from '@forga/masterdata-contracts';
import { addDays, addMonths } from '../shared/dates.js';

/** What the state of a licence is computed from. */
export interface LicenseStatusInput {
  status: PersonStatus;
  license: DriverLicense;
  /** Keys of the qualifications valid on the day. */
  qualifications: readonly string[];
  checks: readonly { checkedOn: string; method: DriverLicenseCheckMethod; cancelled: boolean }[];
  /** Open requests to present the licence again. */
  openRequests: readonly { dueOn: string }[];
}

export interface LicenseStatus {
  /** The person belongs to the target group. */
  monitored: boolean;
  /** Open deadlines of the target group, earliest first. */
  dues: DriverLicenseDue[];
  state: DriverLicenseState | null;
  /** Earliest expiry of a monitored class (also a past one). */
  nextExpiry: { dueOn: string; classes: string[] } | null;
  /** Latest date for the original in the periodic mode with self-checks. */
  inPersonDueOn: string | null;
  selfCheck: LicenseSelfCheckState;
}

const latest = (dates: readonly string[]) => dates.toSorted().at(-1) ?? null;

/**
 * Deadlines and state of the licence of a person on `asOf`. Monitored are persons in probation or active with a
 * monitored class or a driver qualification. In both modes: the first check with the original, the expiry of each
 * time-limited monitored class and open requests; in the periodic mode also the interval after the latest check and,
 * with self-checks, the original after `inPersonEveryMonths` (self-checks do not postpone it).
 */
export function licenseStatus(input: LicenseStatusInput, settings: DriverLicenseSettings, asOf: string): LicenseStatus {
  const monitoredClasses = input.license.classes.filter((c) => settings.monitoredClasses.includes(c.class));
  const monitored =
    (input.status === 'probation' || input.status === 'active') &&
    (monitoredClasses.length > 0 || input.qualifications.some((q) => settings.driverQualifications.includes(q)));

  const groups = new Map<string, string[]>();
  for (const c of monitoredClasses) if (c.expiresOn) groups.set(c.expiresOn, [...(groups.get(c.expiresOn) ?? []), c.class]);
  const expiries = [...groups].map(([dueOn, classes]) => ({ dueOn, classes })).toSorted((a, b) => a.dueOn.localeCompare(b.dueOn));
  const nextExpiry = expiries[0] ?? null;

  const valid = input.checks.filter((c) => !c.cancelled);
  const lastAny = latest(valid.map((c) => c.checkedOn));
  const lastInPerson = latest(valid.filter((c) => c.method === 'in-person').map((c) => c.checkedOn));
  const periodic = settings.mode === 'periodic';
  const selfChecks = selfCheckEnabled(settings);

  const dues: DriverLicenseDue[] = [];
  const inPersonDueOn = selfChecks && lastInPerson ? addMonths(lastInPerson, settings.inPersonEveryMonths) : null;
  if (monitored) {
    if (!lastInPerson) dues.push({ kind: 'driver-license-first-check', dueOn: asOf, classes: [], inPerson: true });
    for (const expiry of expiries) dues.push({ kind: 'driver-license-class-expires', dueOn: expiry.dueOn, classes: expiry.classes, inPerson: true });
    for (const request of input.openRequests) dues.push({ kind: 'driver-license-request', dueOn: request.dueOn, classes: [], inPerson: true });
    if (periodic && lastAny) dues.push({ kind: 'driver-license-check-due', dueOn: addMonths(lastAny, settings.intervalMonths), classes: [], inPerson: false });
    if (inPersonDueOn) dues.push({ kind: 'driver-license-in-person-due', dueOn: inPersonDueOn, classes: [], inPerson: true });
  }
  dues.sort((a, b) => a.dueOn.localeCompare(b.dueOn));

  let state: DriverLicenseState | null = null;
  if (monitored) {
    if (!input.license.classes.length) state = 'classes-missing';
    else if (dues.some((d) => d.dueOn < asOf)) state = 'overdue';
    else if (input.openRequests.length) state = 'requested';
    else if (!lastInPerson) state = 'first-check-missing';
    else if (dues.some((d) => d.dueOn <= addDays(asOf, settings.leadDays))) state = 'due';
    else state = 'checked';
  }

  // The original is due: no first check, an open request, or another deadline with the original reached.
  const originalDue =
    !lastInPerson ||
    input.openRequests.length > 0 ||
    dues.some((d) => d.inPerson && d.dueOn <= asOf) ||
    (inPersonDueOn !== null && inPersonDueOn <= asOf) ||
    (nextExpiry !== null && nextExpiry.dueOn <= asOf);
  const selfCheck: LicenseSelfCheckState = !selfChecks ? 'off' : originalDue ? 'in-person' : 'allowed';

  return { monitored, dues, state, nextExpiry, inPersonDueOn, selfCheck };
}
