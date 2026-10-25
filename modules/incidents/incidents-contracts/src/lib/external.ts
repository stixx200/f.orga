import { z } from 'zod';
import { Location } from './report.js';

/**
 * Payload of `POST /api/incidents/v1/incidents` for external systems (alarm fax parser, DIVERA 24/7, FE2).
 * Departments, vehicles and persons may be given by ID or by their usual names and numbers.
 */
export const ExternalIncidentInput = z.object({
  dispatchNumber: z.string().trim().min(1),
  alarmKeyword: z.string().trim().min(1),
  alarmMessage: z.string().default(''),
  alarmedAt: z.iso.datetime({ offset: true }),
  location: Location.default(Location.parse({})),
  /** Department ID, name or short name, e.g. `Musterstadt` or `Abt. Musterstadt`. */
  departments: z.array(z.string().trim().min(1)).default([]),
  personnel: z
    .array(
      z.object({
        personnelNumber: z.string().trim().min(1),
        /** Department of the report the person belongs to; default: the first department. */
        department: z.string().trim().min(1).optional(),
        /** Vehicle ID, designation or radio call sign. */
        vehicle: z.string().trim().min(1).optional(),
        /** Key of a `function` catalog entry, e.g. `group-leader`. */
        function: z.string().optional(),
      }),
    )
    .default([]),
});
export type ExternalIncidentInput = z.input<typeof ExternalIncidentInput>;

export const ExternalIncidentResult = z.object({
  incidentId: z.uuid(),
  created: z.boolean(),
  reports: z.array(z.object({ id: z.uuid(), departmentId: z.uuid(), created: z.boolean(), updated: z.boolean() })),
  /** Entries that could not be matched, e.g. unknown personnel numbers; the rest was applied. */
  warnings: z.array(z.object({ code: z.string(), value: z.string() })),
});
export type ExternalIncidentResult = z.infer<typeof ExternalIncidentResult>;
