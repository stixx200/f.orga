import { defineConfig, PostgreSqlDriver } from '@mikro-orm/postgresql';
import { type ForgaModule, ormParts } from '@forga/core-api';
import { INSTALLED_MODULES } from './installed-modules';

/** MikroORM configuration shared by the server and tools (migrations, tests). */
export function ormConfig(clientUrl = process.env.DATABASE_URL, modules: ForgaModule[] = INSTALLED_MODULES) {
  return defineConfig({
    driver: PostgreSqlDriver,
    clientUrl,
    ...ormParts(modules),
  });
}
