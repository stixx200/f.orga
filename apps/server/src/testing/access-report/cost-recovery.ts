import type { AccessReportFixture, SeedResult } from './fixture';

/**
 * Cost recovery stores no data about members by reference (its notices name the persons liable for the costs, third
 * parties here); it has no section in the report.
 */
export async function seedCostRecovery(fx: AccessReportFixture): Promise<SeedResult> {
  void fx;
  return { expect: [], sections: [] };
}
