import { z } from 'zod';

export const DepartmentType = z.enum([
  'operational',
  'youth',
  'veterans',
  'children',
  'music',
  'special-service',
  'command',
]);
export type DepartmentType = z.infer<typeof DepartmentType>;

/** Special tasks of a department as asked in the annual statistics (F3–F9). */
export const SpecialTask = z.enum([
  'ambulance-service',
  'emergency-doctor-vehicle',
  'radiation-protection',
  'hazardous-materials',
  'height-rescue',
  'diving',
  'command-unit',
]);
export type SpecialTask = z.infer<typeof SpecialTask>;

/** Department types counted in the brigade statistics by default. */
export const STATISTICS_RELEVANT_TYPES: readonly DepartmentType[] = ['operational', 'youth', 'veterans', 'music'];

export const DepartmentInput = z.object({
  name: z.string().trim().min(1),
  shortName: z.string().trim().min(1),
  type: DepartmentType,
  /** E.g. the operational department a veterans department belongs to. */
  parentId: z.uuid().nullable().default(null),
  specialTasks: z.array(SpecialTask).default([]),
  commanderId: z.uuid().nullable().default(null),
  /** At most `maxDeputies` of the membership settings. */
  deputyIds: z.array(z.uuid()).max(10).default([]),
  /** `null` = default of the department type. */
  statisticsRelevant: z.boolean().nullable().default(null),
  /** Inhabitants of the district the department serves, e.g. for promotion rules; `null` = those of the municipality. */
  population: z.number().int().min(0).nullable().default(null),
});
export type DepartmentInput = z.input<typeof DepartmentInput>;

export const Department = z.object({
  id: z.uuid(),
  name: z.string(),
  shortName: z.string(),
  type: DepartmentType,
  parentId: z.uuid().nullable(),
  specialTasks: z.array(SpecialTask),
  commanderId: z.uuid().nullable(),
  deputyIds: z.array(z.uuid()),
  statisticsRelevant: z.boolean(),
  population: z.number().int().nullable(),
  version: z.number().int(),
});
export type Department = z.infer<typeof Department>;
