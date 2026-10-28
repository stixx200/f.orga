/**
 * Creates the skeleton of a feature module: contracts, backend and frontend, and registers it
 * in the server, the dev ports, the test database and the Docker build.
 *
 *   npx tsx tools/create-module.mts <id> "<Name de>" "<Name en>" <dev-port>
 *   e.g. npx tsx tools/create-module.mts training "Dienste" "Services" 4203
 *
 * Afterwards: `npm install`, `npx nx sync`, then entities and `npm run migration:create -- <id> initial`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const [id, nameDe, nameEn, portText] = process.argv.slice(2);
if (!id || !/^[a-z][a-z0-9-]*$/.test(id) || !nameDe || !nameEn || !Number(portText)) {
  throw new Error('Usage: create-module.mts <id> "<Name de>" "<Name en>" <dev-port>');
}
const port = Number(portText);
const constant = id.toUpperCase().replaceAll('-', '_');
const camel = id.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
const pascal = camel[0].toUpperCase() + camel.slice(1);
const remote = `${id.replaceAll('-', '_')}_web`;
const root = `modules/${id}`;
if (existsSync(root)) throw new Error(`${root} exists already.`);

const write = (path: string, content: string) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content.startsWith('\n') ? content.slice(1) : content);
};
/** Copies a configuration file of the incidents module, replacing its ID. */
const copy = (from: string, to: string) =>
  write(to, readFileSync(from, 'utf8').replaceAll('incidents_web', remote).replaceAll('incidents', id).replaceAll('4202', String(port)));

const tags = (type: string) => ({ tags: [`scope:module-${id}`, `type:${type}`] });
const library = (name: string, dependencies: Record<string, string>, type: string) =>
  JSON.stringify(
    {
      name,
      version: '0.0.1',
      private: true,
      type: 'module',
      main: './dist/index.js',
      module: './dist/index.js',
      types: './dist/index.d.ts',
      exports: {
        './package.json': './package.json',
        '.': { '@forga/source': './src/index.ts', types: './dist/index.d.ts', import: './dist/index.js', default: './dist/index.js' },
      },
      dependencies,
      nx: tags(type),
    },
    null,
    2,
  ) + '\n';

// ----- contracts -----
const contracts = `${root}/${id}-contracts`;
for (const file of ['tsconfig.json', 'tsconfig.lib.json', 'tsconfig.spec.json', 'jest.config.cts', '.spec.swcrc']) {
  copy(`modules/incidents/incidents-contracts/${file}`, `${contracts}/${file}`);
}
write(`${contracts}/package.json`, library(`@forga/${id}-contracts`, { tslib: '^2.3.0', '@forga/core-contracts': '*', zod: '^4.6.7' }, 'contracts'));
write(`${contracts}/src/index.ts`, `export * from './lib/manifest.js';\n`);
write(
  `${contracts}/src/lib/manifest.ts`,
  `
import type { ModuleManifest } from '@forga/core-contracts';

export const ${constant}_MANIFEST = {
  id: '${id}',
  name: { de: '${nameDe}', en: '${nameEn}' },
  version: '0.1.0',
  requires: ['masterdata'],
  permissions: [],
  navigation: [],
  roles: [],
  frontend: { remote: '${remote}', exposed: './Module' },
} satisfies ModuleManifest;
`,
);

// ----- backend -----
const api = `${root}/${id}-api`;
for (const file of ['tsconfig.json', 'tsconfig.lib.json', 'tsconfig.spec.json', 'jest.config.cts', '.spec.swcrc']) {
  copy(`modules/incidents/incidents-api/${file}`, `${api}/${file}`);
}
write(
  `${api}/package.json`,
  library(
    `@forga/${id}-api`,
    {
      tslib: '^2.3.0',
      '@forga/core-api': '*',
      '@forga/core-contracts': '*',
      '@forga/masterdata-contracts': '*',
      [`@forga/${id}-contracts`]: '*',
      '@nestjs/common': '^11.0.0',
      '@mikro-orm/core': '^7.2.5',
      '@mikro-orm/migrations': '^7.2.5',
      uuid: '^14.0.3',
      zod: '^4.6.7',
    },
    'api',
  ),
);
write(`${api}/src/index.ts`, `export * from './lib/${id}.module.js';\n`);
write(
  `${api}/src/migrations/index.ts`,
  `
import type { MigrationObject } from '@mikro-orm/core';

// Maintained by \`npm run migration:create\`.
export const ${constant}_MIGRATIONS: MigrationObject[] = [];
`,
);
write(
  `${api}/src/lib/${id}.module.ts`,
  `
import { Module } from '@nestjs/common';
import { defineModule } from '@forga/core-api';
import { ${constant}_MANIFEST } from '@forga/${id}-contracts';
import { ${constant}_MIGRATIONS } from '../migrations/index.js';

@Module({ controllers: [], providers: [] })
export class ${pascal}Module {}

export const ${camel}Module = defineModule({
  manifest: ${constant}_MANIFEST,
  nestModule: ${pascal}Module,
  entities: [],
  historized: [],
  migrations: ${constant}_MIGRATIONS,
});
`,
);

// ----- frontend -----
const web = `${root}/${id}-web`;
for (const file of ['index.html', 'project.json', 'tsconfig.json', 'vite.config.mts', 'src/index.ts', 'src/bootstrap.tsx']) {
  copy(`modules/incidents/incidents-web/${file}`, `${web}/${file}`);
}
const webPackage = JSON.parse(readFileSync('modules/incidents/incidents-web/package.json', 'utf8')) as { name: string; scripts: Record<string, string>; dependencies: Record<string, string> };
webPackage.name = `${id}-web`;
webPackage.scripts = { dev: `vite --port ${port} --strictPort`, build: 'vite build', preview: `vite preview --port ${port} --strictPort` };
delete webPackage.dependencies['@forga/incidents-contracts'];
webPackage.dependencies[`@forga/${id}-contracts`] = '*';
write(`${web}/package.json`, JSON.stringify(webPackage, null, 2) + '\n');
write(
  `${web}/src/i18n.ts`,
  `
import type { Translations } from '@forga/web-sdk';

export const translations: Translations = {
  de: { module: '${nameDe}', pending: 'Diese Seite folgt in einer späteren Etappe.', errors: {} },
  en: { module: '${nameEn}', pending: 'This page follows in a later stage.', errors: {} },
};
`,
);
write(
  `${web}/src/module.tsx`,
  `
import { defineWebModule, useTranslation } from '@forga/web-sdk';
import { EmptyState } from '@forga/web-ui';
import { translations } from './i18n';

function Pending() {
  const { t } = useTranslation('${id}');
  return <EmptyState title={t('pending')} />;
}

export default defineWebModule({
  translations,
  routes: [{ path: '*', element: <Pending /> }],
});
`,
);

// ----- registrations -----
const edit = (file: string, change: (content: string) => string) => writeFileSync(file, change(readFileSync(file, 'utf8')));
edit('tools/federation.mts', (s) => s.replace(/(export const MODULE_PORTS: Record<string, number> = \{\n)([\s\S]*?)(\};)/, (_, a, b, c) => `${a}${b}  ${id.includes('-') ? `'${id}'` : id}: ${port},\n${c}`));
edit('apps/server/src/app/installed-modules.ts', (s) =>
  s
    .replace(/(import type \{ ForgaModule \} from '@forga\/core-api';\n)/, `$1import { ${camel}Module } from '@forga/${id}-api';\n`)
    .replace(/= \[(.*)\];/, (_, list: string) => `= [${list}, ${camel}Module];`),
);
edit('apps/server/package.json', (s) => {
  const pkg = JSON.parse(s) as { dependencies: Record<string, string> };
  pkg.dependencies[`@forga/${id}-api`] = '*';
  return JSON.stringify(pkg, null, 2) + '\n';
});
edit('apps/server/src/testing/test-database.ts', (s) => s.replace(/drop schema if exists ([^;]*?) cascade/, (_, list: string) => `drop schema if exists ${list}, ${id.replaceAll('-', '_')} cascade`));
edit('docker/Dockerfile', (s) => s.replace(/(npx nx run-many -t build -p shell[^\\\n]*?) \\/, `$1 ${id}-web \\`));

console.log(`Created ${root}. Next: npm install && npx nx sync`);
console.log(join(root, `${id}-api/src/lib/${id}.module.ts`));
