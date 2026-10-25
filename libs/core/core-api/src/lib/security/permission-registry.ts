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
  }

  /** A role pattern is valid if it matches at least one known permission. */
  isValidPattern(pattern: string): boolean {
    return this.all.some((p) => matches(pattern, p.id));
  }
}
