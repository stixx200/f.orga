/** Begin and end of an assignment as ISO times. */
export interface AssignmentTimes {
  from: string;
  to: string;
}

/**
 * Own times of a vehicle in a report; `null` = the times of the report. The crew starts with the alarm of the vehicle
 * (e.g. alerted later) and ends with its return; the departure only counts for the vehicle (cost recovery, PDF).
 */
export interface VehicleTimes {
  alarmedAt: string | null;
  departedAt?: string | null;
  returnedAt: string | null;
}

/** `true` if the vehicle has own times its crew follows (alarm or return). */
export const hasCrewTimes = (vehicle?: VehicleTimes | null): boolean => Boolean(vehicle?.alarmedAt || vehicle?.returnedAt);

/**
 * Times a person follows without own times: those of the vehicle (its alarm and return, as far as it has own ones),
 * else those of the report (alarm to ready again). Persons on standby (no vehicle) follow the report.
 */
export function inheritedTimes(report: { alarmedAt: string; returnedAt: string }, vehicle?: VehicleTimes | null): AssignmentTimes {
  return { from: vehicle?.alarmedAt ?? report.alarmedAt, to: vehicle?.returnedAt ?? report.returnedAt };
}

/** Effective times of a person: own times, else those of the vehicle, else those of the report. */
export function effectiveTimes(
  entry: { from?: string | null; to?: string | null },
  report: { alarmedAt: string; returnedAt: string },
  vehicle?: VehicleTimes | null,
): AssignmentTimes {
  const inherited = inheritedTimes(report, vehicle);
  return { from: entry.from ?? inherited.from, to: entry.to ?? inherited.to };
}
