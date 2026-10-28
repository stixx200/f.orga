import { bookingWindow, TerminalBookingInput, windowOpen } from './terminal-booking.js';

const settings = { afterEndMinutes: 60, openEndHours: 6 };
const alarmedAt = '2026-10-21T11:00:00.000Z';
const at = (iso: string) => new Date(iso);

describe('booking window of a department report', () => {
  it('runs from the alarm until 60 minutes after the confirmed end', () => {
    const window = bookingWindow({ alarmedAt, returnedAt: '2026-10-21T13:00:00.000Z', endConfirmed: true }, settings);
    expect(window).toEqual({ opensAt: alarmedAt, closesAt: '2026-10-21T14:00:00.000Z' });
    expect(windowOpen(window, at('2026-10-21T10:59:59.000Z'))).toBe(false);
    expect(windowOpen(window, at(alarmedAt))).toBe(true);
    expect(windowOpen(window, at('2026-10-21T14:00:00.000Z'))).toBe(true);
    expect(windowOpen(window, at('2026-10-21T14:00:01.000Z'))).toBe(false);
  });

  it('runs 6 hours from the alarm while the end is not confirmed, whatever the default end says', () => {
    const window = bookingWindow({ alarmedAt, returnedAt: '2026-10-21T12:00:00.000Z', endConfirmed: false }, settings);
    expect(window.closesAt).toBe('2026-10-21T17:00:00.000Z');
    expect(windowOpen(window, at('2026-10-21T16:30:00.000Z'))).toBe(true);
    expect(windowOpen(window, at('2026-10-21T17:00:01.000Z'))).toBe(false);
  });

  it('closes earlier once the author confirms an early end, and later for a long incident', () => {
    expect(bookingWindow({ alarmedAt, returnedAt: '2026-10-21T11:30:00.000Z', endConfirmed: true }, settings).closesAt).toBe('2026-10-21T12:30:00.000Z');
    expect(bookingWindow({ alarmedAt, returnedAt: '2026-10-21T20:00:00.000Z', endConfirmed: true }, settings).closesAt).toBe('2026-10-21T21:00:00.000Z');
  });

  it('follows the settings of the module', () => {
    expect(bookingWindow({ alarmedAt, returnedAt: alarmedAt, endConfirmed: true }, { afterEndMinutes: 15, openEndHours: 2 }).closesAt).toBe('2026-10-21T11:15:00.000Z');
    expect(bookingWindow({ alarmedAt, returnedAt: alarmedAt, endConfirmed: false }, { afterEndMinutes: 15, openEndHours: 2 }).closesAt).toBe('2026-10-21T13:00:00.000Z');
  });
});

describe('booking input', () => {
  const personId = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
  const vehicleId = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c';

  it('needs either a vehicle or standby', () => {
    expect(TerminalBookingInput.safeParse({ personId, vehicleId }).success).toBe(true);
    expect(TerminalBookingInput.safeParse({ personId, standby: true }).success).toBe(true);
    expect(TerminalBookingInput.safeParse({ personId }).success).toBe(false);
    expect(TerminalBookingInput.safeParse({ personId, vehicleId, standby: true }).success).toBe(false);
  });
});
