import { CompensationSettings, SAMPLE_STATUTE } from '@forga/compensation-contracts';
import type { AccessReportFixture, SeedResult } from './fixture';

/** A manual item with reason, taken into a closed run, and a function with allowance of the member. */
export async function seedCompensation(fx: AccessReportFixture): Promise<SeedResult> {
  const { post, put, get, ids } = fx;
  const empty = CompensationSettings.parse((await get('/core/settings/compensation.general').expect(200)).body ?? {});
  await put('/core/settings/compensation.general', { ...empty, ...SAMPLE_STATUTE }).expect(200);
  await post('/compensation/items', { personId: ids.person, kind: 'expenses', date: '2025-06-02', label: 'Fahrtkosten Lehrgang', amount: 23.4, reason: 'Beleg liegt vor' }).expect(201);
  await post('/compensation/functions', { personId: ids.person, functionKey: 'command-group-leader', from: '2025-01-01' }).expect(201);
  const run = (await post('/compensation/runs', { from: '2025-06-01', to: '2025-06-30' }).expect(201)).body;
  await post(`/compensation/runs/${run.id}/close`, { acceptMissingIban: true }).expect(200);
  return { expect: ['Fahrtkosten Lehrgang', 'Auslagen', '23,40', 'Beleg liegt vor', 'Leiter Führungsgruppe', 'abgeschlossen', '2025: 1 Posten'] };
}
