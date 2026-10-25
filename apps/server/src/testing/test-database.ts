import { MikroORM } from '@mikro-orm/postgresql';
import { ormConfig } from '../app/orm';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://forga:forga@localhost:5433/forga_test';

/** Empties the test database and applies all migrations of core and modules. */
export async function resetTestDatabase(): Promise<void> {
  const orm = await MikroORM.init({ ...ormConfig(TEST_DATABASE_URL), ensureDatabase: true });
  try {
    await orm.em
      .getConnection()
      .execute('drop schema if exists core, masterdata, incidents, training, respiratory_protection, compensation, equipment, cost_recovery, promotions, clothing cascade; drop table if exists forga_migrations;');
    await orm.migrator.up();
  } finally {
    await orm.close();
  }
}
