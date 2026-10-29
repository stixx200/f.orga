import type { AccessReportFixture, SeedResult } from './fixture';

/**
 * The backup module keeps no data about members of its own: backups are copies of the whole database (with their own
 * retention), and who started a backup or restore is in the audit log of the account.
 */
export async function seedBackup(fx: AccessReportFixture): Promise<SeedResult> {
  void fx;
  return { expect: [], sections: [] };
}
