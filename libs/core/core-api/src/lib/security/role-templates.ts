import { Inject, Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { CORE_ROLE_TEMPLATES, type Language, type LocalizedText } from '@forga/core-contracts';
import { FORGA_CORE_OPTIONS, type ForgaCoreOptions } from '../options.js';
import { Role } from './security.entities.js';

export interface MergedRoleTemplate {
  key: string;
  name: LocalizedText;
  description: LocalizedText | null;
  permissions: string[];
  permissionsAllDepartments: string[];
}

/** Standard roles of core and modules, merged by key. */
@Injectable()
export class RoleTemplates {
  readonly all: MergedRoleTemplate[];

  /**
   * A module may add permissions to a role another module defines (with its name), in any order. Additions to a role
   * nobody names belong to a module that is not installed and are dropped.
   */
  constructor(@Inject(FORGA_CORE_OPTIONS) options: ForgaCoreOptions) {
    const merged = new Map<string, Omit<MergedRoleTemplate, 'name'> & { name: LocalizedText | null }>();
    for (const template of [...CORE_ROLE_TEMPLATES, ...options.modules.flatMap((m) => m.manifest.roles ?? [])]) {
      const existing = merged.get(template.key);
      if (existing) {
        existing.permissions = [...new Set([...existing.permissions, ...(template.permissions ?? [])])];
        existing.permissionsAllDepartments = [...new Set([...existing.permissionsAllDepartments, ...(template.permissionsAllDepartments ?? [])])];
        existing.name ??= template.name ?? null;
        existing.description ??= template.description ?? null;
        continue;
      }
      merged.set(template.key, {
        key: template.key,
        name: template.name ?? null,
        description: template.description ?? null,
        permissions: [...(template.permissions ?? [])],
        permissionsAllDepartments: [...(template.permissionsAllDepartments ?? [])],
      });
    }
    this.all = [...merged.values()].flatMap((t) => (t.name ? [{ ...t, name: t.name }] : []));
  }

  /**
   * Creates the roles of all templates that do not exist yet (by template key).
   * Names are taken in the given language; a name already used by another role is skipped.
   */
  async createMissing(em: EntityManager, language: Language): Promise<{ created: string[]; skipped: string[] }> {
    const existing = await em.find(Role, {});
    const keys = new Set(existing.map((r) => r.templateKey).filter(Boolean));
    const names = new Set(existing.map((r) => r.name.toLowerCase()));
    const created: string[] = [];
    const skipped: string[] = [];
    for (const template of this.all) {
      if (keys.has(template.key)) continue;
      const name = template.name[language];
      if (names.has(name.toLowerCase())) {
        skipped.push(template.key);
        continue;
      }
      em.create(Role, {
        name,
        templateKey: template.key,
        description: template.description?.[language] ?? '',
        permissions: template.permissions,
        permissionsAllDepartments: template.permissionsAllDepartments,
      });
      created.push(template.key);
    }
    await em.flush();
    return { created, skipped };
  }
}
