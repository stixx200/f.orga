import { z } from 'zod';

/** "Kein EvD bei diesem Einsatz": the incident needs no EvD report. */
export const ExemptionInput = z.object({ reason: z.string().trim().min(1) });
export type ExemptionInput = z.infer<typeof ExemptionInput>;

/** The duty officer side of an incident, for the card on the incident page. */
export const IncidentDutyOfficer = z.object({
  incidentId: z.uuid(),
  /** The setting "EvD-Bericht für jeden Einsatz anlegen". */
  reportRequired: z.boolean(),
  /** An EvD report is expected: the incident was created while the module and the setting were active, and is not exempted. */
  expected: z.boolean(),
  report: z
    .object({ id: z.uuid(), number: z.string(), status: z.string(), locked: z.boolean(), authorPersonId: z.uuid().nullable() })
    .nullable(),
  exemption: z.object({ reason: z.string(), by: z.string(), at: z.string() }).nullable(),
  /** Persons on duty at the alarm time according to the roster. */
  onDuty: z.array(z.uuid()),
  /** Expected but missing (e.g. its creation failed): shown on the incident and as a task for the managers. */
  missing: z.boolean(),
});
export type IncidentDutyOfficer = z.infer<typeof IncidentDutyOfficer>;
