import { BW_CATALOG_TEMPLATE } from '@forga/masterdata-contracts';
import { matchCatalog } from './catalog-match.js';

const of = (kind: string) => BW_CATALOG_TEMPLATE.filter((e) => e.kind === kind).map((e) => ({ key: e.key, name: e.name, attributes: e.attributes ?? {} }));
const key = (kind: string, text: string) => matchCatalog(of(kind), text)?.key;

describe('matchCatalog', () => {
  it('matches ranks without gender forms', () => {
    expect(key('rank', 'Feuerwehrmann')).toBe('fm');
    expect(key('rank', 'Oberlöschmeister')).toBe('olm');
    expect(key('rank', 'HBM')).toBe('hbm');
  });

  it('matches course names of MP-Feuer', () => {
    expect(key('qualification', 'Truppführer, Lehrgang auf Kreisebene')).toBe('squad-leader');
    expect(key('qualification', 'Atemschutzgeräteträger, Lehrgang auf Kre')).toBe('breathing-apparatus');
    expect(key('qualification', 'Maschinist, Lehrgang auf Kreisebene')).toBe('machinist');
    expect(key('qualification', 'Gruppenführer')).toBe('group-leader');
  });

  it('matches honors by their words', () => {
    expect(key('honor', 'Feuerwehr-Ehrenzeichen in Silber')).toBe('state-honor-silver');
    expect(key('honor', 'Feuerwehr-Ehrenzeichen in Gold')).toBe('state-honor-gold');
  });

  it('leaves ambiguous and unknown names open', () => {
    expect(key('qualification', 'Truppmann, Lehrgang auf Kreisebene')).toBeUndefined();
    expect(key('qualification', 'Motorsägen-Grundlehrgang')).toBeUndefined();
    expect(key('rank', '')).toBeUndefined();
  });
});
