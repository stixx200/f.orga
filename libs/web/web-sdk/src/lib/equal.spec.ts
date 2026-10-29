import { sameJson } from './equal';

describe('sameJson', () => {
  it('ignores the order of object keys', () => {
    expect(sameJson({ a: { years: 2, action: 'delete' } }, { a: { action: 'delete', years: 2 } })).toBe(true);
    expect(JSON.stringify({ years: 2, action: 'delete' })).not.toBe(JSON.stringify({ action: 'delete', years: 2 }));
  });

  it('finds differences in values, keys and arrays', () => {
    expect(sameJson({ a: 1 }, { a: 2 })).toBe(false);
    expect(sameJson({ a: 1 }, { a: 1, b: null })).toBe(false);
    expect(sameJson({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(sameJson([1, 2], [2, 1])).toBe(false);
    expect(sameJson([{ x: 1, y: 2 }], [{ y: 2, x: 1 }])).toBe(true);
    expect(sameJson(null, {})).toBe(false);
  });
});
