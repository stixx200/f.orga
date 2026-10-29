import { ForbiddenException } from '@nestjs/common';
import { PRIVACY_PERMISSION } from '@forga/core-contracts';
import type { AuthenticatedUser } from '../security/authenticated-user.js';

/**
 * Pages about a single person whose processing is restricted (Art. 18) open only with `core.privacy.manage`: otherwise
 * `403 privacy.processingRestricted`, or `auth.stepUpRequired` if the step-up would give the permission. Modules ask
 * the person directory (`isRestricted`) and call this before returning the person's data.
 */
export function assertNotRestricted(user: AuthenticatedUser, restricted: boolean): void {
  if (!restricted || user.can(PRIVACY_PERMISSION)) return;
  if (user.needsStepUp(PRIVACY_PERMISSION)) throw user.stepUpRequired();
  throw new ForbiddenException({ code: 'privacy.processingRestricted' });
}

/** Refuses to record something new for a person whose processing is restricted (bookings, attendances, issues). */
export function refuseRestricted(restricted: boolean): void {
  if (restricted) throw new ForbiddenException({ code: 'privacy.processingRestricted' });
}
