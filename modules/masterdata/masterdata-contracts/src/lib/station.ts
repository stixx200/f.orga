import { z } from 'zod';

export const StationInput = z.object({
  name: z.string().trim().min(1),
  departmentId: z.uuid(),
  street: z.string().trim().default(''),
  postalCode: z.string().trim().default(''),
  city: z.string().trim().default(''),
  /** Permanently staffed station (annual statistics F11). */
  permanentlyStaffed: z.boolean().default(false),
  notes: z.string().default(''),
});
export type StationInput = z.input<typeof StationInput>;

export const Station = z.object({
  id: z.uuid(),
  name: z.string(),
  departmentId: z.uuid(),
  street: z.string(),
  postalCode: z.string(),
  city: z.string(),
  permanentlyStaffed: z.boolean(),
  notes: z.string(),
  version: z.number().int(),
});
export type Station = z.infer<typeof Station>;
