import { randomBytes } from 'node:crypto';
import type { ModuleManifest } from '@forga/core-contracts';
import { decryptBytes, encryptBytes } from '../security/server-key.js';
import { assertPersonDataComplete } from './completeness.js';
import { createDescribeContext } from './describe-context.js';
import { sectionEntries } from './person-description.js';

const forgaModule = (id: string, privacy?: ModuleManifest['privacy']) => ({ manifest: { id, name: { de: id, en: id }, version: '1', privacy } });

describe('completeness check at startup', () => {
  it('refuses a module that declares personal data but neither describes nor anonymises it', () => {
    const modules = [forgaModule('alpha', { personData: true }), forgaModule('beta', { personData: true }), forgaModule('gamma', { personData: true }), forgaModule('delta')];
    const handled = new Set(['alpha', 'beta']);
    expect(() => assertPersonDataComplete(modules, (id) => handled.has(id))).toThrow(/gamma declare personal data/);
    handled.add('gamma');
    expect(() => assertPersonDataComplete(modules, (id) => handled.has(id))).not.toThrow();
  });

  it('refuses activities named after another module', () => {
    const modules = [forgaModule('alpha', { activities: [{ key: 'beta.things', name: { de: 'x', en: 'x' }, purpose: { de: 'x', en: 'x' } }] })];
    expect(() => assertPersonDataComplete(modules, () => true)).toThrow(/beta\.things/);
  });
});

const ctx = (language: 'de' | 'en') =>
  createDescribeContext({ language, asOf: new Date(), personId: 'p', personName: 'Erika Beispiel', ownUserIds: ['u'] });

describe('describe context', () => {
  it('formats dates, money, booleans and bank accounts per language', () => {
    const de = ctx('de');
    expect(de.date('2026-10-21')).toBe('21.10.2026');
    expect(de.date(new Date('2026-10-21T22:30:00Z'))).toBe('22.10.2026');
    expect(de.dateTime(new Date('2026-10-21T11:05:00Z'))).toBe('21.10.2026 13:05');
    expect(de.money(12.5)).toBe('12,50\u00a0€');
    expect(de.yesNo(true)).toBe('ja');
    expect(de.iban('DE02 1203 0000 0000 2020 51')).toBe('IBAN endet auf 2051');
    expect(de.value('')).toBe('–');
    const en = ctx('en');
    expect(en.date('2026-10-21')).toBe('21 Oct 2026');
    expect(en.yesNo(false)).toBe('no');
    expect(en.money(12.5)).toBe('€12.50');
  });

  it('names the person itself, own changes as „Sie selbst“ and nobody else by name', async () => {
    const de = ctx('de');
    expect(await de.person('p')).toBe('Erika Beispiel');
    expect(await de.person('q')).toBe('andere Person');
    expect(await de.actor('u')).toBe('Sie selbst');
    expect(await de.actor(null)).toBe('automatisch (System)');
  });

  it('counts the entries of a section', () => {
    expect(
      sectionEntries({
        key: 'x',
        title: 'x',
        activity: 'x.y',
        categories: [],
        blocks: [
          { kind: 'fields', rows: [{ label: 'a', value: 'b' }] },
          { kind: 'table', columns: ['a'], rows: [['1'], ['2']] },
          { kind: 'text', text: 'c' },
        ],
      }),
    ).toBe(4);
  });
});

describe('file encryption', () => {
  it('encrypts and decrypts files, and fails with another key', () => {
    const key = randomBytes(32);
    const stored = encryptBytes(Buffer.from('%PDF-1.7 Inhalt'), key);
    expect(stored.toString('latin1')).not.toContain('PDF');
    expect(decryptBytes(stored, key)?.toString()).toBe('%PDF-1.7 Inhalt');
    expect(decryptBytes(stored, randomBytes(32))).toBeNull();
    expect(decryptBytes(Buffer.from('kaputt'), key)).toBeNull();
  });
});
