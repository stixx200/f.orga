/** Domain events of the incidents module, published after the change is committed. */
export const INCIDENTS_EVENTS = {
  reportReleased: 'incidents.report.released',
  reportUnlocked: 'incidents.report.unlocked',
  /** A new incident was created (in the UI, through the API or by an import). */
  incidentCreated: 'incidents.incident.created',
} as const;

export interface IncidentCreatedEvent {
  incidentId: string;
  dispatchNumber: string;
  alarmKeyword: string;
  alarmedAt: string;
  /** `import`: data taken over from another system (e.g. MP-Feuer), usually historic. */
  createdVia: 'ui' | 'api' | 'import';
  /** Units whose report the creator asked for; the module owning the unit creates it, whatever its settings say. */
  units?: string[];
  /** Person of the creator; writes a requested unit report when nobody else is on duty. */
  requestedByPersonId?: string | null;
}

export interface ReportReleasedEvent {
  reportId: string;
  incidentId: string;
  /** Department of the report; `null` for a brigade-wide unit report (see `unit`). */
  departmentId: string | null;
  /** Key of the brigade-wide unit (e.g. `duty-officer`) of a unit report; `null` for department reports. */
  unit: string | null;
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
