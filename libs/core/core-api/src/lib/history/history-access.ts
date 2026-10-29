import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import type { EntityDefinition, HistorizedEntity } from '../module/forga-module.js';
import { FORGA_CORE_OPTIONS, type ForgaCoreOptions } from '../options.js';
import type { AuthenticatedUser } from '../security/authenticated-user.js';
import { ImportMappingEntity } from '../imports/import-mappings.js';
import { RetentionCaseEntity } from '../retention/retention-case.entity.js';
import { Role, RoleAssignment, User } from '../security/security.entities.js';
import { Setting } from '../settings/settings.js';
import { PrivacyNoticeEntity, PrivacyRequestEntity } from '../privacy/privacy.entities.js';
import { ConsentEntity } from '../privacy/consents.js';
import { historyName } from './history.subscriber.js';

export interface HistoryAccess {
  allowed: boolean;
  /**
   * Fields whose values are masked in the history, e.g. sensitive personal data. A history name of a child entity
   * (e.g. `masterdata.rest_period`) masks all fields of its entries, `<history name>.<field>` one field of them.
   */
  hiddenFields?: readonly string[];
}

export type HistoryAccessCheck = (user: AuthenticatedUser, entityId: string) => Promise<HistoryAccess>;

/** Top-level historized entities of the core; their children appear in the parent's history. */
export const CORE_HISTORIZED: HistorizedEntity[] = [User, Role, { entity: RoleAssignment, parent: 'user' }, Setting, ImportMappingEntity, RetentionCaseEntity, PrivacyRequestEntity, PrivacyNoticeEntity, ConsentEntity];

const className = (entity: EntityDefinition) => ('meta' in entity ? entity.meta.className : entity.name);

/**
 * Modules register who may read the history of their records, keyed by the history name `<schema>.<table>`.
 * Unknown names are denied. At startup every historized top-level entity must have a check,
 * and every registered name must belong to a historized entity (catches typos such as `-` instead of `_`).
 */
@Injectable()
export class HistoryAccessRegistry implements OnApplicationBootstrap {
  private readonly checks = new Map<string, HistoryAccessCheck>();

  constructor(
    private readonly em: EntityManager,
    @Inject(FORGA_CORE_OPTIONS) private readonly options: ForgaCoreOptions,
  ) {}

  register(entity: string, check: HistoryAccessCheck): void {
    this.checks.set(entity, check);
  }

  /** Reference data: readable with the permission (in any department). */
  registerPermission(entity: string, permission: string): void {
    this.register(entity, async (user) => ({ allowed: user.can(permission) }));
  }

  onApplicationBootstrap(): void {
    const metadata = new Map([...this.em.getMetadata().getAll().values()].map((meta) => [meta.className, meta]));
    const topLevel = [...CORE_HISTORIZED, ...this.options.modules.flatMap((m) => m.historized)]
      .filter((h): h is EntityDefinition => !('parent' in h))
      .map((entity) => historyName(metadata.get(className(entity))!));
    const missing = topLevel.filter((name) => !this.checks.has(name));
    const unknown = [...this.checks.keys()].filter((name) => !topLevel.includes(name));
    if (missing.length || unknown.length) {
      throw new Error(`History access: no check for ${missing.join(', ') || '–'}; checks for unknown entities ${unknown.join(', ') || '–'}.`);
    }
  }

  async check(user: AuthenticatedUser, entity: string, entityId: string): Promise<HistoryAccess> {
    const check = this.checks.get(entity);
    return check ? check(user, entityId) : { allowed: false };
  }
}
