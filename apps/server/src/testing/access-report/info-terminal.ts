import type { AccessReportFixture, SeedResult } from './fixture';

/**
 * The info terminal stores no data about members itself: its bookings are attendances of sessions and personnel of
 * incident reports, which appear in the sections of those modules. No section of its own.
 */
export async function seedInfoTerminal(fx: AccessReportFixture): Promise<SeedResult> {
  void fx;
  return { expect: [], sections: [] };
}
