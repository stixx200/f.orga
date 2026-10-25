import { IncidentSettings } from '@forga/incidents-contracts';
import { billableHours, computeCompensation, dutyCompensation, localDate, rateOn } from './compensation.js';

const settings = IncidentSettings.parse({
  rates: [
    { kind: 'incident', amount: 12.5, validFrom: '2020-01-01' },
    { kind: 'incident', amount: 15, validFrom: '2025-07-01' },
    { kind: 'standby', amount: 15, validFrom: '2025-07-01' },
  ],
  allowances: [{ key: 'dirt', name: { de: 'Schmutzzulage', en: 'Dirt allowance' }, amount: 5 }],
});

const entry = (from: string, to: string, extra: Partial<Parameters<typeof computeCompensation>[0]> = {}) => ({
  from,
  to,
  guest: false,
  standby: false,
  duringWorkingHours: false,
  allowances: [],
  override: null,
  ...extra,
});

describe('billableHours', () => {
  it('counts started hours', () => {
    expect(billableHours('2026-10-21T13:05:00+02:00', '2026-10-21T14:10:00+02:00', 'started-hour')).toBe(2);
    expect(billableHours('2026-10-21T13:00:00+02:00', '2026-10-21T14:00:00+02:00', 'started-hour')).toBe(1);
    expect(billableHours('2026-10-21T13:00:00+02:00', '2026-10-21T13:00:00+02:00', 'started-hour')).toBe(0);
  });

  it('supports half hours and exact minutes', () => {
    expect(billableHours('2026-10-21T13:05:00+02:00', '2026-10-21T14:10:00+02:00', 'started-half-hour')).toBe(1.5);
    expect(billableHours('2026-10-21T13:00:00+02:00', '2026-10-21T13:45:00+02:00', 'exact-minutes')).toBe(0.75);
  });
});

describe('rateOn', () => {
  it('uses the rate valid on the day', () => {
    expect(rateOn(settings.rates, 'incident', '2025-06-30')).toBe(12.5);
    expect(rateOn(settings.rates, 'incident', '2025-07-01')).toBe(15);
    expect(rateOn(settings.rates, 'standby', '2025-01-01')).toBeNull();
  });

  it('takes the date in Europe/Berlin', () => {
    expect(localDate('2025-06-30T22:30:00Z')).toBe('2025-07-01');
  });
});

describe('computeCompensation', () => {
  it('multiplies started hours with the rate and adds allowances', () => {
    const result = computeCompensation(
      entry('2026-10-21T13:05:00+02:00', '2026-10-21T15:50:00+02:00', { allowances: ['dirt', 'unknown'] }),
      settings,
      'incident',
    );
    expect(result).toEqual({ hours: 3, rate: 15, allowances: 5, amount: 50, overridden: false });
  });

  it('pays standby always with the configured hours', () => {
    const result = computeCompensation(entry('2026-10-21T13:05:00+02:00', '2026-10-21T18:00:00+02:00', { standby: true }), settings, 'incident');
    expect(result).toMatchObject({ hours: 1, rate: 15, amount: 15 });
  });

  it('counts at least the minimum duration, not for standby', () => {
    const minimum = { ...settings, rounding: 'exact-minutes' as const, minimumHours: 2 };
    expect(computeCompensation(entry('2026-10-21T13:00:00+02:00', '2026-10-21T13:20:00+02:00'), minimum, 'incident')).toMatchObject({ hours: 2, amount: 30 });
    expect(computeCompensation(entry('2026-10-21T13:00:00+02:00', '2026-10-21T15:30:00+02:00'), minimum, 'incident')).toMatchObject({ hours: 2.5 });
    expect(computeCompensation(entry('2026-10-21T13:00:00+02:00', '2026-10-21T13:20:00+02:00', { standby: true }), minimum, 'incident')).toMatchObject({ hours: 1 });
  });

  it('pays nothing during working hours or to guests', () => {
    const working = computeCompensation(entry('2026-10-21T13:00:00+02:00', '2026-10-21T15:00:00+02:00', { duringWorkingHours: true }), settings, 'incident');
    const guest = computeCompensation(entry('2026-10-21T13:00:00+02:00', '2026-10-21T15:00:00+02:00', { guest: true }), settings, 'incident');
    expect(working.amount).toBe(0);
    expect(guest.amount).toBe(0);
  });
  it('compensates working hours when the statute says so', () => {
    const paid = computeCompensation(entry('2026-10-21T13:00:00+02:00', '2026-10-21T15:00:00+02:00', { duringWorkingHours: true }), { ...settings, compensateDuringWorkingHours: true }, 'incident');
    expect(paid.amount).toBeGreaterThan(0);
  });


  it('respects a manual override', () => {
    const result = computeCompensation(
      entry('2026-10-21T13:00:00+02:00', '2026-10-21T15:00:00+02:00', { override: { amount: 90, reason: 'Pauschale' } }),
      settings,
      'incident',
    );
    expect(result).toMatchObject({ hours: 2, rate: 15, amount: 90, overridden: true });
  });
});

describe('dutyCompensation', () => {
  it('pays full days with the rate of the first day', () => {
    const kinds = IncidentSettings.parse({}).dutyKinds;
    expect(dutyCompensation({ kind: 'duty-officer', from: '2026-11-02T00:00:00+01:00', to: '2026-11-09T00:00:00+01:00' }, kinds)).toEqual({ days: 7, rate: 10, amount: 70 });
    expect(dutyCompensation({ kind: 'duty-officer', from: '2026-11-02T08:00:00+01:00', to: '2026-11-03T07:00:00+01:00' }, kinds)).toMatchObject({ days: 0, amount: 0 });
    expect(dutyCompensation({ kind: 'unknown', from: '2026-11-02T00:00:00+01:00', to: '2026-11-04T00:00:00+01:00' }, kinds)).toEqual({ days: 2, rate: null, amount: 0 });
  });

  it('pays started days when the duty kind says so', () => {
    const kinds = IncidentSettings.parse({}).dutyKinds.map((k) => ({ ...k, unit: 'started-day' as const }));
    expect(dutyCompensation({ kind: 'duty-officer', from: '2026-11-02T08:00:00+01:00', to: '2026-11-03T09:00:00+01:00' }, kinds)).toEqual({ days: 2, rate: 10, amount: 20 });
  });
});
