import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { type ImportLookup, ZodPipe } from '@forga/core-api';
import type { LocalizedText } from '@forga/core-contracts';
import { CatalogEntryInput, type CatalogKind, COURSE_TARGET_PREFIX } from '@forga/masterdata-contracts';
import { CatalogEntry, CatalogService } from '../catalog/catalog.js';
import { Course } from '../courses/course.entities.js';
import { Department, Vehicle } from '../masterdata.entities.js';

const MANAGE_CATALOGS = 'masterdata.catalogs.manage';

/** Catalogs whose entries imports look up by name. */
const CATALOGS: [CatalogKind, LocalizedText][] = [
  ['qualification', { de: 'Lehrgänge und Qualifikationen', en: 'Courses and qualifications' }],
  ['rank', { de: 'Dienstgrade', en: 'Ranks' }],
  ['honor', { de: 'Ehrungen', en: 'Honors' }],
  ['office', { de: 'Ämter', en: 'Offices' }],
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
    return [...CATALOGS.map(([kind, name]) => this.catalog(kind, name)), this.vehicles(), this.departments()];
  }

  private catalog(kind: CatalogKind, name: LocalizedText): ImportLookup {
    return {
      kind,
      name,
      keyFormat: 'slug',
      entries: async () => [
        ...(await this.em.fork().find(CatalogEntry, { kind, active: true }, { orderBy: { sortOrder: 'asc', key: 'asc' } })).map((e) => ({ key: e.key, name: e.name })),
        ...(kind === 'qualification' ? await this.courses(true) : []),
      ],
      all: async () => [...(await this.em.fork().find(CatalogEntry, { kind })).map((e) => ({ key: e.key, name: e.name })), ...(kind === 'qualification' ? await this.courses(false) : [])],
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
    };
  }

  /**
   * Courses of the course catalog as targets for course names (`course:<key>`, e.g. `course:other-course`): the career
   * import records an attendance instead of a qualification.
   */
  private async courses(activeOnly: boolean) {
    const courses = await this.em.fork().find(Course, activeOnly ? { active: true } : {}, { orderBy: { sortOrder: 'asc', key: 'asc' } });
    return courses.map((c) => ({
      key: `${COURSE_TARGET_PREFIX}${c.key}`,
      name: { de: `${c.name.de} (Lehrgangsteilnahme)`, en: `${c.name.en} (course attendance)` },
    }));
  }

  /** Departments by ID, so a blank or unknown department name can be assigned to one (e.g. the whole brigade). */
  private departments(): ImportLookup {
    return {
      kind: 'department',
      name: { de: 'Abteilungen', en: 'Departments' },
      keyFormat: 'slug',
      entries: async () =>
        (await this.em.fork().find(Department, {}, { orderBy: { name: 'asc' } })).map((d) => {
          const label = d.shortName && d.shortName !== d.name ? `${d.name} (${d.shortName})` : d.name;
          return { key: d.id, name: { de: label, en: label } };
        }),
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
    };
  }
}
