import { createHmac } from 'node:crypto';
import { EntityManager } from '@mikro-orm/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Attachments, DomainEvents } from '@forga/core-api';
import { SessionEntity } from '@forga/training-api';
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
      category: 'training',
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

    // A list loaded before the check-in does not overwrite it: the check-in stays unconfirmed.
    const stale = await put(`/training/sessions/${ids.session}/attendance`, [
      { personId: ids.jonas, status: 'present' },
      { personId: ids.max, status: 'excused' },
    ], leader).expect(200);
    expect(stale.body.attendance.find((a: { personId: string }) => a.personId === ids.max)).toMatchObject({ status: 'present', confirmed: false });
    await put(`/training/sessions/${ids.session}/attendance`, [{ personId: ids.jonas, status: 'present' }], leader).expect(200);
    expect((await get(`/training/sessions/${ids.session}`)).body.attendance.some((a: { personId: string }) => a.personId === ids.max)).toBe(true);

    // Saving the list with the check-in known confirms it and updates the row in place.
    const checkedInAt = session.attendance.find((a: { personId: string }) => a.personId === ids.max).checkedInAt;
    const saved = await put(`/training/sessions/${ids.session}/attendance`, [
      { personId: ids.jonas, status: 'present' },
      { personId: ids.max, status: 'present', breathingApparatus: true, checkedInAt },
    ], leader).expect(200);
    const max = saved.body.attendance.find((a: { personId: string }) => a.personId === ids.max);
    expect(max).toMatchObject({ status: 'present', breathingApparatus: true, confirmed: true });
    expect(max.checkedInAt).not.toBeNull();
  });

  it('rotates the check-in code and admits only members of the session', async () => {
    const shown = (await get(`/training/sessions/${ids.session}/check-in`, leader).expect(200)).body;
    expect(shown).toMatchObject({ checkedIn: 1 });
    expect(new Date(shown.rotatesAt).getTime() - Date.now()).toBeLessThanOrEqual(60_000);
    // A code of three minutes ago (e.g. a photo of the QR code) no longer works; a forged one neither.
    const secret = (await test.app.get(EntityManager).fork().findOneOrFail(SessionEntity, ids.session)).checkInSecret!;
    const period = Math.floor(Date.now() / 60_000) - 3;
    const old = `${ids.session}.${createHmac('sha256', secret).update(`${ids.session}:${period}`).digest('base64url').slice(0, 22)}`;
    expect((await post('/training/check-in', { code: old }, leader).expect(400)).body).toMatchObject({ code: 'training.codeExpired' });
    await post('/training/check-in', { code: `${ids.session}.AAAAAAAAAAAAAAAAAAAAAA` }, leader).expect(400);

    // Lena belongs to another department and is not invited.
    const roles = (await get('/core/roles')).body as { id: string; templateKey: string }[];
    const member = roles.find((r) => r.templateKey === 'member')!.id;
    await post('/core/users', { username: 'lena', displayName: 'Lena', password: 'auch-sehr-geheim', personId: ids.lena, roles: [{ roleId: member, departmentId: ids.ahornfeld }] }).expect(201);
    const lena = await test.login({ username: 'lena', password: 'auch-sehr-geheim' });
    expect((await post('/training/check-in', { code: shown.code }, lena).expect(403)).body).toMatchObject({ code: 'training.notInvited' });
  });

  it('checks the times of the attendance and records it only once the session began', async () => {
    const start = new Date(Date.now() - 30 * 60_000);
    const time = (minutes: number) => new Date(start.getTime() + minutes * 60_000).toISOString();
    const session = (await post('/training/sessions', { type: 'exercise', title: 'Zeiten', startsAt: start.toISOString(), endsAt: time(120), departmentIds: [ids.musterstadt] }).expect(201)).body.id;
    const attend = (row: Record<string, unknown>) => put(`/training/sessions/${session}/attendance`, [{ personId: ids.jonas, status: 'present', ...row }], leader);
    expect((await attend({ from: time(60), to: time(30) }).expect(400)).body).toMatchObject({ code: 'training.attendanceEndBeforeStart', personId: ids.jonas });
    expect((await attend({ from: time(-300) }).expect(400)).body).toMatchObject({ code: 'training.attendanceOutsideSession' });
    expect((await attend({ to: time(-10) }).expect(400)).body).toMatchObject({ code: 'training.attendanceEndBeforeStart' });
    await attend({ from: time(-30), to: time(150) }).expect(200);

    // A session next month: excuses in advance, but no presence and no closing.
    const later = (await post('/training/sessions', { type: 'exercise', title: 'Später', startsAt: at(60 * 24 * 30), endsAt: at(60 * 24 * 30 + 120), departmentIds: [ids.musterstadt] }).expect(201)).body.id;
    expect((await put(`/training/sessions/${later}/attendance`, [{ personId: ids.jonas, status: 'present' }], leader).expect(400)).body).toMatchObject({ code: 'training.notStarted' });
    expect((await put(`/training/sessions/${later}/attendance`, [{ personId: ids.max, status: 'excused' }], leader).expect(200)).body.status).toBe('planned');
    // Within the check-in time before the start presence may be recorded, closing waits for the start.
    const soon = (await post('/training/sessions', { type: 'exercise', title: 'Gleich', startsAt: at(10), endsAt: at(130), departmentIds: [ids.musterstadt] }).expect(201)).body.id;
    await put(`/training/sessions/${soon}/attendance`, [{ personId: ids.jonas, status: 'present' }], leader).expect(200);
    expect((await post(`/training/sessions/${soon}/close`, {}).expect(409)).body).toMatchObject({ code: 'training.notStarted' });
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

const row = (session: { attendance: { personId: string }[] }, personId: string) => session.attendance.find((a) => a.personId === personId);

describe('training sessions: corrections, persons, participation and audit', () => {

  it('discards a wrong QR check-in; an excuse sent before stays', async () => {
    ids.wrong = (await post('/training/sessions', { type: 'exercise', title: 'Falscher Check-in', startsAt: at(-10), endsAt: at(110), departmentIds: [ids.musterstadt] }).expect(201)).body.id;
    await put(`/training/me/sessions/${ids.wrong}/excuse`, { reason: 'vacation', note: 'Urlaub' }, leader).expect(200);
    const code = (await get(`/training/sessions/${ids.wrong}/check-in`, leader).expect(200)).body.code as string;
    await post('/training/check-in', { code }, leader).expect(200);
    expect(row((await get(`/training/sessions/${ids.wrong}`)).body, ids.max)).toMatchObject({ status: 'present', confirmed: false });
    expect((await post(`/training/sessions/${ids.wrong}/close`, {}).expect(409)).body).toMatchObject({ code: 'training.unconfirmedCheckIns' });

    const discarded = (await post(`/training/sessions/${ids.wrong}/check-ins/${ids.max}/discard`, {}, leader).expect(200)).body;
    expect(row(discarded, ids.max)).toMatchObject({ status: 'excused', confirmed: true, checkedInAt: null, note: 'Urlaub' });
    expect(discarded.status).toBe('planned');
    await post(`/training/sessions/${ids.wrong}/check-ins/${ids.max}/discard`, {}, leader).expect(409);

    // Without an excuse the row goes.
    await test.http.delete(`/api/training/me/sessions/${ids.wrong}/excuse`).set('Cookie', leader).set(UI).expect(200);
    await post('/training/check-in', { code }, leader).expect(200);
    expect(row((await post(`/training/sessions/${ids.wrong}/check-ins/${ids.max}/discard`, {}, leader).expect(200)).body, ids.max)).toBeUndefined();
    await put(`/training/sessions/${ids.wrong}/attendance`, [{ personId: ids.jonas, status: 'present' }], leader).expect(200);
    await post(`/training/sessions/${ids.wrong}/close`, {}).expect(200);
  });

  it('records attendance only for persons of the person directory, guests included', async () => {
    const session = (await post('/training/sessions', { type: 'exercise', title: 'Gäste', startsAt: at(-30), endsAt: at(90), departmentIds: [ids.musterstadt] }).expect(201)).body.id;
    const unknown = '00000000-0000-4000-8000-000000000000';
    expect((await put(`/training/sessions/${session}/attendance`, [{ personId: ids.jonas, status: 'present' }, { personId: unknown, status: 'present' }], leader).expect(400)).body).toMatchObject({ code: 'training.unknownPerson', personId: unknown });
    // Lena of another department as a guest.
    const saved = (await put(`/training/sessions/${session}/attendance`, [{ personId: ids.jonas, status: 'present' }, { personId: ids.lena, status: 'present' }], leader).expect(200)).body;
    expect(row(saved, ids.lena)).toMatchObject({ status: 'present' });
  });

  it('keeps a scanned code valid as a ticket while the member logs in', async () => {
    const code = (await get(`/training/sessions/${ids.session}/check-in`, leader).expect(200)).body.code as string;
    // The QR code leads to the server first (no login), which opens the check-in page with a ticket.
    const start = await test.http.get(`/api/training/check-in/start?code=${encodeURIComponent(code)}`).expect(302);
    const ticket = decodeURIComponent(/code=([^&]+)/.exec(start.headers['location'] as string)![1]);
    expect(ticket.split('.')).toHaveLength(3);
    expect((await post('/training/check-in', { code: ticket }, leader).expect(200)).body).toMatchObject({ sessionId: ids.session });
    // A ticket is not extended by another one; unknown codes are passed on as they are.
    expect((await test.http.get(`/api/training/check-in/start?code=${encodeURIComponent(ticket)}`).expect(302)).headers['location']).toBe(`/training/check-in?code=${encodeURIComponent(ticket)}`);
    expect((await test.http.get('/api/training/check-in/start?code=falsch').expect(302)).headers['location']).toBe('/training/check-in?code=falsch');

    // An expired or forged ticket does not work.
    const secret = (await test.app.get(EntityManager).fork().findOneOrFail(SessionEntity, ids.session)).checkInSecret!;
    const expires = Math.floor(Date.now() / 1000) - 60;
    const expired = `${ids.session}.${expires}.${createHmac('sha256', secret).update(`${ids.session}:ticket:${expires}`).digest('base64url').slice(0, 22)}`;
    expect((await post('/training/check-in', { code: expired }, leader).expect(400)).body).toMatchObject({ code: 'training.codeExpired' });
    await post('/training/check-in', { code: `${ids.session}.${expires + 3600}.AAAAAAAAAAAAAAAAAAAAAA` }, leader).expect(404);
  });

  it('computes the participation rate from the sessions of the own departments', async () => {
    const before = (await get('/training/participation?from=2020-01-01&to=2030-12-31').expect(200)).body as { personId: string; sessions: number }[];
    ids.nora = (await post('/masterdata/persons', { firstName: 'Nora', lastName: 'Test', status: 'active', memberships: [{ departmentId: ids.ahornfeld, from: '2020-01-01', primary: true }] }).expect(201)).body.id;
    const session = (await post('/training/sessions', { type: 'exercise', title: 'Ahornfeld', startsAt: at(-120), endsAt: at(-30), departmentIds: [ids.ahornfeld] }).expect(201)).body.id;
    await put(`/training/sessions/${session}/attendance`, [{ personId: ids.lena, status: 'present' }]).expect(200);

    const after = (await get('/training/participation?from=2020-01-01&to=2030-12-31').expect(200)).body as { personId: string; sessions: number; present: number; rate: number; departmentId: string | null }[];
    const of = (personId: string) => after.find((p) => p.personId === personId);
    // The session of Ahornfeld does not lower the rate of Musterstadt's members.
    expect(of(ids.jonas)!.sessions).toBe(before.find((p) => p.personId === ids.jonas)!.sessions);
    expect(of(ids.jonas)).toMatchObject({ departmentId: ids.musterstadt });
    // Nora, a member of Ahornfeld, missed it without being listed.
    expect(of(ids.nora)).toMatchObject({ sessions: 1, present: 0, rate: 0, departmentId: ids.ahornfeld });

    const list = (await get(`/core/lists/training.participation?from=2020-01-01&to=2030-12-31&departmentId=${ids.ahornfeld}`).expect(200)).body;
    expect(list.rows.find((r: { name: string }) => r.name === 'Test, Nora')).toMatchObject({ department: 'Ahornfeld', sessions: 1, present: 0, rate: 0 });
  });

  it('records special services as sessions of their own category, outside the participation rate', async () => {
    // The module is called "Dienste" now; ID, paths and permissions stay `training`.
    const modules = (await get('/core/modules').expect(200)).body as { id: string; name: { de: string; en: string } }[];
    expect(modules.find((m) => m.id === 'training')!.name).toEqual({ de: 'Dienste', en: 'Services' });

    const types = (await get('/training/types').expect(200)).body as { key: string; category: string; compensation: string; countsForParticipation: boolean }[];
    const type = (key: string) => types.find((x) => x.key === key);
    expect(type('equipment-support')).toMatchObject({ category: 'special-service', compensation: 'special-service', countsForParticipation: false });
    expect(type('fire-safety-education')).toMatchObject({ category: 'special-service', compensation: 'special-service', countsForParticipation: false });
    expect(type('fire-watch')).toMatchObject({ category: 'special-service', compensation: 'fire-watch' });
    expect(type('meeting')).toMatchObject({ category: 'other', compensation: 'none' });
    expect(type('exercise')).toMatchObject({ category: 'training', compensation: 'training', countsForParticipation: true });
    // A type created without a category is a training type.
    expect((await post('/training/types', { key: 'workshop', name: { de: 'Werkstatt', en: 'Workshop' } }).expect(201)).body).toMatchObject({ category: 'training' });

    const events: SessionClosedEvent[] = [];
    test.app.get(DomainEvents).subscribe<SessionClosedEvent>(TRAINING_EVENTS.sessionClosed, (e) => {
      events.push(e);
    });
    const before = (await get('/training/participation?from=2020-01-01&to=2030-12-31').expect(200)).body as { personId: string; sessions: number; present: number }[];
    const special = (await post('/training/sessions', { type: 'fire-safety-education', title: 'Brandschutzerziehung Kindergarten', startsAt: at(-150), endsAt: at(-30), departmentIds: [ids.ahornfeld] }).expect(201)).body.id;
    await put(`/training/sessions/${special}/attendance`, [{ personId: ids.lena, status: 'present' }]).expect(200);
    await post(`/training/sessions/${special}/close`, {}).expect(200);
    expect(events.find((e) => e.sessionId === special)).toMatchObject({ category: 'special-service', compensation: 'special-service', attendances: [expect.objectContaining({ personId: ids.lena, minutes: 120 })] });

    // Lists and filters by category.
    const of = async (category: string) => ((await get(`/training/sessions?from=2020-01-01&to=2030-12-31&category=${category}`).expect(200)).body as { id: string }[]).map((s) => s.id);
    expect(await of('special-service')).toEqual([special]);
    expect(await of('training')).not.toContain(special);
    expect(await of('training')).toContain(ids.session);
    await get('/training/sessions?category=incident').expect(400);

    // The special service counts neither for the members of Ahornfeld nor for the person present.
    const after = (await get('/training/participation?from=2020-01-01&to=2030-12-31').expect(200)).body as { personId: string; sessions: number; present: number }[];
    for (const personId of [ids.lena, ids.nora]) {
      expect(after.find((p) => p.personId === personId)).toMatchObject({ sessions: before.find((p) => p.personId === personId)!.sessions, present: before.find((p) => p.personId === personId)!.present });
    }
  });

  it('records closing and reopening in the audit log', async () => {
    const entries = (await get('/core/audit?action=training.').expect(200)).body as { action: string; details: { sessionId: string } }[];
    expect(entries.filter((e) => e.details.sessionId === ids.session).map((e) => e.action)).toEqual(expect.arrayContaining(['training.session-closed', 'training.session-reopened']));
    expect(entries.some((e) => e.action === 'training.session-closed' && e.details.sessionId === ids.wrong)).toBe(true);
  });
});

describe('session types created during an import', () => {
  it('appends a new session type after the existing ones', async () => {
    const before = (await get('/core/imports/lookups/session-type').expect(200)).body as { key: string }[];
    const created = await post('/core/imports/lookups/session-type', { key: 'day-loop', name: 'Tagschleife' }).expect(201);
    expect(created.body).toMatchObject({ key: 'day-loop', name: { de: 'Tagschleife' } });
    const after = (await get('/core/imports/lookups/session-type').expect(200)).body as { key: string }[];
    expect(after.map((t) => t.key)).toEqual([...before.map((t) => t.key), 'day-loop']);
    expect((await post('/core/imports/lookups/session-type', { key: 'day-loop', name: 'Tagschleife' }).expect(409)).body.code).toBe('catalog.keyTaken');
  });
});
