import { addMonths, ageOn } from './dates.js';

describe('addMonths', () => {
  it('adds months and keeps the day', () => {
    expect(addMonths('2026-03-15', 12)).toBe('2027-03-15');
    expect(addMonths('2026-11-30', 3)).toBe('2027-02-28');
  });

  it('clamps to the end of the month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2027-12-31', 2)).toBe('2028-02-29');
  });
});

describe('ageOn', () => {
  it('counts full years', () => {
    expect(ageOn('2008-10-23', '2026-10-22')).toBe(17);
    expect(ageOn('2008-10-23', '2026-10-23')).toBe(18);
    expect(ageOn('1961-02-28', '2026-02-27')).toBe(64);
  });
});
