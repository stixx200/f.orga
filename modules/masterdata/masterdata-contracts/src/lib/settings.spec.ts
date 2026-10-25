import { probationEnd } from './settings.js';

describe('probationEnd', () => {
  it('ends on the day before the anniversary', () => {
    expect(probationEnd('2026-03-15', 12)).toBe('2027-03-14');
    expect(probationEnd('2026-01-01', 12)).toBe('2026-12-31');
  });

  it('clamps the anniversary to the end of the month', () => {
    expect(probationEnd('2026-08-31', 6)).toBe('2027-02-27');
    expect(probationEnd('2028-02-29', 12)).toBe('2029-02-27');
  });
});
