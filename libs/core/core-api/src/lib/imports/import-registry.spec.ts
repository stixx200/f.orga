import { BadRequestException } from '@nestjs/common';
import { AuthenticatedUser } from '../security/authenticated-user.js';
import { type ImportContext, type ImportProfile, ImportRegistry } from './import-registry.js';
import { BLANK_MAPPING } from './parse.js';

const name = { de: 'x', en: 'x' };
const user = new AuthenticatedUser('u', 'user', 'User', null, 'de', new Map([['test.write', 'brigade']]), 'session');
const source = { module: 'core' };

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

function registry(): ImportRegistry {
  const result = new ImportRegistry();
  result.registerLookup('test', {
    kind: 'color',
    name,
    keyFormat: 'slug',
    entries: async () => [{ key: 'red', name }, { key: 'blue', name }],
    all: async () => [{ key: 'red', name }, { key: 'blue', name }, { key: 'grey', name: { de: 'Grau', en: 'Grey' } }],
    create: { permission: 'test.manage', run: async ({ key }) => ({ key, name }) },
  });
  return result;
}

const rows = ['red', 'Grün', ' Grün ', 'Gelb', 'blue'].map((color, index) => ({ row: index + 1, values: { color } }));
const runWith = (mappings: Record<string, Record<string, string>>) => registry().run(profile([]), rows, { user, options: {}, dryRun: true, source, mappings });

describe('ImportRegistry.run', () => {
  it('lists unmatched values once per kind and value, with their count', async () => {
    const { result } = await registry().run(profile([]), rows, { user, options: {}, dryRun: true, source, mappings: {} });
    expect(result.unmatched).toEqual([
      { kind: 'color', value: 'Grün', count: 2 },
      { kind: 'color', value: 'Gelb', count: 1 },
    ]);
  });

  it('passes chosen entries to the profile and reports the used ones', async () => {
    const seen: string[] = [];
    const { result, used } = await registry().run(profile(seen), rows, { user, options: {}, dryRun: true, source, mappings: { color: { Grün: 'blue', Lila: 'red' } } });
    expect(seen).toEqual(['red', 'blue', 'blue', 'blue']);
    expect(result.unmatched).toEqual([{ kind: 'color', value: 'Gelb', count: 1 }]);
    expect(used).toEqual([{ kind: 'color', value: 'Grün', key: 'blue', remembered: false }]);
  });

  it('consults remembered mappings after the request, compared like headings', async () => {
    const seen: string[] = [];
    const remembered = new Map([['color', new Map([['gelb', 'red'], ['gruen', 'red']])]]);
    const { result, used } = await registry().run(profile(seen), rows, { user, options: {}, dryRun: true, source, mappings: { color: { Grün: 'blue' } }, remembered });
    expect(seen).toEqual(['red', 'blue', 'blue', 'red', 'blue']);
    expect(result.unmatched).toEqual([]);
    expect(used).toEqual([
      { kind: 'color', value: 'Grün', key: 'blue', remembered: false },
      { kind: 'color', value: 'Gelb', key: 'red', remembered: true },
    ]);
  });

  it('rejects unknown lookups and target keys', async () => {
    await expect(runWith({ shape: { Kreis: 'circle' } })).rejects.toThrow(BadRequestException);
    await expect(runWith({ color: { Grün: 'green' } })).rejects.toMatchObject({ response: { code: 'imports.unknownMappingTarget', kind: 'color', value: 'Grün', key: 'green' } });
  });

  it('offers the extras of other modules as targets', async () => {
    const withExtras = registry();
    withExtras.registerLookupExtras('other', { kind: 'color', entries: async () => [{ key: 'other:none', name }] });
    expect((await withExtras.entries('color'))?.map((e) => e.key)).toEqual(['red', 'blue', 'other:none']);
    expect(await withExtras.entries('shape')).toBeUndefined();
    const seen: string[] = [];
    await withExtras.run(profile(seen), rows, { user, options: {}, dryRun: false, source, mappings: { color: { Grün: 'other:none' } } });
    expect(seen).toContain('other:none');
  });

  it('requires the module prefix for keys of extras', async () => {
    const result = registry();
    result.registerLookupExtras('other', { kind: 'color', entries: async () => [{ key: 'none', name }] });
    await expect(result.entries('color')).rejects.toThrow('must start with "other:"');
  });

  it('tells active, inactive and deleted targets apart', async () => {
    const withExtras = registry();
    withExtras.registerLookupExtras('other', { kind: 'color', entries: async () => [{ key: 'other:none', name }] });
    expect(Object.fromEntries(await withExtras.describeTargets('color', ['red', 'grey', 'green', 'other:none']))).toEqual({
      red: { name, state: 'active' },
      grey: { name: { de: 'Grau', en: 'Grey' }, state: 'inactive' },
      green: { name: null, state: 'deleted' },
      'other:none': { name, state: 'active' },
    });
    expect(Object.fromEntries(await withExtras.describeTargets('shape', ['circle']))).toEqual({ circle: { name: null, state: 'deleted' } });
  });

  it('offers creating entries only with the permission', () => {
    expect(registry().lookups(user)).toEqual([{ kind: 'color', name, keyFormat: 'slug', creatable: false, createCategoryKind: null }]);
  });

  it('treats a blank cell as a value that can be mapped and remembered', async () => {
    const seen: string[] = [];
    const blank = [{ row: 1, values: { color: '' } }, { row: 2, values: { color: '   ' } }];
    const open = await registry().run(profile(seen), blank, { user, options: {}, dryRun: true, source, mappings: {} });
    expect(open.result.unmatched).toEqual([{ kind: 'color', value: '', count: 2 }]);

    const chosen = await registry().run(profile([]), blank, { user, options: {}, dryRun: true, source, mappings: { color: { '': 'red' } } });
    expect(chosen.result.unmatched).toEqual([]);
    expect(chosen.used).toEqual([{ kind: 'color', value: '', key: 'red', remembered: false }]);

    const remembered = new Map([['color', new Map([[BLANK_MAPPING, 'blue']])]]);
    const again = await registry().run(profile([]), blank, { user, options: {}, dryRun: true, source, mappings: {}, remembered });
    expect(again.result.unmatched).toEqual([]);
    expect(again.used).toEqual([{ kind: 'color', value: '', key: 'blue', remembered: true }]);
  });
});
