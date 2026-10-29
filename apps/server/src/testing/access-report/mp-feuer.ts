import { type EntityName, EntityManager } from '@mikro-orm/core';

// The entities of the module are not exported; MikroORM resolves them by name.
const entity = (name: string) => name as unknown as EntityName<object>;
import type { AccessReportFixture, SeedResult } from './fixture';

/**
 * A data transfer whose report keeps a row with the member's name (as MP-Feuer writes it) and one of the other member;
 * stored directly, as a real run needs the transfer files of MP-Feuer.
 */
export async function seedMpFeuer(fx: AccessReportFixture): Promise<SeedResult> {
  const em = fx.test.app.get(EntityManager).fork();
  const run = '0190a000-0000-7000-8000-000000000001';
  const at = new Date('2026-10-19T08:00:00Z');
  await em.insert(entity('MpFeuerRunEntity'), {
    id: run,
    userId: fx.ids.otherUser,
    createdBy: 'Kommandant',
    status: 'applied',
    files: ['Personal.xlsx'],
    archives: [],
    mappings: {},
    unmatched: [],
    rememberedCount: 0,
    cancelRequested: false,
    createdAt: at,
    finishedAt: at,
  });
  await em.insert(entity('MpFeuerRunDatasetEntity'), {
    id: '0190a000-0000-7000-8000-000000000002',
    run,
    profile: 'masterdata.persons',
    position: 0,
    rowCount: 2,
    rows: null,
    enabled: true,
    options: {},
    locked: false,
    counts: { create: 2 },
    unmatched: 0,
    parts: 1,
    partsDone: 1,
    results: [
      { row: 2, action: 'create', label: 'Probe, Tobias', messages: [{ code: 'imports.unknownValue' }], archive: 'a' },
      { row: 3, action: 'create', label: 'Dritter, Max', messages: [{ code: 'imports.unknownValue' }], archive: 'a' },
    ],
  });
  return { expect: ['19.10.2026', 'Zeilen mit Ihrem Namen in Datenübernahmen', '1 Hinweis im Bericht'] };
}
