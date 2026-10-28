import { assertAliasesFree, cleanAliases, findByAlias, hasAlias, withAlias } from './aliases.js';

describe('aliases', () => {
  it('match like headings', () => {
    expect(hasAlias(['TLF 16/25'], 'tlf16-25')).toBe(true);
    expect(hasAlias(['Übung'], 'uebung')).toBe(true);
    expect(hasAlias([], 'x')).toBe(false);
    expect(findByAlias([{ id: 1, aliases: ['A'] }, { id: 2, aliases: ['B'] }], ' b ')).toEqual({ id: 2, aliases: ['B'] });
  });

  it('are cleaned of duplicates and own names', () => {
    expect(cleanAliases([' GF ', 'gf', '', 'Gruppenführer', 'Zugführer'], ['gruppenfuehrer'])).toEqual(['GF', 'Zugführer']);
  });

  it('may not point to two records', () => {
    expect(() => assertAliasesFree('x.aliasTaken', ['GF'], [{ names: ['zf'], aliases: ['g.f.'] }])).toThrow(
      expect.objectContaining({ response: { code: 'x.aliasTaken', alias: 'GF' } }),
    );
    expect(() => assertAliasesFree('x.aliasTaken', ['GF'], [{ names: ['zf'], aliases: [] }])).not.toThrow();
  });

  it('add a value only if it is new', () => {
    expect(withAlias({ names: ['Maschinist'], aliases: [] }, ' Masch. ')).toEqual(['Masch.']);
    expect(withAlias({ names: ['Maschinist'], aliases: ['Masch'] }, 'masch')).toBeNull();
    expect(withAlias({ names: ['Maschinist'], aliases: [] }, 'maschinist')).toBeNull();
    expect(withAlias({ names: ['Maschinist'], aliases: [] }, 'GF', [{ names: ['GF'], aliases: [] }])).toBeNull();
  });
});
