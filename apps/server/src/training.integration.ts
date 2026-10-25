import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Attachments, DomainEvents } from '@forga/core-api';
import { type SessionClosedEvent, TRAINING_EVENTS } from '@forga/training-contracts';
import { setUp, startTestApp, type TestApp, UI } from './testing/test-app';

let test: TestApp;
let admin: string;
let leader: string;
const ids: Record<string, string> = {};

const post = (path: string, body: unknown, cookie = admin) => test.http.post(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const put = (path: string, body: unknown, cookie = admin) => test.http.put(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const get = (path: string, cookie = admin) => test.http.get(`/api${path}`).set('Cookie', cookie);
const at = (offsetMinutes: number) => new Date(Date.now() + offsetMinutes * 60_000).toISOString();

beforeAll(async () => {
  test = await startTestApp();
  admin = await setUp(test);
  await post('/masterdata/catalog/templates/bw', {}).expect(201);
  await post('/training/types/templates/bw', {}).expect(201);
  ids.musterstadt = (await post('/masterdata/departments', { name: 'Abteilung Musterstadt', shortName: 'Musterstadt', type: 'operational' }).expect(201)).body.id;
  ids.ahornfeld = (await post('/masterdata/departments', { name: 'Abteilung Ahornfeld', shortName: 'Ahornfeld', type: 'operational' }).expect(201)).body.id;
  const person = async (firstName: string, departmentId: string) =>
    (await post('/masterdata/persons', { firstName, lastName: 'Test', status: 'active', memberships: [{ departmentId, from: '2020-01-01', primary: true }] }).expect(201)).body.id as string;
  ids.jonas = await person('Jonas', ids.musterstadt);
  ids.max = await person('Max', ids.musterstadt);
  ids.lena = await person('Lena', ids.ahornfeld);

  const roles = (await get('/core/roles')).body as { id: string; templateKey: string }[];
  const groupLeader = roles.find((r) => r.templateKey === 'group-leader')!.id;
  await post('/core/users', { username: 'gf.musterstadt', displayName: 'GF Musterstadt', password: 'auch-sehr-geheim', personId: ids.max, roles: [{ roleId: groupLeader, departmentId: ids.musterstadt }] }).expect(201);
  leader = await test.login({ username: 'gf.musterstadt', password: 'auch-sehr-geheim' });
});

afterAll(() => test?.app.close());

describe('training sessions', () => {
  it('plans sessions and series per department', async () => {
    const session = await post('/training/sessions', {
      type: 'stress-exercise', title: 'Übungsstrecke', startsAt: at(-10), endsAt: at(110), departmentIds: [ids.musterstadt], instructorIds: [ids.jonas], topic: 'Belastungsübung',
    }).expect(201);
    ids.session = session.body.id;
    expect(session.body).toMatchObject({ status: 'planned', overlaps: [] });

    await post('/training/sessions', { type: 'exercise', title: 'Nicht erlaubt', startsAt: at(0), endsAt: at(60), departmentIds: [ids.musterstadt] }, leader).expect(403);
    await post('/training/sessions', { type: 'gibt-es-nicht', title: 'X', startsAt: at(0), endsAt: at(60), departmentIds: [ids.musterstadt] }).expect(400);

    const series = await post('/training/sessions/series', {
      session: { type: 'exercise', title: 'Übungsabend', startsAt: '2026-11-06T18:00:00Z', endsAt: '2026-11-06T20:00:00Z', departmentIds: [ids.ahornfeld] },
      intervalWeeks: 2,
      until: '2026-12-31',
    }).expect(201);
    expect(series.body).toHaveLength(4);
    expect((await get('/training/sessions?from=2026-11-01&to=2026-12-31', leader)).body).toHaveLength(0);
  });

  it('copies the sessions of a period 52 weeks later, once', async () => {
    const copied = await post('/training/sessions/copy', { from: '2026-11-01', to: '2026-12-31', weeks: 52, departmentId: ids.ahornfeld }).expect(200);
    expect(copied.body).toEqual({ created: 4, skipped: 0 });
    const next = (await get('/training/sessions?from=2027-11-01&to=2027-12-31')).body as { title: string; startsAt: string; status: string; attendance: unknown[] }[];
    expect(next).toHaveLength(4);
    // Same weekday and local time (Friday, 19:00 Berlin).
    expect(next[0]).toMatchObject({ title: 'Übungsabend', startsAt: '2027-11-05T18:00:00.000Z', status: 'planned', attendance: [] });
    expect((await post('/training/sessions/copy', { from: '2026-11-01', to: '2026-12-31', weeks: 52, departmentId: ids.ahornfeld }).expect(200)).body).toEqual({ created: 0, skipped: 4 });
    // The schedule of 2027 lists the copies with weekday and time.
    const schedule = (await get(`/core/lists/training.schedule?year=2027&departmentId=${ids.ahornfeld}`).expect(200)).body;
    expect(schedule.rows).toHaveLength(4);
    expect(schedule.rows[0]).toMatchObject({ date: 'Fr., 05.11.2027', time: '19:00 – 21:00', title: 'Übungsabend' });
    // Attachments of a session go with it when it is deleted.
    const copy = (await get('/training/sessions?from=2027-11-01&to=2027-11-30')).body[0].id as string;
    const pdf = Buffer.from('%PDF-1.4\n%Test\n');
    await test.http.post(`/api/core/attachments?type=training.session&id=${copy}`).set('Cookie', admin).set(UI).attach('file', pdf, { filename: 'Ablauf.pdf', contentType: 'application/pdf' }).expect(201);
    await get(`/core/attachments?type=training.session&id=${copy}`, leader).expect(404);
    await test.http.delete(`/api/training/sessions/${copy}`).set('Cookie', admin).set(UI).expect(204);
    expect(await test.app.get(Attachments).list('training.session', [copy])).toEqual([]);
    // Copying needs the planning permission.
    await post('/training/sessions/copy', { from: '2026-11-01', to: '2026-12-31', weeks: 1 }, leader).expect(403);
  });

  it('records attendance, closes the session and publishes the records', async () => {
    const events: SessionClosedEvent[] = [];
    test.app.get(DomainEvents).subscribe<SessionClosedEvent>(TRAINING_EVENTS.sessionClosed, (e) => {
      events.push(e);
    });
    const attended = await put(`/training/sessions/${ids.session}/attendance`, [
      { personId: ids.jonas, status: 'present', breathingApparatus: true, kilojoules: 85, passed: true },
      { personId: ids.max, status: 'excused' },
    ], leader).expect(200);
    expect(attended.body.status).toBe('held');
    await post(`/training/sessions/${ids.session}/close`, {}, leader).expect(403);

    const closed = await post(`/training/sessions/${ids.session}/close`, {}).expect(200);
    expect(closed.body).toMatchObject({ status: 'closed', closedBy: 'Admin' });
    expect(events[0]).toMatchObject({
      type: 'stress-exercise',
      compensation: 'training',
      records: [{ personId: ids.jonas, kind: 'stress-exercise', kilojoules: 85, passed: true }],
    });
    expect(events[0].attendances).toEqual([expect.objectContaining({ personId: ids.jonas, minutes: 120, breathingApparatus: true })]);
    await put(`/training/sessions/${ids.session}/attendance`, [], leader).expect(409);
    await post(`/training/sessions/${ids.session}/reopen`, {}).expect(200);

    const participation = (await get('/training/participation?from=2020-01-01&to=2030-12-31', leader)).body as { personId: string; present: number; excused: number; rate: number }[];
    expect(participation.find((p) => p.personId === ids.jonas)).toMatchObject({ present: 1, rate: 100 });
    expect(participation.find((p) => p.personId === ids.max)).toMatchObject({ present: 0, excused: 1 });
  });

  it('lets members check in with the QR code during the session', async () => {
    const code = (await get(`/training/sessions/${ids.session}/check-in`, leader).expect(200)).body.code as string;
    const checked = await post('/training/check-in', { code }, leader).expect(200);
    expect(checked.body).toMatchObject({ sessionId: ids.session });
    const session = (await get(`/training/sessions/${ids.session}`)).body;
    expect(session.attendance.find((a: { personId: string }) => a.personId === ids.max)).toMatchObject({ status: 'present' });
    expect(session.attendance.find((a: { personId: string }) => a.personId === ids.max)).toMatchObject({ confirmed: false });
    expect(session.attendance.find((a: { personId: string }) => a.personId === ids.max).checkedInAt).not.toBeNull();
    // An unconfirmed check-in blocks closing.
    expect((await post(`/training/sessions/${ids.session}/close`, {}).expect(409)).body).toMatchObject({ code: 'training.unconfirmedCheckIns', count: 1 });
    await post('/training/check-in', { code: 'falscher-code' }, leader).expect(404);
    await post('/training/check-in', { code }).expect(400);

    // Saving the list again keeps the check-in and updates the row in place.
    const saved = await put(`/training/sessions/${ids.session}/attendance`, [
      { personId: ids.jonas, status: 'present' },
      { personId: ids.max, status: 'present', breathingApparatus: true },
    ], leader).expect(200);
    const max = saved.body.attendance.find((a: { personId: string }) => a.personId === ids.max);
    expect(max).toMatchObject({ status: 'present', breathingApparatus: true, confirmed: true });
    expect(max.checkedInAt).not.toBeNull();
  });

  it('counts own forces injured in training sessions for the annual statistics (F26)', async () => {
    const year = new Date().getFullYear();
    const session = (await post('/training/sessions', { type: 'exercise', title: 'Leiterübung', startsAt: at(-180), endsAt: at(-60), departmentIds: [ids.musterstadt] }).expect(201)).body.id;
    await put(`/training/sessions/${session}/attendance`, [{ personId: ids.jonas, status: 'present', injured: true }]).expect(200);
    const before = (await get(`/incidents/statistics/${year}`).expect(200)).body.values as { question: string; source: string; value: number }[];
    expect(before.some((v) => v.question === 'F26' && v.source === 'training')).toBe(false);
    await post(`/training/sessions/${session}/close`, {}).expect(200);
    const after = (await get(`/incidents/statistics/${year}`).expect(200)).body.values as { question: string; source: string; value: number }[];
    expect(after.find((v) => v.question === 'F26')).toMatchObject({ source: 'training', value: 1 });
  });

  it('offers a calendar feed with a secret address', async () => {
    await get('/training/feed/egal.ics').expect(404);
    const snippets = [{ title: 'Sicherheit', text: 'Unfallverhütungsvorschriften beachten.' }];
    expect((await put('/core/settings/training.general', { checkInBeforeMinutes: 30, feedToken: 'geheim123', snippets }).expect(200)).body).toMatchObject({ snippets });
    // Everyone planning sessions reads the snippets.
    expect((await get('/core/settings/training.general', leader).expect(200)).body.snippets).toEqual(snippets);
    const feed = await test.http.get(`/api/training/feed/geheim123.ics?departmentId=${ids.ahornfeld}`).expect(200);
    expect(feed.text).toContain('SUMMARY:Übungsabend');
    expect(feed.text).not.toContain('Übungsstrecke');
  });

  it('imports sessions with participants and lists the service book', async () => {
    const csv = ['Datum;Beginn;Ende;Art;Thema;Abteilung;Name', '12.03.2026;19:00;21:00;Übung;Technische Hilfe;Abt. Musterstadt;Test Jonas', '12.03.2026;19:00;21:00;Übung;Technische Hilfe;Abt. Musterstadt;Test Max', '12.03.2026;19:00;21:00;Übung;Technische Hilfe;Abt. Musterstadt;Unbekannt Paul'].join('\r\n');
    const run = async () => {
      const upload = await test.http.post('/api/core/imports').set('Cookie', admin).set(UI).attach('file', Buffer.from(csv), 'uebungen.csv').expect(201);
      return post(`/core/imports/${upload.body.id}/apply`, { profile: 'training.sessions', mapping: upload.body.suggestions['training.sessions'] }).expect(200);
    };
    expect((await run()).body.counts).toEqual({ create: 2, update: 0, unchanged: 0, error: 1 });
    expect((await run()).body.counts).toMatchObject({ create: 0, unchanged: 2, error: 1 });
    const book = await get('/core/lists/training.service-book?from=2026-03-01&to=2026-03-31').expect(200);
    expect(book.body.rows).toEqual([expect.objectContaining({ title: 'Technische Hilfe', present: 2 })]);

    // A closed session is not changed by an import.
    const imported = ((await get('/training/sessions?from=2026-03-12&to=2026-03-12')).body as { id: string }[])[0];
    await post(`/training/sessions/${imported.id}/close`, {}).expect(200);
    expect((await run()).body.counts).toMatchObject({ create: 0, unchanged: 0, error: 3 });
  });
});
