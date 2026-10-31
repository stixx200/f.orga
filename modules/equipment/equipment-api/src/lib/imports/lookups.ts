import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import type { ImportLookup } from '@forga/core-api';
import { CategoryEntity, EquipmentTypeEntity } from '../equipment.entities.js';

const SETTINGS = 'equipment.settings.manage';

/** "Atemschutz › Maske", so a type's label names the category it sits in. */
function categoryPath(categories: Map<string, CategoryEntity>, key: string, language: 'de' | 'en'): string {
  const names: string[] = [];
  const seen = new Set<string>();
  let current = categories.get(key);
  while (current && !seen.has(current.key)) {
    seen.add(current.key);
    names.unshift(current.name[language]);
    current = current.parentKey ? categories.get(current.parentKey) : undefined;
  }
  return names.join(' › ');
}

/** Categories and equipment types, so unknown names of an inventory import can be assigned or created. */
@Injectable()
export class EquipmentLookups {
  constructor(private readonly em: EntityManager) {}

  lookups(): ImportLookup[] {
    return [this.categories(), this.types()];
  }

  /** Categories a new equipment type belongs to. Not offered as a value to map. */
  private categories(): ImportLookup {
    return {
      kind: 'equipment-category',
      name: { de: 'Kategorien', en: 'Categories' },
      keyFormat: 'slug',
      entries: async () =>
        (await this.em.fork().find(CategoryEntity, {}, { orderBy: { key: 'asc' } })).map((c) => ({
          key: c.key,
          name: c.name,
          parentKey: c.parentKey,
        })),
    };
  }

  /**
   * Equipment types by key. A type created from the import has the chosen category and no inspection types yet;
   * those are added in the settings.
   */
  private types(): ImportLookup {
    return {
      kind: 'equipment-type',
      name: { de: 'Gerätetypen', en: 'Equipment types' },
      keyFormat: 'slug',
      entries: async () => {
        const em = this.em.fork();
        const categories = new Map((await em.find(CategoryEntity, {})).map((c) => [c.key, c]));
        return (await em.find(EquipmentTypeEntity, {}, { orderBy: { key: 'asc' } })).map((t) => {
          const category = categories.get(t.categoryKey);
          const de = category ? categoryPath(categories, t.categoryKey, 'de') : '';
          const en = category ? categoryPath(categories, t.categoryKey, 'en') : '';
          return {
            key: t.key,
            name: {
              de: de ? `${t.name.de} (${de})` : t.name.de,
              en: en ? `${t.name.en} (${en})` : t.name.en,
            },
          };
        });
      },
      create: {
        permission: SETTINGS,
        categoryKind: 'equipment-category',
        run: async (input) => {
          const em = this.em.fork();
          const categoryKey = input.categoryKey ?? '';
          if (!(await em.count(CategoryEntity, { key: categoryKey }))) throw new BadRequestException({ code: 'equipment.unknownCategory', key: categoryKey });
          if (!/^[a-z0-9][a-z0-9-]*$/.test(input.key)) throw new BadRequestException({ code: 'validation.failed' });
          if (await em.count(EquipmentTypeEntity, { key: input.key })) throw new BadRequestException({ code: 'equipment.keyTaken', key: input.key });
          const type = em.create(EquipmentTypeEntity, {
            key: input.key,
            name: { de: input.name, en: input.name },
            categoryKey,
            manufacturer: '',
            model: '',
            inspections: [],
            properties: [],
          });
          await em.flush();
          return { key: type.key, name: type.name };
        },
      },
    };
  }
}
