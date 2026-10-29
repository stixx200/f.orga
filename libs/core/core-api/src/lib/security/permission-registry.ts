import { Inject, Injectable } from '@nestjs/common';
import { CORE_PERMISSIONS, type Permission } from '@forga/core-contracts';
import { FORGA_CORE_OPTIONS, type ForgaCoreOptions } from '../options.js';
import { matches } from './authenticated-user.js';

/** All permissions known to this installation: core plus every installed module. */
@Injectable()
export class PermissionRegistry {
  readonly all: readonly Permission[];

  constructor(@Inject(FORGA_CORE_OPTIONS) options: ForgaCoreOptions) {
    this.all = [...CORE_PERMISSIONS, ...options.modules.flatMap((m) => m.manifest.permissions ?? [])];
    this.stepUp = new Set(this.all.filter((p) => p.stepUp).map((p) => p.id));
  }

  /** IDs of the permissions that need the second factor (step-up). */
  readonly stepUp: ReadonlySet<string>;

  /** Permissions an API token may never hold: privileged ones and those with step-up (unless `tokenAllowed`). */
  tokenForbidden(permission: Permission): boolean {
    return Boolean(permission.privileged || (permission.stepUp && !permission.tokenAllowed));
  }

  /** A role pattern is valid if it matches at least one known permission. */
  isValidPattern(pattern: string): boolean {
    return this.all.some((p) => matches(pattern, p.id));
  }
}
