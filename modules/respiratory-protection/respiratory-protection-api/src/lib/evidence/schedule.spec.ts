import { nextRefresh } from './schedule.js';

describe('nextRefresh', () => {
  it('runs today at 4:00 Berlin time, or tomorrow once that has passed', () => {
    // 2026-10-25 is the end of summer time: 4:00 is 03:00 UTC.
    expect(nextRefresh(new Date('2026-10-25T01:30:00Z')).toISOString()).toBe('2026-10-25T03:00:00.000Z');
    expect(nextRefresh(new Date('2026-10-25T03:00:00Z')).toISOString()).toBe('2026-10-26T03:00:00.000Z');
    // Summer time: 4:00 is 02:00 UTC.
    expect(nextRefresh(new Date('2026-07-01T12:00:00Z')).toISOString()).toBe('2026-07-02T02:00:00.000Z');
  });
});
