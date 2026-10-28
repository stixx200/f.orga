import { effectiveTimes, inheritedTimes } from './assignment-times.js';

const report = { alarmedAt: '2026-10-21T11:00:00.000Z', returnedAt: '2026-10-21T13:00:00.000Z' };

describe('assignment times', () => {
  it('inherits the times of the vehicle as far as it has own ones, else those of the report', () => {
    expect(inheritedTimes(report)).toEqual({ from: report.alarmedAt, to: report.returnedAt });
    expect(inheritedTimes(report, { alarmedAt: '2026-10-21T11:30:00.000Z', returnedAt: null })).toEqual({ from: '2026-10-21T11:30:00.000Z', to: report.returnedAt });
    expect(inheritedTimes(report, { alarmedAt: null, returnedAt: '2026-10-21T12:00:00.000Z' })).toEqual({ from: report.alarmedAt, to: '2026-10-21T12:00:00.000Z' });
    // The departure of the vehicle does not change the times of its crew.
    expect(inheritedTimes(report, { alarmedAt: null, departedAt: '2026-10-21T11:10:00.000Z', returnedAt: null })).toEqual({ from: report.alarmedAt, to: report.returnedAt });
  });

  it('prefers own times of the person', () => {
    const vehicle = { alarmedAt: '2026-10-21T11:30:00.000Z', returnedAt: '2026-10-21T12:30:00.000Z' };
    expect(effectiveTimes({ from: null, to: null }, report, vehicle)).toEqual({ from: vehicle.alarmedAt, to: vehicle.returnedAt });
    expect(effectiveTimes({ from: null, to: '2026-10-21T12:00:00.000Z' }, report, vehicle)).toEqual({ from: vehicle.alarmedAt, to: '2026-10-21T12:00:00.000Z' });
    expect(effectiveTimes({ from: '2026-10-21T11:15:00.000Z', to: null }, report, null)).toEqual({ from: '2026-10-21T11:15:00.000Z', to: report.returnedAt });
  });
});
