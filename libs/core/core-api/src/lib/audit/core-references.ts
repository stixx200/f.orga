import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { ImportRegistry } from '../imports/import-registry.js';
import { ListRegistry } from '../lists/list-registry.js';
import { FORGA_CORE_OPTIONS, type ForgaCoreOptions } from '../options.js';
import { ApiToken, Role, User } from '../security/security.entities.js';
import { AuditReferenceRegistry, type AuditReferenceTarget } from './audit-references.js';

/** References to records of the core in audit entries: users, roles, API tokens, modules, lists and import profiles. */
@Injectable()
export class CoreAuditReferences implements OnModuleInit {
  constructor(
    private readonly registry: AuditReferenceRegistry,
    private readonly em: EntityManager,
    private readonly lists: ListRegistry,
    private readonly imports: ImportRegistry,
    @Inject(FORGA_CORE_OPTIONS) private readonly options: ForgaCoreOptions,
  ) {}

  onModuleInit(): void {
    this.registry.register('core.user', {
      keys: ['userId', 'targetId'],
      resolve: async (ids) => {
        const users = await this.em.fork().find(User, { id: { $in: [...ids] } }, { fields: ['id', 'displayName'] });
        return new Map(users.map((u) => [u.id, { label: u.displayName }]));
      },
    });
    this.registry.register('core.role', {
      keys: ['roleId'],
      resolve: async (ids, user) => {
        const roles = await this.em.fork().find(Role, { id: { $in: [...ids] } }, { fields: ['id', 'name'] });
        const to = user.can('core.roles.manage') ? '/admin/roles' : undefined;
        return new Map(roles.map((r) => [r.id, { label: r.name, to }]));
      },
    });
    this.registry.register('core.token', {
      keys: ['tokenId'],
      resolve: async (ids, user) => {
        const tokens = await this.em.fork().find(ApiToken, { id: { $in: [...ids] } }, { fields: ['id', 'name'] });
        const to = user.can('core.tokens.manage') ? '/admin/tokens' : undefined;
        return new Map(tokens.map((t) => [t.id, { label: t.name, to }]));
      },
    });
    this.registry.register('core.module', {
      keys: ['moduleId', 'module'],
      uuid: false,
      resolve: async (ids) => {
        const result = new Map<string, AuditReferenceTarget>([['core', { label: { de: 'Kern', en: 'Core' } }]]);
        for (const module of this.options.modules) if (ids.includes(module.manifest.id)) result.set(module.manifest.id, { label: module.manifest.name });
        return result;
      },
    });
    this.registry.register('core.list', {
      keys: ['listId'],
      actions: ['lists.'],
      uuid: false,
      resolve: async (ids) => new Map(ids.flatMap((id) => { const list = this.lists.get(id); return list ? [[id, { label: list.definition.name }]] : []; })),
    });
    this.registry.register('core.import-profile', {
      keys: ['profile'],
      actions: ['imports.'],
      uuid: false,
      resolve: async (ids) => new Map(ids.flatMap((id) => { const profile = this.imports.get(id); return profile ? [[id, { label: profile.name }]] : []; })),
    });
  }
}
