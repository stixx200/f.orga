import { parseResult } from './examination-result.js';

describe('parseResult', () => {
  it('reads the results of the certificate and keeps "befristete Bedenken" as concerns', () => {
    expect(parseResult('')).toBeNull();
    expect(parseResult('keine gesundheitlichen Bedenken')).toBe('no-concerns');
    expect(parseResult('befristet keine Bedenken')).toBe('no-concerns-limited');
    expect(parseResult('Keine Bedenken unter bestimmten Voraussetzungen')).toBe('no-concerns-conditional');
    expect(parseResult('dauernde gesundheitliche Bedenken')).toBe('concerns');
    expect(parseResult('befristete gesundheitliche Bedenken')).toBe('concerns');
    expect(parseResult('no-concerns-limited')).toBe('no-concerns-limited');
    expect(parseResult('tauglich')).toBeUndefined();
  });
});
