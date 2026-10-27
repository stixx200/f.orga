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

  it('starts without duty kinds and requires the EvD report', () => {
    expect(DutyOfficerSettings.parse({})).toEqual({ reportRequired: true, dutyKinds: [] });
  });
});
