import { ForbiddenException, Injectable } from '@nestjs/common';
import { RESTRICTED_PERSONS_PERMISSION } from '@forga/core-contracts';
import { ModuleStateService } from '../module/modules.js';
import type { AuthenticatedUser } from '../security/authenticated-user.js';

/** Knows whose processing is restricted (Art. 18); provided by the module `privacy`. */
export interface RestrictionProvider {
  module: string;
  /** The restricted persons among `ids`, or all restricted persons without `ids`. */
  restrictedIds(ids?: readonly string[]): Promise<Set<string>>;
}

/**
 * Restriction of processing (Art. 18) as seen by the core and the modules: restricted persons disappear from lists,
 * search, pickers, deadlines and e-mails. The module `privacy` records the restrictions; while it is inactive (or not
 * installed) no person is restricted.
 */
@Injectable()
export class ProcessingRestrictions {
  private provider: RestrictionProvider | null = null;

  constructor(private readonly modules: ModuleStateService) {}

  /** Called by the module `privacy`. */
  register(provider: RestrictionProvider): void {
    this.provider = provider;
  }

  private async active(): Promise<RestrictionProvider | null> {
    const provider = this.provider;
    return provider && !(await this.modules.inactiveIds()).has(provider.module) ? provider : null;
  }

  /** The restricted persons among `ids`, or all restricted persons without `ids`; empty while nobody records them. */
  async restrictedIds(ids?: readonly string[]): Promise<Set<string>> {
    if (ids && !ids.length) return new Set();
    const provider = await this.active();
    return provider ? provider.restrictedIds(ids) : new Set();
  }

  async isRestricted(personId: string): Promise<boolean> {
    return (await this.restrictedIds([personId])).has(personId);
  }
}

/**
 * Pages about a single person whose processing is restricted (Art. 18) open only with `privacy.manage`: otherwise
 * `403 privacy.processingRestricted`, or `auth.stepUpRequired` if the step-up would give the permission. Modules ask
 * the person directory (`isRestricted`) and call this before returning the person's data.
 */
export function assertNotRestricted(user: AuthenticatedUser, restricted: boolean): void {
  if (!restricted || user.can(RESTRICTED_PERSONS_PERMISSION)) return;
  if (user.needsStepUp(RESTRICTED_PERSONS_PERMISSION)) throw user.stepUpRequired();
  throw new ForbiddenException({ code: 'privacy.processingRestricted' });
}

/** Refuses to record something new for a person whose processing is restricted (bookings, attendances, issues). */
export function refuseRestricted(restricted: boolean): void {
  if (restricted) throw new ForbiddenException({ code: 'privacy.processingRestricted' });
}
