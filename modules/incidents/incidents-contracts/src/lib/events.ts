/** Domain events of the incidents module, published after the change is committed. */
export const INCIDENTS_EVENTS = {
  reportReleased: 'incidents.report.released',
  reportUnlocked: 'incidents.report.unlocked',
  dutyChanged: 'incidents.duty.changed',
} as const;

/** A special service of the duty roster was saved or deleted (`deleted`), with its compensation per full day. */
export interface DutyChangedEvent {
  dutyId: string;
  personId: string;
  /** Name of the duty kind (German, for item labels). */
  kindName: string;
  from: string;
  to: string;
  days: number;
  rate: number | null;
  amount: number;
  deleted: boolean;
}

export interface ReportReleasedEvent {
  reportId: string;
  incidentId: string;
  departmentId: string;
  level: 'compensation' | 'billing';
  alarmedAt: string;
  /** Leitstellennummer and report number, e.g. for compensation items. */
  dispatchNumber: string;
  reportNumber: string;
  alarmKeyword: string;
  /** Rate kind of the keyword. */
  compensationKind: 'incident' | 'standby' | 'fire-watch';
  personnel: {
    personId: string;
    vehicleId: string | null;
    breathingApparatus: boolean;
    breathingMinutes: number | null;
    /** In a chemical protective suit (CSA). */
    chemicalSuit: boolean;
    breathingDevice: 'compressed-air' | 'rebreather' | 'filter' | null;
    from: string;
    to: string;
    /** Computed by the incident report (hours × rate + allowances, or the override). */
    hours: number;
    rate: number | null;
    amount: number;
    duringWorkingHours: boolean;
    lossOfEarnings: boolean;
  }[];
  vehicleIds: string[];
}

export interface ReportUnlockedEvent {
  reportId: string;
  incidentId: string;
  reason: string;
}
