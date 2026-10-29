import type { AccessReportFixture, SeedResult } from './fixture';

/** A jacket issued and held, gloves handed out and cancelled with a reason, and the member's sizes. */
export async function seedClothing(fx: AccessReportFixture): Promise<SeedResult> {
  const { post, put, ids } = fx;
  await post('/clothing/articles/template', {}).expect(201);
  const jacket = (await post('/clothing/items', { articleKey: 'jacket', inventoryNumber: 'J-4711', size: '52', departmentId: ids.department }).expect(201)).body.id as string;
  await post(`/clothing/items/${jacket}/issue`, { personId: ids.person, date: '2026-02-01', notes: 'Erstausstattung' }).expect(200);
  const gloves = (await post('/clothing/consumables', { personId: ids.person, articleKey: 'gloves', size: '9', quantity: 2, date: '2026-02-01' }).expect(201)).body.id as string;
  await post(`/clothing/issues/${gloves}/cancel`, { reason: 'Falsche Größe erfasst' }).expect(200);
  await put(`/clothing/persons/${ids.person}/sizes`, { sizes: { jacket: '52', boots: '43' } }).expect(200);
  return { expect: ['J-4711', 'Erstausstattung', 'Ausgabe', 'Grund der Stornierung: Falsche Größe erfasst', 'Ihre Größen', '43'] };
}
