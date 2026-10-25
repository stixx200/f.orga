import { Inject, Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { CORE_ROLE_TEMPLATES, LANGUAGES, type LocalizedText } from '@forga/core-contracts';
import { FORGA_CORE_OPTIONS, type ForgaCoreOptions } from '../options.js';
import { Role } from './security.entities.js';

export interface MergedRoleTemplate {
  key: string;
  name: LocalizedText;
  description: LocalizedText | null;
  permissions: string[];
  permissionsAllDepartments: string[];
}

/** The names of a role in all languages, in lower case, for the uniqueness check. */
export const roleNames = (name: LocalizedText): string[] => [...new Set(LANGUAGES.map((language) => name[language].trim().toLowerCase()))];

/** Standard roles of core and modules, merged by key. */
@Injectable()
export class RoleTemplates {
  readonly all: MergedRoleTemplate[];

  constructor(@Inject(FORGA_CORE_OPTIONS) options: ForgaCoreOptions) {
    const merged = new Map<string, MergedRoleTemplate>();
    for (const template of [...CORE_ROLE_TEMPLATES, ...options.modules.flatMap((m) => m.manifest.roles ?? [])]) {
      const existing = merged.get(template.key);
      if (existing) {
        existing.permissions = [...new Set([...existing.permissions, ...(template.permissions ?? [])])];
        existing.permissionsAllDepartments = [...new Set([...existing.permissionsAllDepartments, ...(template.permissionsAllDepartments ?? [])])];
        existing.description ??= template.description ?? null;
        continue;
      }
      if (!template.name) throw new Error(`Role template "${template.key}" has no name.`);
      merged.set(template.key, {
        key: template.key,
        name: template.name,
        description: template.description ?? null,
        permissions: [...(template.permissions ?? [])],
        permissionsAllDepartments: [...(template.permissionsAllDepartments ?? [])],
      });
    }
    this.all = [...merged.values()];
  }

  /**
   * Creates the roles of all templates that do not exist yet (by template key), with names and descriptions in all
   * languages; a template whose name is already used by another role is skipped.
   */
  async createMissing(em: EntityManager): Promise<{ created: string[]; skipped: string[] }> {
    const existing = await em.find(Role, {});
    const keys = new Set(existing.map((r) => r.templateKey).filter(Boolean));
    const names = new Set(existing.flatMap((r) => roleNames(r.name)));
    const created: string[] = [];
    const skipped: string[] = [];
    for (const template of this.all) {
      if (keys.has(template.key)) continue;
      if (roleNames(template.name).some((n) => names.has(n))) {
        skipped.push(template.key);
        continue;
      }
      roleNames(template.name).forEach((n) => names.add(n));
      em.create(Role, {
        name: template.name,
        templateKey: template.key,
        description: { de: template.description?.de ?? '', en: template.description?.en ?? '' },
        permissions: template.permissions,
        permissionsAllDepartments: template.permissionsAllDepartments,
      });
      created.push(template.key);
    }
    await em.flush();
    return { created, skipped };
  }
}
