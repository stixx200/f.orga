import { VOKEFW_VEHICLE_RATES } from './cost-recovery.js';
import { billableHours, missingReasons, totalOf, vehicleRateOn } from './calculation.js';

const t = (minutes: number) => new Date(Date.UTC(2026, 0, 1, 10, minutes)).toISOString();

describe('cost recovery calculation', () => {
  it('rounds the time per statute', () => {
    expect(billableHours(t(0), t(25), 'half-then-hour')).toBe(0.5);
    expect(billableHours(t(0), t(31), 'half-then-hour')).toBe(1);
    expect(billableHours(t(0), t(130), 'half-then-hour')).toBe(3);
    expect(billableHours(t(0), t(70), 'started-half-hour')).toBe(1.5);
    expect(billableHours(t(0), t(70), 'started-hour')).toBe(2);
  });

  it('takes the VOKeFw rate valid on the incident date', () => {
    expect(vehicleRateOn(VOKEFW_VEHICLE_RATES, 'lf-20', '2016-04-25')).toBeNull();
    expect(vehicleRateOn(VOKEFW_VEHICLE_RATES, 'lf-20', '2024-03-18')).toBe(170);
    expect(vehicleRateOn(VOKEFW_VEHICLE_RATES, 'lf-20', '2024-03-19')).toBe(205);
    expect(vehicleRateOn(VOKEFW_VEHICLE_RATES, 'mzb', '2026-01-01')).toBeNull();
  });

  it('needs a reason for changed amounts', () => {
    const base = { kind: 'vehicle' as const, label: 'LF 20', quantity: 2, unit: 'h', rate: 205, category: 'lf-20', vehicleId: null };
    expect(missingReasons([{ ...base, amount: 410, computedAmount: 410, reason: '' }])).toHaveLength(0);
    expect(missingReasons([{ ...base, amount: 300, computedAmount: 410, reason: '' }])).toHaveLength(1);
    expect(totalOf([{ amount: 10.1 }, { amount: 0.2 }])).toBe(10.3);
  });
});
