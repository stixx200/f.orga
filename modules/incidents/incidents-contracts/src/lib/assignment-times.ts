/** Begin and end of an assignment as ISO times. */
export interface AssignmentTimes {
  from: string;
  to: string;
}

/** Own times of a vehicle in a report; `null` = the times of the report. */
export interface VehicleTimes {
  departedAt: string | null;
  returnedAt: string | null;
}

/**
 * Times a person follows without own times: those of the vehicle (as far as it has own ones), else those of the
 * report (alarm to ready again). Persons on standby (no vehicle) follow the report.
 */
export function inheritedTimes(report: { alarmedAt: string; returnedAt: string }, vehicle?: VehicleTimes | null): AssignmentTimes {
  return { from: vehicle?.departedAt ?? report.alarmedAt, to: vehicle?.returnedAt ?? report.returnedAt };
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
