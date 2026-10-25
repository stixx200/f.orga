import type { Type } from '@nestjs/common';
import type { EntityClass, EntitySchema, MigrationObject } from '@mikro-orm/core';
import type { z } from 'zod';
import { ModuleManifest } from '@forga/core-contracts';

export type EntityDefinition = EntityClass<object> | EntitySchema;

/**
 * A historized entity. With `parent`, the entries also show up in the history of the record
 * referenced by that many-to-one property (e.g. memberships in the history of the person).
 */
export type HistorizedEntity = EntityDefinition | { entity: EntityDefinition; parent: string };

/** A feature module as seen by the server: manifest plus backend parts. */
export interface ForgaModule {
  manifest: ModuleManifest;
  nestModule?: Type<unknown>;
  entities: EntityDefinition[];
  /** Entities whose changes are written to the history. */
  historized: HistorizedEntity[];
  /** Database migrations, oldest first. They may only change the module's own schema. */
  migrations: MigrationObject[];
  /** Settings sections of the module, keyed `<module-id>.<section>`. */
  settings: Record<string, z.ZodType>;
}

export function defineModule(module: {
  manifest: ModuleManifest;
  nestModule?: Type<unknown>;
  entities?: EntityDefinition[];
  historized?: HistorizedEntity[];
  migrations?: MigrationObject[];
  settings?: Record<string, z.ZodType>;
}): ForgaModule {
  const manifest = ModuleManifest.parse(module.manifest);
  for (const key of Object.keys(module.settings ?? {})) {
    if (!key.startsWith(`${manifest.id}.`)) {
      throw new Error(`Settings section "${key}" of module "${manifest.id}" must start with "${manifest.id}.".`);
    }
  }
  return {
    manifest,
    nestModule: module.nestModule,
    entities: module.entities ?? [],
    historized: module.historized ?? [],
    migrations: module.migrations ?? [],
    settings: module.settings ?? {},
  };
}

/**
 * Validates the module list (unique IDs, satisfied requirements, no cycles)
 * and returns it in load order: requirements first.
 */
export function sortModules(modules: ForgaModule[]): ForgaModule[] {
  const byId = new Map<string, ForgaModule>();
  for (const module of modules) {
    if (module.manifest.id === 'core' || byId.has(module.manifest.id)) {
      throw new Error(`Module "${module.manifest.id}" is registered twice.`);
    }
    byId.set(module.manifest.id, module);
  }

  const sorted: ForgaModule[] = [];
  const done = new Set<string>();
  const inProgress = new Set<string>();

  const visit = (module: ForgaModule) => {
    const id = module.manifest.id;
    if (done.has(id)) return;
    if (inProgress.has(id)) throw new Error(`Cyclic module requirement at "${id}".`);
    inProgress.add(id);
    for (const requirement of module.manifest.requires ?? []) {
      const target = byId.get(requirement);
      if (!target) throw new Error(`Module "${id}" requires "${requirement}", which is not installed.`);
      visit(target);
    }
    inProgress.delete(id);
    done.add(id);
    sorted.push(module);
  };

  modules.forEach(visit);
  return sorted;
}
