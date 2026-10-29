import type { AccessReportFixture, SeedResult } from './fixture';

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

/** A medical examination with restrictions (health data), a briefing and a stress exercise of the member. */
export async function seedRespiratoryProtection(fx: AccessReportFixture): Promise<SeedResult> {
  const { post, ids } = fx;
  await post('/respiratory-protection/evidence', {
    personId: ids.person,
    kind: 'examination',
    date: daysAgo(200),
    validUntil: daysAgo(-500),
    result: 'no-concerns-conditional',
    restrictions: 'nur mit Korrekturbrille',
    examiner: 'Arbeitsmedizin Musterstadt',
  }).expect(201);
  await post('/respiratory-protection/evidence/quick', { kind: 'briefing', date: daysAgo(30), entries: [{ personId: ids.person }] }).expect(201);
  await post('/respiratory-protection/evidence/quick', { kind: 'stress-exercise', date: daysAgo(40), entries: [{ personId: ids.person, kilojoules: 92, passed: true }] }).expect(201);
  return { expect: ['Eignungsuntersuchung', 'keine Bedenken unter Voraussetzungen', 'nur mit Korrekturbrille', 'Arbeitsmedizin Musterstadt', 'Unterweisung', 'Belastungsübung', '92 kJ', 'bestanden'] };
}
