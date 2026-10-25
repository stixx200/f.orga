import { defineModule, sortModules } from './forga-module.js';

const makeModule = (id: string, requires: string[] = []) =>
  defineModule({ manifest: { id, name: { de: id, en: id }, version: '1.0.0', requires } });

describe('sortModules', () => {
  it('loads requirements before dependent modules', () => {
    const sorted = sortModules([makeModule('incidents', ['masterdata']), makeModule('masterdata')]);
    expect(sorted.map((m) => m.manifest.id)).toEqual(['masterdata', 'incidents']);
  });

  it('reports missing requirements', () => {
    expect(() => sortModules([makeModule('incidents', ['masterdata'])])).toThrow(
      'Module "incidents" requires "masterdata", which is not installed.',
    );
  });

  it('reports cycles', () => {
    expect(() => sortModules([makeModule('a', ['b']), makeModule('b', ['a'])])).toThrow(/Cyclic/);
  });

  it('reports duplicate IDs and the reserved ID "core"', () => {
    expect(() => sortModules([makeModule('a'), makeModule('a')])).toThrow(/twice/);
    expect(() => sortModules([makeModule('core')])).toThrow(/twice/);
  });
});

describe('defineModule', () => {
  it('rejects invalid module IDs', () => {
    expect(() => makeModule('Master Data')).toThrow();
  });

  it('requires settings sections to be prefixed with the module ID', () => {
    expect(() =>
      defineModule({
        manifest: { id: 'incidents', name: { de: 'E', en: 'I' }, version: '1.0.0' },
        settings: { compensation: {} as never },
      }),
    ).toThrow(/must start with "incidents."/);
  });
});
