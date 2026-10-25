import { z } from 'zod';

/**
 * A group within a department ("Gruppe als Einheit"), e.g. "1. Gruppe" with its group leader.
 * Department commanders maintain the groups; members must belong to the department.
 */
export const DepartmentGroupInput = z.object({
  departmentId: z.uuid(),
  name: z.string().trim().min(1).max(100),
  leaderId: z.uuid().nullable().default(null),
  memberIds: z.array(z.uuid()).max(200).default([]),
});
export type DepartmentGroupInput = z.input<typeof DepartmentGroupInput>;

export const DepartmentGroup = z.object({
  id: z.uuid(),
  departmentId: z.uuid(),
  name: z.string(),
  leaderId: z.uuid().nullable(),
  memberIds: z.array(z.uuid()),
  version: z.number().int(),
});
export type DepartmentGroup = z.infer<typeof DepartmentGroup>;
