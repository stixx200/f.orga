import { BadRequestException } from '@nestjs/common';
import type { EntityManager } from '@mikro-orm/core';
import { Role, RoleAssignment } from './security.entities.js';

/**
 * At least one active user must keep all permissions (`*` brigade-wide), otherwise nobody could manage
 * users, roles and settings any more. Call inside the transaction after the change has been flushed;
 * the exception rolls the change back.
 */
export async function assertAdministratorRemains(em: EntityManager): Promise<void> {
  const roles = (await em.find(Role, {})).filter((r) => r.permissions.includes('*'));
  const remaining = roles.length
    ? await em.count(RoleAssignment, { role: { $in: roles }, departmentId: null, user: { active: true, technical: false } })
    : 0;
  if (!remaining) throw new BadRequestException({ code: 'users.lastAdministrator' });
}
