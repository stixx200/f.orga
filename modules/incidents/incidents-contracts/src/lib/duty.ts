import { z } from 'zod';

/**
 * A special service from a duty roster, e.g. duty officer (Einsatzleiter vom Dienst, EvD).
 * It is compensated per full day and not part of an incident report.
 */
export const DutyAssignmentInput = z
  .object({
    personId: z.uuid(),
    /** Key of a duty kind from the settings, e.g. `duty-officer`. */
    kind: z.string().min(1),
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
    notes: z.string().default(''),
  })
  .refine((d) => new Date(d.to) > new Date(d.from), { message: 'End before begin', path: ['to'] });
export type DutyAssignmentInput = z.input<typeof DutyAssignmentInput>;

export const DutyAssignment = z.object({
  id: z.uuid(),
  personId: z.uuid(),
  kind: z.string(),
  from: z.string(),
  to: z.string(),
  notes: z.string(),
  /** UID of the calendar event it was imported from. */
  externalUid: z.string().nullable(),
  days: z.number(),
  rate: z.number().nullable(),
  amount: z.number(),
  version: z.number(),
});
export type DutyAssignment = z.infer<typeof DutyAssignment>;
