import { isValidIban, normalizeIban } from './iban.js';

describe('isValidIban', () => {
  it('accepts IBANs with correct check digits, also with spaces and lower case', () => {
    expect(isValidIban('DE89 3704 0044 0532 0130 00')).toBe(true);
    expect(isValidIban('de02120300000000202051')).toBe(true);
    expect(normalizeIban('de89 3704')).toBe('DE893704');
  });

  it('rejects wrong check digits and malformed values', () => {
    expect(isValidIban('DE89370400440532013001')).toBe(false);
    expect(isValidIban('DE88370400440532013000')).toBe(false);
    expect(isValidIban('DE89')).toBe(false);
    expect(isValidIban('')).toBe(false);
  });
});
