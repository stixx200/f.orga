import { ConflictException } from '@nestjs/common';
import type { EntityManager } from '@mikro-orm/core';
import { User } from './security.entities.js';

/** Active, non-technical users other than `exceptUserId` with this e-mail address, ignoring case. */
export async function usersWithEmail(em: EntityManager, email: string, exceptUserId: string | null = null): Promise<User[]> {
  const wanted = email.trim().toLowerCase();
  const users = await em.find(User, { active: true, technical: false, email: { $ne: null }, ...(exceptUserId ? { id: { $ne: exceptUserId } } : {}) });
  return users.filter((u) => u.email?.trim().toLowerCase() === wanted);
}

/**
 * An e-mail address belongs to at most one active user: password reset links and the sign-in with the municipal
 * account find the user by it.
 */
export async function assertEmailFree(em: EntityManager, email: string | null | undefined, exceptUserId: string | null, code = 'users.emailTaken'): Promise<void> {
  if (email && (await usersWithEmail(em, email, exceptUserId)).length) throw new ConflictException({ code });
}

/** Same address, ignoring case and surrounding spaces. */
export const sameEmail = (a: string | null | undefined, b: string | null | undefined) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
