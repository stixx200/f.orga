import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { ImportRegistry, MappingStore } from '@forga/core-api';
import { MpFeuerMappingEntity } from '../mp-feuer.entities.js';

/** The mapping list of the module (`mp_feuer.mapping`), apart from the one of the table import. */
@Injectable()
export class MpFeuerMappings extends MappingStore {
  constructor(em: EntityManager, registry: ImportRegistry) {
    super(em, MpFeuerMappingEntity, registry);
  }
}
