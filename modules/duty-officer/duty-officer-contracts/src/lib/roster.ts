import { z } from 'zod';
import type { LocalizedText } from '@forga/core-contracts';

/**
 * A special service from the duty roster, e.g. duty officer (Einsatzleiter vom Dienst, EvD).
 * It is compensated per day and not part of an incident report.
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

/** Republishes the special services of a period (e.g. for the compensation module installed later). */
export const DutyPeriodQuery = z.object({ from: z.iso.date(), to: z.iso.date() });
export type DutyPeriodQuery = z.infer<typeof DutyPeriodQuery>;

/** Domain events of the duty officer module, published after the change is committed. */
export const DUTY_OFFICER_EVENTS = {
  dutyChanged: 'duty-officer.duty.changed',
} as const;

/** A special service of the duty roster was saved or deleted (`deleted`), with its compensation per day. */
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

/** A special service with its compensation, for other modules (e.g. the compensation export of the incident reports). */
export interface DutyPeriod {
  id: string;
  personId: string;
  kind: string;
  kindName: LocalizedText;
  from: string;
  to: string;
  days: number;
  rate: number | null;
  amount: number;
}

/**
 * The duty roster for other modules: `@Optional() @Inject(DUTY_ROSTER) roster?: DutyRoster`
 * (and check that the duty officer module is active).
 */
export const DUTY_ROSTER = 'duty-officer.Roster';

export interface DutyRoster {
  /** Special services starting within the period (dates, Europe/Berlin), oldest first. */
  startingIn(from: string, to: string): Promise<DutyPeriod[]>;
}
