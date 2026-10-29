import { VWV_2022_RULES } from '@forga/promotions-contracts';
import type { AccessReportFixture, SeedResult } from './fixture';

/** An exclusion with reason (internal assessment) and the member's entry in a promotion list with a comment. */
export async function seedPromotions(fx: AccessReportFixture): Promise<SeedResult> {
  const { post, put, get, ids } = fx;
  await put('/core/settings/promotions.general', { rules: VWV_2022_RULES, previewMonths: 3 }).expect(200);
  await post('/promotions/exclusions', { personId: ids.person, from: '2024-01-01', until: '2024-12-31', reason: 'Probezeit verlängert' }).expect(201);
  const list = (await post('/promotions/lists', { title: 'Hauptversammlung 2026', referenceDate: '2026-12-15', effectiveDate: '2026-12-20' }).expect(201)).body;
  const full = (await get(`/promotions/lists/${list.id}`).expect(200)).body as { version: number; entries: { personId: string }[] };
  if (full.entries.some((e) => e.personId === ids.person)) {
    await put(`/promotions/lists/${list.id}/entries/${ids.person}`, { decision: 'defer', comment: 'Erst nach Hospitation', version: full.version }).expect(200);
  } else {
    await post(`/promotions/lists/${list.id}/entries`, { personId: ids.person, targetRank: 'fm', comment: 'Erst nach Hospitation', version: full.version }).expect(201);
  }
  return { expect: ['Probezeit verlängert', 'Hauptversammlung 2026', 'Erst nach Hospitation'] };
}
