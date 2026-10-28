import { BadRequestException } from '@nestjs/common';
import { AuthenticatedUser } from '../security/authenticated-user.js';
import { type ImportContext, type ImportProfile, ImportRegistry } from './import-registry.js';

const name = { de: 'x', en: 'x' };
const user = new AuthenticatedUser('u', 'user', 'User', null, 'de', new Map([['test.write', 'brigade']]), 'session');

/** Looks every row's `color` up in a fixed list and reports what it does not know. */
function profile(seen: string[]): ImportProfile {
  const colors = ['red', 'blue'];
  return {
    id: 'test.colors',
    name,
    permission: 'test.write',
    fields: [],
    run: async (rows, context: ImportContext) => {
      for (const { values } of rows) {
        const color = colors.includes(values['color']) ? values['color'] : context.mapped('color', values['color']);
        if (color) seen.push(color);
        else context.unmatched('color', values['color']);
      }
      return { dryRun: context.dryRun, counts: { create: 0, update: 0, unchanged: 0, error: 0 }, rows: [] };
    },
  };
}

function registry(remembered: string[] = []): ImportRegistry {
  const result = new ImportRegistry();
  result.registerLookup('test', {
    kind: 'color',
    name,
    keyFormat: 'slug',
    entries: async () => [{ key: 'red', name }, { key: 'blue', name }],
    create: { permission: 'test.manage', run: async ({ key }) => ({ key, name }) },
    remember: async (key, value) => {
      remembered.push(`${value}→${key}`);
    },
  });
  return result;
}

const runWith = (mappings: Record<string, Record<string, string>>) => registry().run(profile([]), rows, { user, options: {}, dryRun: true, mappings });

const rows = ['red', 'Grün', ' Grün ', 'Gelb', 'blue'].map((color, index) => ({ row: index + 1, values: { color } }));

describe('ImportRegistry.run', () => {
  it('lists unmatched values once per kind and value, with their count', async () => {
    const result = await registry().run(profile([]), rows, { user, options: {}, dryRun: true, mappings: {} });
    expect(result.unmatched).toEqual([
      { kind: 'color', value: 'Grün', count: 2 },
      { kind: 'color', value: 'Gelb', count: 1 },
    ]);
  });

  it('passes chosen entries to the profile', async () => {
    const seen: string[] = [];
    const result = await registry().run(profile(seen), rows, { user, options: {}, dryRun: true, mappings: { color: { Grün: 'blue' } } });
    expect(seen).toEqual(['red', 'blue', 'blue', 'blue']);
    expect(result.unmatched).toEqual([{ kind: 'color', value: 'Gelb', count: 1 }]);
  });

  it('remembers the used choices after an apply, not after a dry run', async () => {
    const mappings = { color: { Grün: 'blue', Lila: 'red' } };
    const preview: string[] = [];
    await registry(preview).run(profile([]), rows, { user, options: {}, dryRun: true, mappings });
    expect(preview).toEqual([]);
    const applied: string[] = [];
    await registry(applied).run(profile([]), rows, { user, options: {}, dryRun: false, mappings });
    expect(applied).toEqual(['Grün→blue']);
  });

  it('rejects unknown lookups and target keys', async () => {
    await expect(runWith({ shape: { Kreis: 'circle' } })).rejects.toThrow(BadRequestException);
    await expect(runWith({ color: { Grün: 'green' } })).rejects.toMatchObject({ response: { code: 'imports.unknownMappingTarget', kind: 'color', value: 'Grün', key: 'green' } });
  });

  it('offers creating entries only with the permission', () => {
    expect(registry().lookups(user)).toEqual([{ kind: 'color', name, keyFormat: 'slug', creatable: false }]);
  });
});
