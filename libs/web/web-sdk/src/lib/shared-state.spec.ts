import type * as I18nModule from './i18n';
import type * as WebModuleModule from './web-module';

// A production build of a module frontend may evaluate its own copy of this package. Every copy must use the same
// i18n instance and extension registry, otherwise React shows translation keys and extensions disappear.

/** Evaluates a module again, like a second copy of the package would. */
function load<T>(path: string): T {
  let loaded: T | undefined;
  jest.isolateModules(() => {
    // oxlint-disable-next-line typescript/no-require-imports
    loaded = require(path) as T;
  });
  return loaded!;
}

describe('state shared between copies of the package', () => {
  it('uses one i18n instance with the translations of all copies', () => {
    const first = load<typeof I18nModule>('./i18n');
    first.addTranslations('shell', { de: { greeting: 'Hallo' }, en: { greeting: 'Hello' } });
    const second = load<typeof I18nModule>('./i18n');
    expect(second.i18n).toBe(first.i18n);
    expect(second.i18n.getResource('de', 'shell', 'greeting')).toBe('Hallo');
  });

  it('keeps extensions registered through another copy', () => {
    const first = load<typeof WebModuleModule>('./web-module');
    first.registerExtensions('masterdata', { 'test.point': { label: { de: 'Test', en: 'Test' }, component: () => null } });
    const second = load<typeof WebModuleModule>('./web-module');
    expect(second.extensionsOf('test.point').map((e) => e.module)).toEqual(['masterdata']);
  });
});
