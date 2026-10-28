import { Injectable } from '@nestjs/common';
import { defineEntity, EntityManager } from '@mikro-orm/core';
import { ImportRegistry } from './import-registry.js';
import { mappingProperties, MappingStore } from './mapping-store.js';

/** Mappings chosen in the table import, applied again by its next imports (all profiles of the kind). */
export const ImportMappingSchema = defineEntity({
  name: 'ImportMappingEntity',
  schema: 'core',
  tableName: 'import_mapping',
  uniques: [{ properties: ['kind', 'normalized'] }],
  properties: mappingProperties(),
});
export class ImportMappingEntity extends ImportMappingSchema.class {}
ImportMappingSchema.setClass(ImportMappingEntity);

/** The mapping list of the table import (`core.import_mapping`). */
@Injectable()
export class ImportMappings extends MappingStore {
  constructor(em: EntityManager, registry: ImportRegistry) {
    super(em, ImportMappingEntity, registry);
  }
}
