import { defineEntity, p } from '@mikro-orm/core';
import { v7 as uuidv7 } from 'uuid';
import { Department, Person } from '../masterdata.entities.js';

/** A group within a department with its leader and members ("Gruppe als Einheit"). */
export const DepartmentGroupSchema = defineEntity({
  name: 'DepartmentGroup',
  schema: 'masterdata',
  tableName: 'department_group',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    department: () => p.manyToOne(Department).deleteRule('cascade'),
    name: p.string(),
    leader: () => p.manyToOne(Person).nullable().deleteRule('set null'),
    /** Person IDs of the members, like the deputies of a department. */
    memberIds: p.json<string[]>(),
    version: p.integer().version(),
  },
});
export class DepartmentGroup extends DepartmentGroupSchema.class {}
DepartmentGroupSchema.setClass(DepartmentGroup);
