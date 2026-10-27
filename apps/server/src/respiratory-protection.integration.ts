import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DomainEvents, MailService } from '@forga/core-api';
import { INCIDENTS_EVENTS, type ReportReleasedEvent } from '@forga/incidents-contracts';
import { RESPIRATORY_PROTECTION_EVENTS, type StatusChangedEvent } from '@forga/respiratory-protection-contracts';
import { setUp, startTestApp, type TestApp, UI } from './testing/test-app';

let test: TestApp;
let admin: string;
let leader: string;
let officer: string;
let commander: string;
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
  // A veteran with the qualification does not count as wearer.
  const veterans = (await post('/masterdata/departments', { name: 'Altersabteilung Musterstadt', shortName: 'Alters Musterstadt', type: 'veterans', parentId: ids.musterstadt }).expect(201)).body.id;
  ids.vera = (await post('/masterdata/persons', { firstName: 'Vera', lastName: 'Test', status: 'veterans', birthDate: '1960-05-05', memberships: [{ departmentId: veterans, from: '2000-01-01', primary: true }] }).expect(201)).body.id;
  await post(`/masterdata/persons/${ids.vera}/qualifications`, { qualification: 'breathing-apparatus', acquiredOn: '2000-06-01' }).expect(201);

  const roles = (await get('/core/roles')).body as { id: string; templateKey: string }[];
  const role = (key: string) => roles.find((r) => r.templateKey === key)!.id;
  await post('/core/users', { username: 'gf.musterstadt', displayName: 'GF Musterstadt', password: 'auch-sehr-geheim', personId: ids.max, roles: [{ roleId: role('group-leader'), departmentId: ids.musterstadt }] }).expect(201);
  await post('/core/users', { username: 'agw', displayName: 'AGW', email: 'agw@example.org', password: 'auch-sehr-geheim', roles: [{ roleId: role('breathing-apparatus-officer'), departmentId: null }] }).expect(201);
  // Department commander: records evidence (deadlines), may not see examinations.
  await post('/core/users', { username: 'abtkdt', displayName: 'Abteilungskommandant', password: 'auch-sehr-geheim', roles: [{ roleId: role('department-commander'), departmentId: ids.musterstadt }] }).expect(201);
  leader = await test.login({ username: 'gf.musterstadt', password: 'auch-sehr-geheim' });
  commander = await test.login({ username: 'abtkdt', password: 'auch-sehr-geheim' });
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
    const examination = { personId: ids.jonas, kind: 'examination', date: daysAgo(200), validUntil: daysAgo(-500), restrictions: 'nur bis 5 kg', result: 'no-concerns-conditional' };
    await post('/respiratory-protection/evidence', examination, leader).expect(403);
    // The result is required; "valid until" lies after the date and within the interval of the rule (36 months at 31).
    expect((await post('/respiratory-protection/evidence', { ...examination, result: null }, officer).expect(400)).body.code).toBe('respiratory-protection.resultRequired');
    expect((await post('/respiratory-protection/evidence', { ...examination, validUntil: daysAgo(200) }, officer).expect(400)).body.code).toBe('respiratory-protection.validUntilNotAfterDate');
    expect((await post('/respiratory-protection/evidence', { ...examination, validUntil: daysAgo(-1200) }, officer).expect(400)).body.code).toBe('respiratory-protection.validUntilTooLate');
    expect((await post('/respiratory-protection/evidence', { ...examination, result: 'no-concerns-limited', validUntil: null }, officer).expect(400)).body.code).toBe('respiratory-protection.validUntilRequired');
    const exam = await post('/respiratory-protection/evidence', examination, officer).expect(201);
    ids.exam = exam.body.id;
    const seenByLeader = (await get(`/respiratory-protection/persons/${ids.jonas}`, leader).expect(200)).body;
    expect(seenByLeader.evidence).toEqual([]);
    expect(seenByLeader.status.conditions[0]).toMatchObject({ key: 'examination', met: true });
    const seenByOfficer = (await get(`/respiratory-protection/persons/${ids.jonas}`, officer).expect(200)).body;
    expect(seenByOfficer.evidence[0]).toMatchObject({ kind: 'examination', restrictions: 'nur bis 5 kg', source: 'manual', result: 'no-concerns-conditional' });
    // The history of an examination is health data: only for those allowed to see examinations.
    await get(`/core/history/respiratory_protection.evidence/${ids.exam}`, leader).expect(404);
    await get(`/core/history/respiratory_protection.evidence/${ids.exam}`, officer).expect(200);
  });

  it('takes over records of closed training sessions and real incidents', async () => {
    await post('/respiratory-protection/evidence/quick', { kind: 'briefing', date: daysAgo(30), entries: [{ personId: ids.jonas }] }, officer).expect(201);
    // A stress exercise below the minimum work (80 kJ at 31) cannot be recorded as passed.
    const weak = await post('/respiratory-protection/evidence/quick', { kind: 'stress-exercise', date: daysAgo(30), entries: [{ personId: ids.jonas, kilojoules: 70, passed: true }] }, officer).expect(400);
    expect(weak.body).toMatchObject({ code: 'respiratory-protection.belowMinimum', minimum: 80 });
    await post('/respiratory-protection/evidence', { personId: ids.jonas, kind: 'stress-exercise', date: daysAgo(30), kilojoules: 70, passed: true }, officer).expect(400);
    expect((await get('/respiratory-protection/status', officer)).body.find((s: { personId: string }) => s.personId === ids.jonas)).toMatchObject({ minimumKilojoules: 80 });

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
      reportId: '01a16846-0000-7000-8000-000000000001', incidentId: '01a16846-0000-7000-8000-000000000002', departmentId: ids.musterstadt, unit: null, level: 'compensation', alarmedAt: at(-60 * 24 * 3),
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
    expect(view.evidence.find((e: { kind: string }) => e.kind === 'incident')).toMatchObject({ device: 'compressed-air', source: 'incidents', sourceId: event.reportId, note: 'B2 · Nr. 2026-1' });
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

  it('shows concerns only to those allowed to see examinations and does not lose the e-mail when sending fails', async () => {
    const mail = test.app.get(MailService);
    const sent = mail.sent.length;
    const send = mail.send.bind(mail);
    mail.send = () => Promise.reject(new Error('mail server down'));
    const concerns = (await post('/respiratory-protection/evidence', { personId: ids.jonas, kind: 'examination', date: daysAgo(1), result: 'concerns' }, officer).expect(201)).body;
    mail.send = send;
    expect(await color(ids.jonas, officer)).toBe('red');
    const officerView = (await get(`/respiratory-protection/persons/${ids.jonas}`, officer)).body.status.conditions[0];
    expect(officerView).toMatchObject({ key: 'examination', met: false, concerns: true });
    const leaderView = (await get(`/respiratory-protection/persons/${ids.jonas}`, leader)).body.status.conditions[0];
    expect(leaderView).toEqual({ key: 'examination', met: false, lastDate: null, dueOn: null });
    // Neither the next due date nor the deadline of the department commander shows the date of the examination.
    expect((await get(`/respiratory-protection/persons/${ids.jonas}`, leader)).body.status.nextDue).not.toBe(daysAgo(1));
    const tasks = (await get(`/core/tasks?asOf=${today}`, commander).expect(200)).body as { kind: string; subject: { id: string }; dueOn: string; title: { de: string }; to?: string }[];
    const examinationTask = tasks.find((t) => t.kind === 'breathing-apparatus-examination' && t.subject.id === ids.jonas);
    expect(examinationTask).toMatchObject({ dueOn: today, title: { de: 'Eignungsuntersuchung erforderlich' }, to: `/masterdata/persons/${ids.jonas}?tab=respiratory-protection` });
    expect(mail.sent).toHaveLength(sent);
    // The next check of the person sends the pending e-mail.
    const briefing = (await post('/respiratory-protection/evidence', { personId: ids.jonas, kind: 'briefing', date: daysAgo(5) }, officer).expect(201)).body;
    expect(mail.sent.slice(sent)).toEqual([expect.objectContaining({ to: 'agw@example.org', subject: 'Atemschutz: Jonas Test ist nicht mehr einsatzbereit' })]);
    await del(`/respiratory-protection/evidence/${briefing.id}`, officer).expect(204);
    await del(`/respiratory-protection/evidence/${concerns.id}`, officer).expect(204);
    expect(await color(ids.jonas, officer)).toBe('green');
    expect(mail.sent).toHaveLength(sent + 1);
  });

  it('requires the work of a stress exercise and refuses evidence in the future', async () => {
    // Passed without kJ does not count unless the note gives the reason it was not measured.
    const unmeasured = { personId: ids.jonas, kind: 'stress-exercise', date: daysAgo(4), passed: true };
    expect((await post('/respiratory-protection/evidence', unmeasured, officer).expect(400)).body.code).toBe('respiratory-protection.kilojoulesRequired');
    const reasoned = (await post('/respiratory-protection/evidence', { ...unmeasured, note: 'ohne Messung: Anlage defekt' }, officer).expect(201)).body.id;
    await del(`/respiratory-protection/evidence/${reasoned}`, officer).expect(204);
    expect((await post('/respiratory-protection/evidence/quick', { kind: 'stress-exercise', date: daysAgo(4), entries: [{ personId: ids.jonas, passed: true }] }, officer).expect(400)).body.code).toBe('respiratory-protection.kilojoulesRequired');
    // Not in the future: single, quick entry and import.
    expect((await post('/respiratory-protection/evidence', { personId: ids.jonas, kind: 'briefing', date: daysAgo(-1) }, officer).expect(400)).body.code).toBe('respiratory-protection.dateInFuture');
    expect((await post('/respiratory-protection/evidence/quick', { kind: 'briefing', date: daysAgo(-1), entries: [{ personId: ids.jonas }] }, officer).expect(400)).body.code).toBe('respiratory-protection.dateInFuture');
    const future = `Name;Datum;kJ\nJonas Test;${daysAgo(-3).split('-').toReversed().join('.')};95\n`;
    const upload = await test.http.post('/api/core/imports').set('Cookie', officer).set(UI).attach('file', Buffer.from(future, 'utf8'), 'zukunft.csv').expect(201);
    const result = await post(`/core/imports/${upload.body.id}/preview`, { profile: 'respiratory-protection.stress-exercises', mapping: upload.body.suggestions['respiratory-protection.stress-exercises'] }, officer).expect(200);
    expect(result.body.rows[0].messages[0].code).toBe('respiratory-protection.dateInFuture');
  });

  it('counts only active members and members on probation as wearers', async () => {
    expect(((await get('/respiratory-protection/status', officer)).body as { personId: string }[]).map((s) => s.personId)).not.toContain(ids.vera);
    await post('/respiratory-protection/evidence', { personId: ids.vera, kind: 'briefing', date: daysAgo(3) }, officer).expect(201);
    // No traffic light change (no red e-mail) and no deadlines for the veteran.
    expect(changes.some((c) => c.personId === ids.vera)).toBe(false);
    const tasks = (await get(`/core/tasks?asOf=${today}`, officer).expect(200)).body as { subject: { id: string } }[];
    expect(tasks.some((t) => t.subject.id === ids.vera)).toBe(false);
  });

  it('applies the configurable rule; the officer may change it', async () => {
    await put('/core/settings/respiratory-protection.rule', { briefing: false, exercise: false, stressExercise: false, leadDays: 30 }, leader).expect(403);
    await put('/core/settings/respiratory-protection.rule', { briefing: false, exercise: false, stressExercise: false, leadDays: 30 }, officer).expect(200);
    const lena = (await get(`/respiratory-protection/persons/${ids.lena}`, officer)).body.status;
    expect(lena.conditions.map((c: { key: string }) => c.key)).toEqual(['examination']);
    // Lena is over 50: an examination without "valid until" is valid 12 months.
    await post('/respiratory-protection/evidence', { personId: ids.lena, kind: 'examination', date: daysAgo(350), result: 'no-concerns' }, officer).expect(201);
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
    // The examination deadline goes to those who record evidence, like the other conditions (no results in it).
    expect(tasks.some((t) => t.kind === 'breathing-apparatus-examination')).toBe(true);

    const csv = 'Name;Datum;gültig bis;Einschränkungen;Ergebnis\nLena Test;01.02.2026;31.01.2027;;keine Bedenken\nUnbekannt Niemand;01.02.2026;;;\nJonas Test;01.03.2026;28.02.2026;;\nJonas Test;02.03.2026;;;tauglich\n';
    const upload = await test.http.post('/api/core/imports').set('Cookie', officer).set(UI).attach('file', Buffer.from(csv, 'utf8'), 'g26.csv').expect(201);
    const mapping = upload.body.suggestions['respiratory-protection.examinations'];
    expect(mapping).toMatchObject({ personName: 'Name', date: 'Datum', validUntil: 'gültig bis', result: 'Ergebnis' });
    const applied = await post(`/core/imports/${upload.body.id}/apply`, { profile: 'respiratory-protection.examinations', mapping }, officer).expect(200);
    // Unknown person, "valid until" before the date, unknown result.
    expect(applied.body.counts).toMatchObject({ create: 1, error: 3 });
    const examined = (await get(`/respiratory-protection/persons/${ids.lena}`, officer)).body.evidence.find((e: { kind: string; date: string }) => e.kind === 'examination' && e.date === '2026-02-01');
    expect(examined).toMatchObject({ result: 'no-concerns', source: 'import' });

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
