/**
 * Until the first release there are no incremental migrations: this replaces all migrations of core and modules by
 * one `initial` migration each, generated from the entities.
 *
 *   npm run migration:reset
 *
 * Works on a temporary database next to the development database, so a running dev server is not disturbed.
 * Afterwards the development database has to be recreated (it still holds the old migrations).
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MikroORM } from '@mikro-orm/postgresql';
import { INSTALLED_MODULES } from '../apps/server/src/app/installed-modules.ts';

const SERVER = (process.env.DATABASE_URL ?? 'postgresql://forga:forga@localhost:5433/forga').replace(/\/[^/]*$/, '');
/** Own name per checkout (`FORGA_RESET_DATABASE`), so parallel worktrees do not share the temporary database. */
const TEMPORARY = process.env.FORGA_RESET_DATABASE ?? 'forga_migration_reset';

const directory = (id: string) => (id === 'core' ? 'libs/core/core-api' : `modules/${id}/${id}-api`);

/** Modules after the ones they require, so references to their schemas exist. */
function ordered(): string[] {
  const done: string[] = [];
  const visit = (id: string) => {
    if (done.includes(id)) return;
    for (const required of INSTALLED_MODULES.find((m) => m.manifest.id === id)?.manifest.requires ?? []) visit(required);
    done.push(id);
  };
  for (const m of INSTALLED_MODULES) visit(m.manifest.id);
  return ['core', ...done];
}

async function onServer(sql: string[]): Promise<void> {
  const orm = await MikroORM.init({ clientUrl: `${SERVER}/postgres`, entities: [], discovery: { warnWhenNoEntities: false } });
  try {
    for (const statement of sql) await orm.em.getConnection().execute(statement);
  } finally {
    await orm.close();
  }
}

const modules = ordered();
for (const id of modules) {
  const target = join(directory(id), 'src/migrations');
  for (const file of readdirSync(target).filter((f) => /^Migration\w+\.ts$/.test(f))) rmSync(join(target, file));
  const index = join(target, 'index.ts');
  writeFileSync(
    index,
    readFileSync(index, 'utf8')
      .replace(/import \{ Migration\w+ \} from '\.\/Migration\w+\.js';\n/g, '')
      .replace(/(_MIGRATIONS: MigrationObject\[\] = \[)[\s\S]*?(\];)/, '$1$2'),
  );
}

await onServer([`drop database if exists "${TEMPORARY}" with (force)`, `create database "${TEMPORARY}"`]);
try {
  for (const id of modules) {
    execFileSync('npm', ['run', '--silent', 'migration:create', '--', id, 'initial'], {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: `${SERVER}/${TEMPORARY}` },
    });
  }
} finally {
  await onServer([`drop database if exists "${TEMPORARY}" with (force)`]);
}
console.log('Done. Recreate the development database; the server applies the new migrations on its next start.');
