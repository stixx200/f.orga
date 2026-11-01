import { afterEach, vi } from 'vitest';
import type * as I18nModule from './i18n';
import type * as WebModuleModule from './web-module';

// A production build of a module frontend may evaluate its own copy of this package. Every copy must use the same
// i18n instance and extension registry, otherwise React shows translation keys and extensions disappear.

type SharedGlobals = typeof globalThis & { forgaI18n?: unknown; forgaExtensionPoints?: unknown };

/** Evaluates a module again, like a second copy of the package would. */
async function load<T>(path: string): Promise<T> {
  vi.resetModules();
  return (await import(path)) as T;
}

afterEach(() => {
  const shared = globalThis as SharedGlobals;
  delete shared.forgaI18n;
  delete shared.forgaExtensionPoints;
});

describe('state shared between copies of the package', () => {
  it('uses one i18n instance with the translations of all copies', async () => {
    const first = await load<typeof I18nModule>('./i18n.ts');
    first.addTranslations('shell', { de: { greeting: 'Hallo' }, en: { greeting: 'Hello' } });
    const second = await load<typeof I18nModule>('./i18n.ts');
    expect(second.i18n).toBe(first.i18n);
    expect(second.i18n.getResource('de', 'shell', 'greeting')).toBe('Hallo');
  });

  it('keeps extensions registered through another copy', async () => {
    const first = await load<typeof WebModuleModule>('./web-module.ts');
    first.registerExtensions('masterdata', { 'test.point': { label: { de: 'Test', en: 'Test' }, component: () => null } });
    const second = await load<typeof WebModuleModule>('./web-module.ts');
    expect(second.extensionsOf('test.point').map((e) => e.module)).toEqual(['masterdata']);
  });
});
