import { DUTY_KIND_TEMPLATE } from '@forga/duty-officer-contracts';
import type { AccessReportFixture, SeedResult } from './fixture';

/** A week as duty officer with a note, paid per full day. */
export async function seedDutyOfficer(fx: AccessReportFixture): Promise<SeedResult> {
  const { post, put, ids } = fx;
  await put('/core/settings/duty-officer.general', { reportRequired: false, dutyKinds: DUTY_KIND_TEMPLATE }).expect(200);
  await post('/duty-officer/roster', { personId: ids.person, kind: 'duty-officer', from: '2026-10-05T05:00:00.000Z', to: '2026-10-12T05:00:00.000Z', notes: 'Tausch mit Vorwoche' }).expect(201);
  return { expect: ['Einsatzleiter vom Dienst (EvD)', '05.10.2026', 'Tausch mit Vorwoche', '70,00', '2026: 1 Dienste, 7 Tage'] };
}
