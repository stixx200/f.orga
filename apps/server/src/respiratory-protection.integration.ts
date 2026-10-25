import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DomainEvents, MailService } from '@forga/core-api';
import { INCIDENTS_EVENTS, type ReportReleasedEvent } from '@forga/incidents-contracts';
import { RESPIRATORY_PROTECTION_EVENTS, type StatusChangedEvent } from '@forga/respiratory-protection-contracts';
import { setUp, startTestApp, type TestApp, UI } from './testing/test-app';

let test: TestApp;
let admin: string;
let leader: string;
let officer: string;
const ids: Record<string, string> = {};
const changes: StatusChangedEvent[] = [];

const post = (path: string, body: unknown, cookie = admin) => test.http.post(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const put = (path: string, body: unknown, cookie = admin) => test.http.put(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const del = (path: string, cookie = admin) => test.http.delete(`/api${path}`).set('Cookie', cookie).set(UI);
const get = (path: string, cookie = admin) => test.http.get(`/api${path}`).set('Cookie', cookie);
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
const at = (offsetMinutes: number) => new Date(Date.now() + offsetMinutes * 60_000).toISOString();
const color = async (personId: string, cookie = admin) => (await get(`/respiratory-protection/persons/${personId}`, cookie).expect(200)).body.status.color as string;

beforeAll(async () => {
  test = await startTestApp();
  admin = await setUp(test);
  test.app.get(DomainEvents).subscribe<StatusChangedEvent>(RESPIRATORY_PROTECTION_EVENTS.statusChanged, (e) => {
    changes.push(e);
  });
  await post('/masterdata/catalog/templates/bw', {}).expect(201);
  await post('/training/types/templates/bw', {}).expect(201);
  ids.musterstadt = (await post('/masterdata/departments', { name: 'Abteilung Musterstadt', shortName: 'Musterstadt', type: 'operational' }).expect(201)).body.id;
  ids.ahornfeld = (await post('/masterdata/departments', { name: 'Abteilung Ahornfeld', shortName: 'Ahornfeld', type: 'operational' }).expect(201)).body.id;
  const person = async (firstName: string, departmentId: string, birthDate: string, wearer = true) => {
    const id = (await post('/masterdata/persons', { firstName, lastName: 'Test', status: 'active', birthDate, memberships: [{ departmentId, from: '2020-01-01', primary: true }] }).expect(201)).body.id as string;
    if (wearer) await post(`/masterdata/persons/${id}/qualifications`, { qualification: 'breathing-apparatus', acquiredOn: '2020-06-01' }).expect(201);
    return id;
  };
  ids.jonas = await person('Jonas', ids.musterstadt, '1995-03-01');
  ids.max = await person('Max', ids.musterstadt, '1990-07-15', false);
  ids.lena = await person('Lena', ids.ahornfeld, '1970-01-20');

  const roles = (await get('/core/roles')).body as { id: string; templateKey: string }[];
  const role = (key: string) => roles.find((r) => r.templateKey === key)!.id;
  await post('/core/users', { username: 'gf.musterstadt', displayName: 'GF Musterstadt', password: 'auch-sehr-geheim', personId: ids.max, roles: [{ roleId: role('group-leader'), departmentId: ids.musterstadt }] }).expect(201);
  await post('/core/users', { username: 'agw', displayName: 'AGW', email: 'agw@example.org', password: 'auch-sehr-geheim', roles: [{ roleId: role('breathing-apparatus-officer'), departmentId: null }] }).expect(201);
  leader = await test.login({ username: 'gf.musterstadt', password: 'auch-sehr-geheim' });
  officer = await test.login({ username: 'agw', password: 'auch-sehr-geheim' });
});

afterAll(() => test?.app.close());

describe('respiratory protection', () => {
  it('lists the wearers of the visible departments with a red light at first', async () => {
    const all = (await get('/respiratory-protection/status', officer).expect(200)).body as { personId: string; color: string; conditions: { key: string; met: boolean }[] }[];
    expect(all.map((s) => s.personId).toSorted()).toEqual([ids.jonas, ids.lena].toSorted());
    expect(all.every((s) => s.color === 'red')).toBe(true);
    expect(all[0].conditions.map((c) => c.key)).toEqual(['examination', 'briefing', 'stress-exercise', 'exercise']);
    const own = (await get('/respiratory-protection/status', leader).expect(200)).body as { personId: string }[];
    expect(own.map((s) => s.personId)).toEqual([ids.jonas]);
    expect(await color(ids.max)).toBe('grey');
  });

  it('keeps examinations to those allowed to see health data', async () => {
    await post('/respiratory-protection/evidence', { personId: ids.jonas, kind: 'examination', date: daysAgo(200), validUntil: daysAgo(-500), restrictions: 'nur bis 5 kg' }, leader).expect(403);
    const exam = await post('/respiratory-protection/evidence', { personId: ids.jonas, kind: 'examination', date: daysAgo(200), validUntil: daysAgo(-500), restrictions: 'nur bis 5 kg' }, officer).expect(201);
    ids.exam = exam.body.id;
    const seenByLeader = (await get(`/respiratory-protection/persons/${ids.jonas}`, leader).expect(200)).body;
    expect(seenByLeader.evidence).toEqual([]);
    expect(seenByLeader.status.conditions[0]).toMatchObject({ key: 'examination', met: true });
    const seenByOfficer = (await get(`/respiratory-protection/persons/${ids.jonas}`, officer).expect(200)).body;
    expect(seenByOfficer.evidence[0]).toMatchObject({ kind: 'examination', restrictions: 'nur bis 5 kg', source: 'manual' });
    // The history of an examination is health data: only for those allowed to see examinations.
    await get(`/core/history/respiratory_protection.evidence/${ids.exam}`, leader).expect(404);
    await get(`/core/history/respiratory_protection.evidence/${ids.exam}`, officer).expect(200);
  });

  it('takes over records of closed training sessions and real incidents', async () => {
    await post('/respiratory-protection/evidence/quick', { kind: 'briefing', date: daysAgo(30), entries: [{ personId: ids.jonas }] }, officer).expect(201);

    // Stress exercise in the training module.
    const session = (await post('/training/sessions', { type: 'stress-exercise', title: 'Übungsstrecke', startsAt: at(-120), endsAt: at(-30), departmentIds: [ids.musterstadt] }).expect(201)).body.id;
    await put(`/training/sessions/${session}/attendance`, [{ personId: ids.jonas, status: 'present', kilojoules: 90, passed: true }]).expect(200);
    await post(`/training/sessions/${session}/close`, {}).expect(200);
    let view = (await get(`/respiratory-protection/persons/${ids.jonas}`, officer)).body;
    expect(view.evidence.find((e: { kind: string }) => e.kind === 'stress-exercise')).toMatchObject({ source: 'training', sourceId: session, kilojoules: 90, minutes: 90 });
    // Reopened sessions do not count until they are closed again.
    await post(`/training/sessions/${session}/reopen`, {}).expect(200);
    expect(((await get(`/respiratory-protection/persons/${ids.jonas}`, officer)).body.evidence as { kind: string }[]).some((e) => e.kind === 'stress-exercise')).toBe(false);
    await post(`/training/sessions/${session}/close`, {}).expect(200);
    view = (await get(`/respiratory-protection/persons/${ids.jonas}`, officer)).body;
    expect(view.status.color).toBe('red');

    // Released incident report with Jonas under breathing apparatus replaces the exercise.
    const event: ReportReleasedEvent = {
      reportId: '01a16846-0000-7000-8000-000000000001', incidentId: '01a16846-0000-7000-8000-000000000002', departmentId: ids.musterstadt, level: 'compensation', alarmedAt: at(-60 * 24 * 3),
      dispatchNumber: '2026-1', reportNumber: '2026-001', alarmKeyword: 'B2', compensationKind: 'incident',
      personnel: [
        { personId: ids.jonas, vehicleId: null, breathingApparatus: true, breathingMinutes: 25, chemicalSuit: true, breathingDevice: 'compressed-air', from: at(-60 * 24 * 3), to: at(-60 * 24 * 3 + 60), hours: 1, rate: 15, amount: 15, duringWorkingHours: false, lossOfEarnings: false },
        { personId: ids.max, vehicleId: null, breathingApparatus: false, breathingMinutes: null, chemicalSuit: false, breathingDevice: null, from: at(-60 * 24 * 3), to: at(-60 * 24 * 3 + 60), hours: 1, rate: 15, amount: 15, duringWorkingHours: false, lossOfEarnings: false },
      ],
      vehicleIds: [],
    };
    await test.app.get(DomainEvents).publish(INCIDENTS_EVENTS.reportReleased, event);
    await test.app.get(DomainEvents).publish(INCIDENTS_EVENTS.reportReleased, { ...event, level: 'billing' });
    view = (await get(`/respiratory-protection/persons/${ids.jonas}`, officer)).body;
    expect(view.evidence.filter((e: { kind: string }) => e.kind === 'incident')).toHaveLength(1);
    // In a chemical protective suit the incident also counts as chemical suit evidence.
    expect(view.evidence.filter((e: { kind: string; source: string }) => e.kind === 'chemical-suit' && e.source === 'incidents')).toHaveLength(1);
    // The device of the report goes into the record.
    expect(view.evidence.find((e: { kind: string }) => e.kind === 'incident')).toMatchObject({ device: 'compressed-air' });
    expect(view.status.color).toBe('green');
    expect(changes).toContainEqual({ personId: ids.jonas, previous: 'red', color: 'green' });

    // Unlocking the report withdraws the evidence.
    await test.app.get(DomainEvents).publish(INCIDENTS_EVENTS.reportUnlocked, { reportId: event.reportId, incidentId: event.incidentId, reason: 'Korrektur' });
    expect(await color(ids.jonas, officer)).toBe('red');
    await test.app.get(DomainEvents).publish(INCIDENTS_EVENTS.reportReleased, event);
    expect(await color(ids.jonas, officer)).toBe('green');
  });

  it('protects evidence of other modules and lets manual evidence be corrected', async () => {
    const view = (await get(`/respiratory-protection/persons/${ids.jonas}`, officer)).body;
    const fromTraining = view.evidence.find((e: { source: string }) => e.source === 'training');
    await del(`/respiratory-protection/evidence/${fromTraining.id}`, officer).expect(400);
    const briefing = view.evidence.find((e: { kind: string }) => e.kind === 'briefing');
    await put(`/respiratory-protection/evidence/${briefing.id}`, { personId: ids.jonas, kind: 'briefing', date: daysAgo(400) }, officer).expect(200);
    expect(await color(ids.jonas, officer)).toBe('red');
    // The officer (brigade-wide) is told by e-mail.
    const mail = test.app.get(MailService).sent.at(-1)!;
    expect(mail).toMatchObject({ to: 'agw@example.org', subject: 'Atemschutz: Jonas Test ist nicht mehr einsatzbereit' });
    await del(`/respiratory-protection/evidence/${briefing.id}`, officer).expect(204);
    await post('/respiratory-protection/evidence', { personId: ids.jonas, kind: 'briefing', date: daysAgo(10) }, admin).expect(201);
    expect(await color(ids.jonas, officer)).toBe('green');
  });

  it('applies the configurable rule; the officer may change it', async () => {
    await put('/core/settings/respiratory-protection.rule', { briefing: false, exercise: false, stressExercise: false, leadDays: 30 }, leader).expect(403);
    await put('/core/settings/respiratory-protection.rule', { briefing: false, exercise: false, stressExercise: false, leadDays: 30 }, officer).expect(200);
    const lena = (await get(`/respiratory-protection/persons/${ids.lena}`, officer)).body.status;
    expect(lena.conditions.map((c: { key: string }) => c.key)).toEqual(['examination']);
    // Lena is over 50: an examination without "valid until" is valid 12 months.
    await post('/respiratory-protection/evidence', { personId: ids.lena, kind: 'examination', date: daysAgo(350) }, officer).expect(201);
    const after = (await get(`/respiratory-protection/persons/${ids.lena}`, officer)).body.status;
    expect(after).toMatchObject({ color: 'yellow' });
    await put('/core/settings/respiratory-protection.rule', {}, officer).expect(200);
  });

  it('records runs of the breathing apparatus track with the work and duration of the rule', async () => {
    await put('/core/settings/respiratory-protection.rule', { trackKilojoules: 90, trackMinutes: 25 }, officer).expect(200);
    const [run] = (await post('/respiratory-protection/evidence/quick', { kind: 'training-track', date: daysAgo(3), facility: 'Strecke Kreisstadt', entries: [{ personId: ids.jonas, passed: true }] }, officer).expect(201)).body;
    expect(run).toMatchObject({ kind: 'training-track', kilojoules: 90, minutes: 25, passed: true, facility: 'Strecke Kreisstadt' });
    const single = (await post('/respiratory-protection/evidence', { personId: ids.jonas, kind: 'training-track', date: daysAgo(2), passed: true }, officer).expect(201)).body;
    expect(single).toMatchObject({ kilojoules: 90, minutes: 25 });
    const status = (await get(`/respiratory-protection/persons/${ids.jonas}`, officer)).body.status;
    expect(status.conditions.find((c: { key: string }) => c.key === 'stress-exercise')).toMatchObject({ met: true });
    await put('/core/settings/respiratory-protection.rule', {}, officer).expect(200);
  });

  it('offers lists, deadlines and the examination import', async () => {
    const fitness = (await get('/core/lists/respiratory-protection.fitness', officer).expect(200)).body;
    expect(fitness.rows).toHaveLength(2);
    const record = (await get(`/core/lists/respiratory-protection.record?personId=${ids.jonas}`, officer).expect(200)).body;
    expect(record.rows.map((r: { kind: string }) => r.kind)).toEqual(expect.arrayContaining(['Eignungsuntersuchung', 'Belastungsübung', 'Einsatz']));
    const minutes = (await get('/core/lists/respiratory-protection.minutes', officer).expect(200)).body;
    const missing = (await get('/core/lists/respiratory-protection.missing-this-year', officer).expect(200)).body;
    // Jonas has all yearly evidence; Lena has none this year.
    expect(missing.rows.map((r: { name: string }) => r.name)).toEqual(['Test, Lena']);
    expect(missing.rows[0]).toMatchObject({ briefing: 'fehlt', stress: 'fehlt', exercise: 'fehlt' });
    expect(minutes.rows.find((r: { name: string }) => r.name === 'Test, Jonas')).toMatchObject({ incidents: 1, incidentMinutes: 25 });

    const tasks = (await get(`/core/tasks?asOf=${today}`, officer).expect(200)).body as { kind: string }[];
    expect(tasks.some((t) => t.kind.startsWith('breathing-apparatus-'))).toBe(true);

    const csv = 'Name;Datum;gültig bis;Einschränkungen\nLena Test;01.02.2026;31.01.2027;\nUnbekannt Niemand;01.02.2026;;\n';
    const upload = await test.http.post('/api/core/imports').set('Cookie', officer).set(UI).attach('file', Buffer.from(csv, 'utf8'), 'g26.csv').expect(201);
    const mapping = upload.body.suggestions['respiratory-protection.examinations'];
    expect(mapping).toMatchObject({ personName: 'Name', date: 'Datum', validUntil: 'gültig bis' });
    const applied = await post(`/core/imports/${upload.body.id}/apply`, { profile: 'respiratory-protection.examinations', mapping }, officer).expect(200);
    expect(applied.body.counts).toMatchObject({ create: 1, error: 1 });

    // Stress exercises from a training facility: kJ decide by the rule, "passed" overrides.
    const facility = 'Teilnehmer;Datum;kJ;Anlage\nLena Test;03.02.2026;65;Übungsstrecke Kreisstadt\nJonas Test;03.02.2026;abc;Übungsstrecke Kreisstadt\nLena Test;04.02.2026;;Übungsstrecke Kreisstadt\n';
    const runs = await test.http.post('/api/core/imports').set('Cookie', officer).set(UI).attach('file', Buffer.from(facility, 'utf8'), 'strecke.csv').expect(201);
    const runMapping = runs.body.suggestions['respiratory-protection.stress-exercises'];
    expect(runMapping).toMatchObject({ personName: 'Teilnehmer', date: 'Datum', kilojoules: 'kJ', facility: 'Anlage' });
    const imported = await post(`/core/imports/${runs.body.id}/apply`, { profile: 'respiratory-protection.stress-exercises', mapping: runMapping }, officer).expect(200);
    expect(imported.body.counts).toMatchObject({ create: 1, error: 2 });
    const lena = (await get(`/respiratory-protection/persons/${ids.lena}`, officer)).body.evidence.find((e: { kind: string; date: string }) => e.kind === 'stress-exercise' && e.date === '2026-02-03');
    expect(lena).toMatchObject({ kilojoules: 65, facility: 'Übungsstrecke Kreisstadt', source: 'import' });
  });
});
