import { MikroORM } from '@mikro-orm/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HistoryEntry, UserContext } from '@forga/core-api';
import { Department } from '@forga/masterdata-api';
import { ormConfig } from './app/orm';
import { resetTestDatabase, TEST_DATABASE_URL } from './testing/test-database';

let orm: MikroORM;

beforeAll(async () => {
  await resetTestDatabase();
  orm = await MikroORM.init(ormConfig(TEST_DATABASE_URL));
});

afterAll(() => orm?.close());

describe('history', () => {
  it('records creation and changes with user and changed fields', async () => {
    const em = orm.em.fork();
    const department = em.create(Department, {
      name: 'Abteilung Weidenhain',
      shortName: 'Abt. Weidenhain',
      type: 'operational',
      specialTasks: [],
      deputyIds: [],
    });
    await UserContext.run('user-1', () => em.flush());

    department.shortName = 'Weidenhain';
    await UserContext.run('user-2', () => em.flush());

    const entries = await orm.em
      .fork()
      .find(HistoryEntry, { entityId: department.id }, { orderBy: { timestamp: 'asc', id: 'asc' } });

    expect(entries.map((e) => [e.entity, e.action, e.userId])).toEqual([
      ['masterdata.department', 'created', 'user-1'],
      ['masterdata.department', 'updated', 'user-2'],
    ]);
    expect(entries[0].changes['name']).toEqual({ old: null, new: 'Abteilung Weidenhain' });
    expect(entries[1].changes).toEqual({ shortName: { old: 'Abt. Weidenhain', new: 'Weidenhain' } });
  });

  it('writes no entry if no business field changed', async () => {
    const em = orm.em.fork();
    const department = em.create(Department, { name: 'Abteilung Ahornfeld', shortName: 'Ahornfeld', type: 'operational', specialTasks: [], deputyIds: [] });
    await em.flush();
    department.shortName = 'Ahornfeld';
    await em.flush();
    expect(await orm.em.fork().count(HistoryEntry, { entityId: department.id })).toBe(1);
  });

  it('prevents overwriting a version that was changed in the meantime', async () => {
    const em = orm.em.fork();
    const department = em.create(Department, {
      name: 'Abteilung Ahornfeld 2',
      shortName: 'Ahornfeld 2',
      type: 'operational',
      specialTasks: [],
      deputyIds: [],
    });
    await em.flush();

    const other = orm.em.fork();
    const copy = await other.findOneOrFail(Department, department.id);
    copy.shortName = 'First';
    await other.flush();

    department.shortName = 'Second';
    await expect(em.flush()).rejects.toThrow(/optimistic lock/i);
  });
});
