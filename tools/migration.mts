/**
 * Migrations for core and modules.
 *
 *   pnpm run migration:create -- <module|core> <name>   create a migration from the difference entities ↔ database
 *   pnpm run migration:create -- <module|core> <name> --blank   empty migration for data changes (fill in `up`)
 *   pnpm run migration:run                              apply pending migrations
 *
 * A migration belongs to exactly one module and may only change its schema (schema = module ID).
 * References to schemas of modules listed in `requires` are allowed.
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MikroORM } from '@mikro-orm/postgresql';
import { schemaName } from '@forga/core-contracts';
import { INSTALLED_MODULES } from '../apps/server/src/app/installed-modules.ts';
import { ormConfig } from '../apps/server/src/app/orm.ts';

const DEVELOPMENT = 'postgresql://forga:forga@localhost:5433/forga';
const [command, moduleId, name, option] = process.argv.slice(2);

function directory(id: string): string {
  return id === 'core' ? 'libs/core/core-api' : `modules/${id}/${id}-api`;
}

/** First qualified object of a statement and all schemas mentioned in it. */
function schemasIn(sql: string): { target?: string; all: Set<string> } {
  const hits = [...sql.matchAll(/"([a-z][a-z0-9_]*)"\."[^"]+"/g)].map((m) => m[1]);
  const schema = /create schema if not exists "([^"]+)"/.exec(sql)?.[1];
  return { target: schema ?? hits[0], all: new Set([...hits, ...(schema ? [schema] : [])]) };
}

/**
 * Keeps only the statements of a schema diff that change the module's schema.
 * Changes of other modules are left for their own migration.
 */
function onlyModule(id: string, statements: string[]): string[] {
  const requires =
    id === 'core' ? [] : (INSTALLED_MODULES.find((m) => m.manifest.id === id)?.manifest.requires ?? []);
  const own = schemaName(id);
  const allowed = new Set([own, 'core', ...requires.map(schemaName)]);
  return statements.filter((sql) => {
    if (!sql.trim()) return false;
    const { target, all } = schemasIn(sql);
    if (target !== own) return false;
    const foreign = [...all].filter((s) => !allowed.has(s));
    if (foreign.length) {
      throw new Error(`Module "${id}" references schema ${foreign.join(', ')} without requiring it: ${sql}`);
    }
    return true;
  });
}

function lines(statements: string[]): string {
  return statements.map((sql) => `    this.addSql(${JSON.stringify(sql)});\n`).join('');
}

function migrationFile(className: string, up: string[], down: string[]): string {
  return (
    `import { Migration } from '@mikro-orm/migrations';\n\n` +
    `export class ${className} extends Migration {\n\n` +
    `  override name = '${className}';\n\n` +
    `  override up(): void {\n${lines(up)}  }\n\n` +
    `  override down(): void {\n${lines(down)}  }\n\n` +
    `}\n`
  );
}

function register(id: string, className: string): void {
  const file = join(directory(id), 'src/migrations/index.ts');
  let content = readFileSync(file, 'utf8');
  content = content.replace(
    /(import type \{ MigrationObject \} from '@mikro-orm\/core';\n)/,
    `$1import { ${className} } from './${className}.js';\n`,
  );
  content = content.replace(
    /(_MIGRATIONS: MigrationObject\[\] = \[)([\s\S]*?)(\];)/,
    (_, start, entries: string, end) =>
      `${start}${entries.trimEnd() ? `${entries.trimEnd()}\n` : '\n'}  { name: '${id}/${className}', class: ${className} },\n${end}`,
  );
  writeFileSync(file, content);
}

const orm = await MikroORM.init(ormConfig(process.env.DATABASE_URL ?? DEVELOPMENT));
try {
  await orm.migrator.up();

  if (command === 'create') {
    if (!moduleId || !name || !/^[a-z0-9-]+$/.test(name)) {
      throw new Error('Usage: migration:create -- <module|core> <name-in-lowercase> [--blank]');
    }
    const target = join(directory(moduleId), 'src/migrations');
    if (option === '--blank') {
      const className = `Migration${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}_${name.replaceAll('-', '_')}`;
      writeFileSync(join(target, `${className}.ts`), migrationFile(className, [], []));
      register(moduleId, className);
      console.log(`Created: ${join(target, `${className}.ts`)}`);
    } else {
      const result = await orm.migrator.create(target, false, false, name);
      const file = result.fileName ? join(target, result.fileName) : undefined;
      try {
        const up = onlyModule(moduleId, result.diff.up);
        const down = onlyModule(moduleId, result.diff.down);
        if (!file || up.length === 0) {
          if (file) rmSync(file);
          console.log(`No changes for "${moduleId}".`);
        } else {
          const className = result.fileName.replace(/\.ts$/, '');
          writeFileSync(file, migrationFile(className, up, down));
          register(moduleId, className);
          console.log(`Created: ${file}`);
        }
      } catch (error) {
        if (file) rmSync(file, { force: true });
        throw error;
      }
    }
  } else if (command !== 'run') {
    throw new Error(`Unknown command "${command ?? ''}". Allowed: create, run`);
  }
} finally {
  await orm.close();
}
