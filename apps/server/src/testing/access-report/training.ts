import type { AccessReportFixture, SeedResult } from './fixture';

const inDays = (days: number, hour: number) => new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + days, hour)).toISOString();

/** Attendance recorded by the commander, an excuse for a coming session because of illness (health data), and a session led by the member. */
export async function seedTraining(fx: AccessReportFixture): Promise<SeedResult> {
  const { post, put, ids } = fx;
  const session = (await post('/training/sessions', { type: 'exercise', title: 'Übung Löschangriff', startsAt: '2026-03-14T18:00:00.000Z', endsAt: '2026-03-14T20:00:00.000Z', departmentIds: [ids.department], responsiblePersonId: ids.person }).expect(201)).body.id as string;
  const other = (await post('/training/sessions', { type: 'exercise', title: 'Übung Technische Hilfe', startsAt: inDays(10, 17), endsAt: inDays(10, 19), departmentIds: [ids.department] }).expect(201)).body.id as string;
  await put(`/training/sessions/${session}/attendance`, [
    { personId: ids.person, status: 'present', breathingApparatus: true, role: 'Truppführer' },
    { personId: ids.otherPerson, status: 'present' },
  ], fx.other).expect(200);
  await put(`/training/me/sessions/${other}/excuse`, { reason: 'sick', note: 'Erkältung' }, fx.member).expect(200);
  return { expect: ['Übung Löschangriff', 'Truppführer', 'entschuldigt, krank', 'Erkältung', 'verantwortlich'] };
}
