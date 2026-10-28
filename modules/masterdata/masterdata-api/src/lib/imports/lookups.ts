import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { type ImportLookup, withAlias, ZodPipe } from '@forga/core-api';
import type { LocalizedText } from '@forga/core-contracts';
import { CatalogEntryInput, type CatalogKind } from '@forga/masterdata-contracts';
import { CatalogEntry, CatalogService } from '../catalog/catalog.js';
import { Vehicle } from '../masterdata.entities.js';
import { vehicleNames } from '../organization/organization.controller.js';

const MANAGE_CATALOGS = 'masterdata.catalogs.manage';

const vehicleOwner = (v: Vehicle) => ({ names: vehicleNames(v), aliases: v.aliases });

/** Catalogs whose entries imports look up by name. */
const CATALOGS: [CatalogKind, LocalizedText][] = [
  ['qualification', { de: 'Lehrgänge und Qualifikationen', en: 'Courses and qualifications' }],
  ['rank', { de: 'Dienstgrade', en: 'Ranks' }],
  ['honor', { de: 'Ehrungen', en: 'Honors' }],
  ['exit-reason', { de: 'Austrittsgründe', en: 'Exit reasons' }],
  ['function', { de: 'Funktionen im Einsatz', en: 'Incident functions' }],
];

/** Entries of the catalogs and the vehicles, for values of an import that match none. */
@Injectable()
export class MasterdataLookups {
  constructor(
    private readonly em: EntityManager,
    private readonly catalogs: CatalogService,
  ) {}

  lookups(): ImportLookup[] {
    return [...CATALOGS.map(([kind, name]) => this.catalog(kind, name)), this.vehicles()];
  }

  private catalog(kind: CatalogKind, name: LocalizedText): ImportLookup {
    return {
      kind,
      name,
      keyFormat: 'slug',
      entries: async () =>
        (await this.em.fork().find(CatalogEntry, { kind, active: true }, { orderBy: { sortOrder: 'asc', key: 'asc' } })).map((e) => ({ key: e.key, name: e.name })),
      create: {
        permission: MANAGE_CATALOGS,
        run: async (input) => {
          // New entries go to the end of the catalog; the administrator completes abbreviation, level or validity there.
          const last = await this.em.fork().findOne(CatalogEntry, { kind }, { orderBy: { sortOrder: 'desc' } });
          const parsed = new ZodPipe(CatalogEntryInput).transform({
            kind,
            key: input.key,
            name: { de: input.name, en: input.name },
            sortOrder: (last?.sortOrder ?? 0) + 10,
          });
          const entry = await this.catalogs.create(parsed);
          return { key: entry.key, name: entry.name };
        },
      },
      remember: (key, value) => this.catalogs.remember(kind, key, value),
    };
  }

  /** Vehicles by ID; created in the organization only. */
  private vehicles(): ImportLookup {
    return {
      kind: 'vehicle',
      name: { de: 'Fahrzeuge', en: 'Vehicles' },
      keyFormat: 'slug',
      entries: async () =>
        (await this.em.fork().find(Vehicle, {}, { orderBy: { designation: 'asc' } })).map((v) => {
          const label = [v.designation, v.radioCallSign].filter(Boolean).join(' · ');
          return { key: v.id, name: { de: label, en: label } };
        }),
      remember: async (id, value) => {
        const em = this.em.fork();
        const vehicles = await em.find(Vehicle, {});
        const vehicle = vehicles.find((v) => v.id === id);
        if (!vehicle) return;
        const aliases = withAlias(vehicleOwner(vehicle), value, vehicles.filter((v) => v !== vehicle).map(vehicleOwner));
        if (!aliases) return;
        vehicle.aliases = aliases;
        await em.flush();
      },
    };
  }
}
