import { z } from 'zod';
import { LocalizedText } from './i18n.js';

/** `upcoming`: within the lead time; `due`: within the next 7 days; `overdue`: date has passed. */
export const DeadlineStage = z.enum(['upcoming', 'due', 'overdue']);
export type DeadlineStage = z.infer<typeof DeadlineStage>;

export const Deadline = z.object({
  /** Stable ID, e.g. `masterdata.probation-ends:<person-id>`. */
  id: z.string(),
  module: z.string(),
  kind: z.string(),
  title: LocalizedText,
  subject: z.object({ type: z.string(), id: z.string(), label: z.string() }),
  dueOn: z.string(),
  stage: DeadlineStage,
  /** Heading the weekly e-mail groups the deadline under, e.g. category and vehicle of an item. */
  group: LocalizedText.optional(),
});
export type Deadline = z.infer<typeof Deadline>;

/** Weekly digest e-mail with the deadlines of each user. */
export const ReminderSettings = z.object({
  enabled: z.boolean().default(true),
  /** ISO weekday, 1 = Monday. */
  weekday: z.number().int().min(1).max(7).default(1),
  /** Hour (Europe/Berlin) from which the digest is sent. */
  hour: z.number().int().min(0).max(23).default(7),
});
export type ReminderSettings = z.infer<typeof ReminderSettings>;
