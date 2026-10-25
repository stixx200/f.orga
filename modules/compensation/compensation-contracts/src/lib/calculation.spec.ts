import { allowanceShare, billableHours, calendarDays, incidentPayout, overlapping, trainingRateOn } from './calculation.js';
import { CompensationSettings } from './compensation.js';

const p = (from: string, to: string, amount: number) => ({ from, to, amount, duringWorkingHours: false });

describe('compensation calculation', () => {
  it('rounds hours', () => {
    expect(billableHours('2026-03-01T19:00:00Z', '2026-03-01T21:10:00Z', 'started-hour')).toBe(3);
    expect(billableHours('2026-03-01T19:00:00Z', '2026-03-01T21:10:00Z', 'started-half-hour')).toBe(2.5);
    expect(billableHours('2026-03-01T19:00:00Z', '2026-03-01T21:00:00Z', 'exact-minutes')).toBe(2);
  });

  it('takes the rate valid on the date', () => {
    const rates = [{ kind: 'training' as const, validFrom: '2026-01-01', amount: 15 }, { kind: 'training' as const, validFrom: '2027-01-01', amount: 17 }];
    expect(trainingRateOn(rates, 'training', '2026-12-31')).toBe(15);
    expect(trainingRateOn(rates, 'training', '2027-02-01')).toBe(17);
    expect(trainingRateOn(rates, 'fire-watch', '2027-02-01')).toBeNull();
  });

  it('splits function allowances by months or gives them to the holder at year end', () => {
    expect(allowanceShare(1200, 2026, '2020-01-01', null, 'by-months')).toBe(1200);
    expect(allowanceShare(1200, 2026, '2026-04-15', null, 'by-months')).toBe(900);
    expect(allowanceShare(1200, 2026, '2020-01-01', '2026-03-31', 'by-months')).toBe(300);
    expect(allowanceShare(1200, 2026, '2020-01-01', '2026-03-31', 'holder-at-year-end')).toBe(0);
    expect(allowanceShare(1200, 2026, '2027-01-01', null, 'by-months')).toBe(0);
  });

  it('detects overlaps but allows touching intervals and long duty periods', () => {
    const a = { from: '2026-03-01T10:00:00Z', to: '2026-03-01T12:00:00Z' };
    expect(overlapping(a, { from: '2026-03-01T11:00:00Z', to: '2026-03-01T13:00:00Z' })).toBe(true);
    expect(overlapping(a, { from: '2026-03-01T12:00:00Z', to: '2026-03-01T13:00:00Z' })).toBe(false);
    expect(overlapping(a, { from: '2026-02-28T00:00:00Z', to: '2026-03-03T00:00:00Z' })).toBe(false);
  });

  it('counts calendar days in Europe/Berlin', () => {
    expect(calendarDays('2026-03-01T22:30:00Z', '2026-03-01T23:30:00Z')).toBe(2);
    expect(calendarDays('2026-03-01T08:00:00Z', '2026-03-03T08:00:00Z')).toBe(3);
  });

  it('applies the statute limits and hints to an incident', () => {
    const statute = CompensationSettings.parse({});
    expect(incidentPayout(p('2026-03-01T08:00:00Z', '2026-03-01T11:00:00Z', 45), statute)).toEqual({ amount: 45, refreshment: null, hints: [] });
    expect(incidentPayout(p('2026-03-01T08:00:00Z', '2026-03-01T13:00:00Z', 75), statute)).toEqual({ amount: 75, refreshment: null, hints: ['refreshment'] });
    const configured = { ...statute, refreshment: { afterHours: 4, amount: 10 }, maxPerService: 60 };
    expect(incidentPayout(p('2026-03-01T08:00:00Z', '2026-03-01T13:00:00Z', 75), configured)).toEqual({ amount: 60, refreshment: 10, hints: ['capped'] });
    expect(incidentPayout(p('2026-03-01T08:00:00Z', '2026-03-03T20:00:00Z', 900), statute).hints).toEqual(['refreshment', 'multi-day']);
  });
});
