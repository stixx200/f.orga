import { DUTY_KIND_TEMPLATE, DutyOfficerSettings, dutyCompensation } from './settings.js';

describe('dutyCompensation', () => {
  it('pays full days with the rate of the first day', () => {
    const kinds = DUTY_KIND_TEMPLATE;
    expect(dutyCompensation({ kind: 'duty-officer', from: '2026-11-02T00:00:00+01:00', to: '2026-11-09T00:00:00+01:00' }, kinds)).toEqual({ days: 7, rate: 10, amount: 70 });
    expect(dutyCompensation({ kind: 'duty-officer', from: '2026-11-02T08:00:00+01:00', to: '2026-11-03T07:00:00+01:00' }, kinds)).toMatchObject({ days: 0, amount: 0 });
    expect(dutyCompensation({ kind: 'unknown', from: '2026-11-02T00:00:00+01:00', to: '2026-11-04T00:00:00+01:00' }, kinds)).toEqual({ days: 2, rate: null, amount: 0 });
  });

  it('pays started days when the duty kind says so', () => {
    const kinds = DUTY_KIND_TEMPLATE.map((k) => ({ ...k, unit: 'started-day' as const }));
    expect(dutyCompensation({ kind: 'duty-officer', from: '2026-11-02T08:00:00+01:00', to: '2026-11-03T09:00:00+01:00' }, kinds)).toEqual({ days: 2, rate: 10, amount: 20 });
  });

  it('pays days on duty at midnight when the duty kind says so', () => {
    const kinds = DUTY_KIND_TEMPLATE.map((k) => ({ ...k, unit: 'midnight' as const }));
    const days = (from: string, to: string) => dutyCompensation({ kind: 'duty-officer', from, to }, kinds).days;
    expect(days('2026-11-02T18:00:00+01:00', '2026-11-04T07:00:00+01:00')).toBe(2);
    expect(days('2026-11-02T00:00:00+01:00', '2026-11-09T00:00:00+01:00')).toBe(7);
    expect(days('2026-11-02T08:00:00+01:00', '2026-11-02T22:00:00+01:00')).toBe(0);
    expect(days('2026-11-02T23:00:00+01:00', '2026-11-03T01:00:00+01:00')).toBe(1);
    expect(days('2026-11-03T00:00:00+01:00', '2026-11-03T06:00:00+01:00')).toBe(1);
    // Summer time ends on 25.10.2026: still one midnight per calendar day.
    expect(days('2026-10-24T12:00:00+02:00', '2026-10-27T12:00:00+01:00')).toBe(3);
    expect(dutyCompensation({ kind: 'duty-officer', from: '2026-11-02T18:00:00+01:00', to: '2026-11-04T07:00:00+01:00' }, kinds)).toEqual({ days: 2, rate: 10, amount: 20 });
  });

  it('starts without duty kinds and requires the EvD report', () => {
    expect(DutyOfficerSettings.parse({})).toEqual({ reportRequired: true, dutyKinds: [] });
  });
});
