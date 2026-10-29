import type { AccessReportFixture, SeedResult } from './fixture';

/**
 * An incident with the member in the attack team under breathing apparatus, injured, and the other member in the same
 * crew; the member wrote the report. Street, house number and the injured party must not appear.
 */
export async function seedIncidents(fx: AccessReportFixture): Promise<SeedResult> {
  const { post, put, get, ids } = fx;
  const incident = (await post('/incidents/incidents', {
    dispatchNumber: '2026-204711',
    alarmKeyword: 'B2',
    alarmedAt: '2026-10-21T11:05:00.000Z',
    location: { street: 'Hauptstraße', houseNumber: '12', city: 'Musterstadt', district: 'Ahornfeld' },
    departmentIds: [ids.department],
  }).expect(201)).body as { reports: { id: string; departmentId: string | null }[] };
  const report = incident.reports.find((r) => r.departmentId === ids.department)!.id;
  const current = (await get(`/incidents/reports/${report}`).expect(200)).body;
  await put(`/incidents/reports/${report}`, {
    version: current.version,
    authorPersonId: ids.person,
    times: { alarmedAt: '2026-10-21T11:05:00.000Z', returnedAt: '2026-10-21T13:40:00.000Z' },
    situation: 'Rauch aus Kellerfenster',
    actions: 'Innenangriff mit 1 C-Rohr',
    personnel: [
      { personId: ids.person, vehicleId: ids.vehicle, function: 'attack-team', breathingApparatus: true, breathingMinutes: 28, injured: true },
      { personId: ids.otherPerson, vehicleId: ids.vehicle },
    ],
    involvedParties: [{ role: 'injured-party', name: 'Gerda Geschädigt', street: 'Hauptstraße 12' }],
  }).expect(200);
  return {
    expect: ['21.10.2026', 'B2', 'Ahornfeld', 'Angriffstrupp', 'LF 20', '13:05–15:40', 'ja, 28 min', '2026: 1 Einsatz, 2,6 Stunden', 'Einsatzberichte, die Sie verfasst haben', 'Entwurf'],
    // Street of the incident and involved parties never appear; the member was injured.
    forbid: ['Hauptstraße', 'Gerda'],
    health: true,
  };
}
