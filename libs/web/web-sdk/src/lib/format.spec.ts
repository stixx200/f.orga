import { fromLocalInput, toLocalInput } from './format';

describe('fromLocalInput', () => {
  it('converts summer and winter times', () => {
    expect(fromLocalInput('2026-07-01T12:00')).toBe('2026-07-01T10:00:00.000Z');
    expect(fromLocalInput('2026-12-01T12:00')).toBe('2026-12-01T11:00:00.000Z');
  });

  it('keeps summer time before the clock goes back (25 October 2026)', () => {
    expect(fromLocalInput('2026-10-25T01:30')).toBe('2026-10-24T23:30:00.000Z');
    // 02:30 happens twice; the earlier one (summer time) is meant.
    expect(fromLocalInput('2026-10-25T02:30')).toBe('2026-10-25T00:30:00.000Z');
    expect(fromLocalInput('2026-10-25T03:30')).toBe('2026-10-25T02:30:00.000Z');
  });

  it('switches to summer time when the clock goes forward (29 March 2026)', () => {
    expect(fromLocalInput('2026-03-29T01:30')).toBe('2026-03-29T00:30:00.000Z');
    expect(fromLocalInput('2026-03-29T03:30')).toBe('2026-03-29T01:30:00.000Z');
    // 02:30 does not exist; it moves forward by the gap to 03:30 summer time.
    expect(fromLocalInput('2026-03-29T02:30')).toBe('2026-03-29T01:30:00.000Z');
  });

  it('round-trips with toLocalInput', () => {
    for (const local of ['2026-10-25T00:15', '2026-10-25T01:59', '2026-10-25T04:00', '2026-03-29T01:59', '2026-03-29T03:00', '2027-01-01T00:00']) {
      expect(toLocalInput(fromLocalInput(local))).toBe(local);
    }
  });
});
