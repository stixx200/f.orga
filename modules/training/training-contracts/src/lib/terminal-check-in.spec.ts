import { terminalCheckInWindow } from './terminal-check-in.js';

describe('check-in window of a session at the info terminal', () => {
  it('opens checkInBeforeMinutes before the start and closes 60 minutes after the planned end', () => {
    const session = { startsAt: '2026-10-21T17:00:00.000Z', endsAt: '2026-10-21T19:00:00.000Z' };
    expect(terminalCheckInWindow(session, { beforeMinutes: 30, afterEndMinutes: 60 })).toEqual({ opensAt: '2026-10-21T16:30:00.000Z', closesAt: '2026-10-21T20:00:00.000Z' });
    expect(terminalCheckInWindow(session, { beforeMinutes: 0, afterEndMinutes: 0 })).toEqual({ opensAt: session.startsAt, closesAt: session.endsAt });
  });
});
