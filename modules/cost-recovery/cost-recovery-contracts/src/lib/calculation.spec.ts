import { BW_TEMPLATE, CostRecoverySettings, missingConfiguration, VOKEFW_VEHICLE_RATES } from './cost-recovery.js';
import { billableHours, cleanLocation, missingReasons, paidOf, parseAmount, refundDueOf, totalOf, vehicleRateOn } from './calculation.js';

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

  it('needs a reason for changed amounts, also for positions added by hand', () => {
    const base = { kind: 'vehicle' as const, label: 'LF 20', quantity: 2, unit: 'h', rate: 205, category: 'lf-20', vehicleId: null, persons: null, hoursEach: null };
    expect(missingReasons([{ ...base, amount: 410, computedAmount: 410, reason: '' }])).toHaveLength(0);
    expect(missingReasons([{ ...base, amount: 300, computedAmount: 410, reason: '' }])).toHaveLength(1);
    // By hand: the amount has to be quantity × rate unless a reason is given.
    const manual = { ...base, kind: 'material' as const, quantity: 3, rate: 18.5, computedAmount: null };
    expect(missingReasons([{ ...manual, amount: 55.5, reason: '' }])).toHaveLength(0);
    expect(missingReasons([{ ...manual, amount: 100, reason: '' }])).toHaveLength(1);
    expect(missingReasons([{ ...manual, amount: 100, reason: 'Entsorgung inklusive' }])).toHaveLength(0);
    expect(totalOf([{ amount: 10.1 }, { amount: 0.2 }])).toBe(10.3);
  });

  it('sums payments without the reversed ones', () => {
    expect(paidOf([{ amount: 100, reversal: null }, { amount: 50.5, reversal: null }, { amount: 30, reversal: { date: '2026-01-01', reason: 'Fehlbuchung', by: 'Admin' } }])).toBe(150.5);
  });

  it('removes repeated parts of the location', () => {
    expect(cleanLocation('Hauptstraße 1, 12345 Musterstadt, Musterstadt')).toBe('Hauptstraße 1, 12345 Musterstadt');
    expect(cleanLocation('Hauptstraße 1, 12345 Musterstadt, Ahornfeld')).toBe('Hauptstraße 1, 12345 Musterstadt, Ahornfeld');
  });

  it('starts without state-specific values and names what is missing', () => {
    const empty = CostRecoverySettings.parse({});
    expect(empty).toMatchObject({ offenses: [], vehicleRates: [], defaultLegalBasis: '', regulation: '', remedy: '' });
    expect(missingConfiguration(empty)).toEqual(['offenses', 'defaultLegalBasis', 'regulation', 'remedy']);
    expect(missingConfiguration(CostRecoverySettings.parse(BW_TEMPLATE))).toEqual([]);
  });

  it('reads amounts of payment files in German and international notation', () => {
    expect(parseAmount('1.000')).toBe(1000);
    expect(parseAmount('1.234,50 €')).toBe(1234.5);
    expect(parseAmount('1234,5')).toBe(1234.5);
    expect(parseAmount('100,00')).toBe(100);
    expect(parseAmount('1234.50')).toBe(1234.5);
    expect(parseAmount('1,234.50')).toBe(1234.5);
    expect(parseAmount('12.5')).toBe(12.5);
    expect(parseAmount('2.000.000')).toBe(2000000);
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('1.2.3,4')).toBe(123.4);
  });

  it('refunds overpayments, and everything paid on a cancelled notice', () => {
    const payments = [{ amount: 120, reversal: null }];
    const positions = [{ amount: 100 }];
    expect(refundDueOf({ status: 'paid', positions, payments })).toBe(20);
    expect(refundDueOf({ status: 'handed-over', positions, payments: [{ amount: 50, reversal: null }] })).toBe(0);
    expect(refundDueOf({ status: 'cancelled', positions, payments })).toBe(120);
    // Replaced by an amendment: the payments went over to it.
    expect(refundDueOf({ status: 'amended', positions, payments })).toBe(0);
    // A refund recorded as negative payment settles it.
    expect(refundDueOf({ status: 'paid', positions, payments: [...payments, { amount: -20, reversal: null }] })).toBe(0);
  });
});
