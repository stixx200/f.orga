import { randomBytes } from 'node:crypto';
import { EntityManager } from '@mikro-orm/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setUp, startTestApp, type TestApp, UI } from './testing/test-app';

let test: TestApp;
let admin: string;
/** Department commander of Ahornfeld (role template). */
let ahornfeldCommander: string;
/** Group leader writing the reports of Musterstadt (does not lock reports by editing them). */
let writer: string;
const ids: Record<string, string> = {};
/** Device cookies of the terminals. */
const cookies: Record<string, string> = {};

const post = (path: string, body: unknown, cookie = admin) => test.http.post(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const put = (path: string, body: unknown, cookie = admin) => test.http.put(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const get = (path: string, cookie = admin) => test.http.get(`/api${path}`).set('Cookie', cookie);
const del = (path: string, cookie = admin) => test.http.delete(`/api${path}`).set('Cookie', cookie).set(UI);
/** Requests of a terminal: only its device cookie. */
const kiosk = {
  get: (path: string, cookie: string) => test.http.get(`/api/info-terminal/kiosk${path}`).set('Cookie', cookie),
  put: (path: string, body: unknown, cookie: string) => test.http.put(`/api/info-terminal/kiosk${path}`).set('Cookie', cookie).set(UI).send(body as object),
  post: (path: string, body: unknown, cookie: string) => test.http.post(`/api/info-terminal/kiosk${path}`).set('Cookie', cookie).set(UI).send(body as object),
  del: (path: string, cookie: string) => test.http.delete(`/api/info-terminal/kiosk${path}`).set('Cookie', cookie).set(UI),
};
const at = (offsetMinutes: number) => new Date(Date.now() + offsetMinutes * 60_000).toISOString();
/** SQL against the test database, e.g. to mark a report as imported from MP-Feuer. */
const sql = (statement: string, params: unknown[]) => test.app.get(EntityManager).getConnection().execute(statement, params);
const keyOf = (url: string) => url.slice(url.indexOf('#k=') + 3);

/** Exchanges the key of a link for the device cookie. */
async function open(url: string): Promise<string> {
  const response = await test.http.post('/api/info-terminal/kiosk/session').set(UI).send({ key: keyOf(url) }).expect(200);
  return String(response.headers['set-cookie']).split(';')[0];
}

type ReportDto = {
  id: string;
  version: number;
  latestBookingAt: string | null;
  times: { alarmedAt: string; returnedAt: string };
  personnel: {
    personId: string | null;
    vehicleId: string | null;
    standbyStationId: string | null;
    function: string | null;
    breathingApparatus: boolean;
    lossOfEarnings: boolean;
    duringWorkingHours: boolean;
    from: string;
    to: string;
    bookedVia: string | null;
    bookedAt: string | null;
    terminalEditable: boolean;
  }[];
  vehicles: { vehicleId: string }[];
};
const report = async (id: string) => (await get(`/incidents/reports/${id}`).expect(200)).body as ReportDto;

/** The personnel as the editor sends it back: times equal to those of the report as `null`, with `bookedAt`. */
const content = (r: ReportDto) =>
  r.personnel.map(({ personId, vehicleId, standbyStationId, function: fn, breathingApparatus, lossOfEarnings, duringWorkingHours, bookedAt, from, to }) => ({
    personId, vehicleId, standbyStationId, function: fn, breathingApparatus, lossOfEarnings, duringWorkingHours, bookedAt,
    from: from === r.times.alarmedAt ? null : from,
    to: to === r.times.returnedAt ? null : to,
  }));
/** Auto-save of the author's editor with the state `r` it loaded. */
const editorSave = (r: ReportDto, personnel: object[]) =>
  put(`/incidents/reports/${r.id}`, { version: r.version, bookingsKnownAt: r.latestBookingAt, times: r.times, endConfirmed: false, personnel }, writer);

/** An incident of Musterstadt; returns the incident and the report of Musterstadt. */
async function incident(dispatchNumber: string, alarmOffsetMinutes: number, extra: object = {}) {
  const created = await post('/incidents/incidents', { dispatchNumber, alarmKeyword: 'B2', alarmedAt: at(alarmOffsetMinutes), departmentIds: [ids.musterstadt], ...extra }).expect(201);
  const own = (created.body.reports as { id: string; departmentId: string | null; unit: string | null }[]).find((r) => r.departmentId === ids.musterstadt);
  return { incidentId: created.body.id as string, reportId: own?.id as string, reports: created.body.reports as { id: string; departmentId: string | null; unit: string | null }[] };
}

/** Saves the report as the author (writer) with an end confirmed `endOffsetMinutes` from now. */
async function confirmEnd(reportId: string, alarmOffsetMinutes: number, endOffsetMinutes: number) {
  const current = await report(reportId);
  await put(`/incidents/reports/${reportId}`, { version: current.version, endConfirmed: true, times: { alarmedAt: at(alarmOffsetMinutes), returnedAt: at(endOffsetMinutes) } }, writer).expect(200);
}

const booking = (personId: string, values: object = {}) => ({ departmentId: ids.musterstadt, personId, vehicleId: ids.lf, standby: false, function: null, breathingApparatus: false, lossOfEarnings: false, duringWorkingHours: false, from: null, to: null, ...values });
/** Form of "Neuer Einsatz". */
const form = (values: object = {}) => ({ departmentId: ids.musterstadt, alarmKeyword: 'B2', alarmedAt: at(-10), dispatchNumber: null, street: 'Mühlweg 7', city: 'Musterstadt', ...values });
/** A session of the training module. */
const session = async (title: string, startOffset: number, endOffset: number, departmentIds: string[], stationId: string | null = ids.station) =>
  (await post('/training/sessions', { type: 'exercise', title, startsAt: at(startOffset), endsAt: at(endOffset), departmentIds, stationId }).expect(201)).body.id as string;
/** Check-in at the terminal. */
const checkIn = (personId: string, values: object = {}, departmentId = ids.musterstadt) => ({ departmentId, personId, breathingApparatus: false, role: null, from: null, to: null, ...values });

beforeAll(async () => {
  test = await startTestApp();
  admin = await setUp(test);
  await post('/masterdata/catalog/templates/bw', {}).expect(201);
  await post('/incidents/keywords/templates/bw', {}).expect(201);
  await post('/training/types/templates/bw', {}).expect(201);
  ids.musterstadt = (await post('/masterdata/departments', { name: 'Abteilung Musterstadt', shortName: 'Musterstadt', type: 'operational' }).expect(201)).body.id;
  ids.youth = (await post('/masterdata/departments', { name: 'Jugendfeuerwehr Musterstadt', shortName: 'JF Musterstadt', type: 'youth', parentId: ids.musterstadt }).expect(201)).body.id;
  ids.ahornfeld = (await post('/masterdata/departments', { name: 'Abteilung Ahornfeld', shortName: 'Ahornfeld', type: 'operational' }).expect(201)).body.id;
  ids.station = (await post('/masterdata/stations', { name: 'Feuerwehrhaus Musterstadt', departmentId: ids.musterstadt, city: 'Musterstadt' }).expect(201)).body.id;
  ids.ahornfeldStation = (await post('/masterdata/stations', { name: 'Gerätehaus Ahornfeld', departmentId: ids.ahornfeld }).expect(201)).body.id;
  ids.lf = (await post('/masterdata/vehicles', { designation: 'LF 20', radioCallSign: 'Florian Musterstadt 1/44', vehicleType: 'lf-20', departmentId: ids.musterstadt, stationId: ids.station }).expect(201)).body.id;
  ids.elw = (await post('/masterdata/vehicles', { designation: 'ELW 1', vehicleType: 'elw-1', departmentId: ids.ahornfeld }).expect(201)).body.id;
  const person = async (firstName: string, departmentId: string, status = 'active') =>
    (await post('/masterdata/persons', { firstName, lastName: 'Terminal', status, memberships: [{ departmentId, from: '2020-01-01', primary: true }] }).expect(201)).body.id as string;
  ids.jonas = await person('Jonas', ids.musterstadt);
  ids.max = await person('Max', ids.musterstadt);
  ids.tim = await person('Tim', ids.musterstadt);
  ids.paul = await person('Paul', ids.musterstadt, 'passive');
  ids.lena = await person('Lena', ids.ahornfeld);
  ids.mia = await person('Mia', ids.youth, 'youth');

  const roles = (await get('/core/roles').expect(200)).body as { id: string; templateKey: string | null }[];
  const departmentCommander = roles.find((r) => r.templateKey === 'department-commander')!.id;
  await post('/core/users', { username: 'kdt.ahornfeld', displayName: 'Kdt Ahornfeld', password: 'auch-sehr-geheim', roles: [{ roleId: departmentCommander, departmentId: ids.ahornfeld }] }).expect(201);
  ahornfeldCommander = await test.login({ username: 'kdt.ahornfeld', password: 'auch-sehr-geheim' });
  const gf = await post('/core/roles', { name: 'GF Terminal', permissions: ['incidents.reports.read', 'incidents.reports.write'] }).expect(201);
  await post('/core/users', { username: 'gf.terminal', displayName: 'GF Musterstadt', password: 'auch-sehr-geheim', roles: [{ roleId: gf.body.id, departmentId: ids.musterstadt }] }).expect(201);
  writer = await test.login({ username: 'gf.terminal', password: 'auch-sehr-geheim' });
});

afterAll(() => test?.app.close());

describe('info terminal lifecycle', () => {
  it('needs the public address of f.orga and the server key', async () => {
    delete process.env['FORGA_SECRET_KEY'];
    expect((await post('/info-terminal/terminals', { stationId: ids.station, name: 'Tablet' }).expect(503)).body.code).toBe('info-terminal.noPublicUrl');
    await put('/core/settings/brigade', { name: 'Feuerwehr Musterstadt', publicUrl: 'https://forga.example.org/' }).expect(200);
    expect((await post('/info-terminal/terminals', { stationId: ids.station, name: 'Tablet' }).expect(503)).body.code).toBe('info-terminal.noSecretKey');
    process.env['FORGA_SECRET_KEY'] = randomBytes(32).toString('base64');
    expect(await get('/info-terminal/terminals').expect(200)).toHaveProperty('body', []);
  });

  it('creates a terminal with the station department first and shows the link only on request, audited', async () => {
    const created = await post('/info-terminal/terminals', { stationId: ids.station, name: 'Tablet Fahrzeughalle', departmentIds: [ids.youth, ids.musterstadt] }).expect(201);
    expect(created.body.url).toMatch(/^https:\/\/forga\.example\.org\/terminal#k=fit_[A-Za-z0-9_-]{43}$/);
    expect(created.body.terminal).toMatchObject({ departmentIds: [ids.musterstadt, ids.youth], allowNewIncident: true, allowTraining: true, linkAvailable: true, revokedAt: null });
    ids.terminal = created.body.terminal.id;
    const list = await get('/info-terminal/terminals').expect(200);
    expect(JSON.stringify(list.body)).not.toContain(keyOf(created.body.url));
    expect(list.body[0]).not.toHaveProperty('url');

    const shown = await post(`/info-terminal/terminals/${ids.terminal}/link`, { purpose: 'copy' }).expect(200);
    expect(shown.body.url).toBe(created.body.url);
    const audit = (await get('/core/audit?action=info-terminal.').expect(200)).body as { action: string; details: Record<string, unknown> }[];
    expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(['info-terminal.created', 'info-terminal.link-shown']));
    expect(JSON.stringify(audit)).not.toContain(keyOf(created.body.url));

    cookies.musterstadt = await open(created.body.url);
    const opened = await test.http.post('/api/info-terminal/kiosk/session').set(UI).send({ key: keyOf(created.body.url) }).expect(200);
    expect(String(opened.headers['set-cookie'])).toMatch(/forga_terminal=fit_.*Path=\/api\/info-terminal\/kiosk.*HttpOnly.*SameSite=Strict/);
    const terminal = await kiosk.get('/terminal', cookies.musterstadt).expect(200);
    expect(terminal.body).toMatchObject({ station: { name: 'Feuerwehrhaus Musterstadt' }, departments: [{ id: ids.musterstadt, operational: true }, { id: ids.youth, operational: false }], training: true });
    // The history of a booking names the technical user of the terminal.
    expect(terminal.body.name).toBe('Tablet Fahrzeughalle');
  });

  it('needs the permission for all departments of a terminal', async () => {
    expect((await post('/info-terminal/terminals', { stationId: ids.station, name: 'Fremd' }, ahornfeldCommander).expect(403)).body.code).toBe('auth.forbidden');
    await post('/info-terminal/terminals', { stationId: ids.ahornfeldStation, name: 'Mit fremder Abteilung', departmentIds: [ids.musterstadt] }, ahornfeldCommander).expect(403);
    const own = await post('/info-terminal/terminals', { stationId: ids.ahornfeldStation, name: 'Tablet' }, ahornfeldCommander).expect(201);
    ids.ahornfeldTerminal = own.body.terminal.id;
    cookies.ahornfeld = await open(own.body.url);
    // The commander of Ahornfeld sees only the terminals of Ahornfeld and cannot show the link of others.
    expect(((await get('/info-terminal/terminals', ahornfeldCommander).expect(200)).body as { id: string }[]).map((t) => t.id)).toEqual([ids.ahornfeldTerminal]);
    await post(`/info-terminal/terminals/${ids.terminal}/link`, {}, ahornfeldCommander).expect(404);
    await put(`/info-terminal/terminals/${ids.ahornfeldTerminal}`, { name: 'Tablet', departmentIds: [ids.musterstadt], version: own.body.terminal.version }, ahornfeldCommander).expect(403);
  });

  it('accepts only the device cookie at the kiosk endpoints, only for the terminal departments', async () => {
    expect((await test.http.get('/api/info-terminal/kiosk/terminal').set('Cookie', admin).expect(401)).body.code).toBe('info-terminal.invalidKey');
    expect((await test.http.post('/api/info-terminal/kiosk/session').set(UI).send({ key: 'fit_gibt-es-nicht-123' }).expect(401)).body.code).toBe('info-terminal.invalidKey');
    expect((await get('/core/audit?action=info-terminal.invalid-key').expect(200)).body.length).toBe(1);
    // Changes need the UI header like everywhere.
    expect((await test.http.put(`/api/info-terminal/kiosk/reports/x/entries/${ids.jonas}`).set('Cookie', cookies.musterstadt).send({}).expect(403)).body.code).toBe('auth.csrf');
    expect((await kiosk.get(`/overview?departmentId=${ids.ahornfeld}`, cookies.musterstadt).expect(403)).body.code).toBe('info-terminal.departmentNotAllowed');
    expect((await kiosk.get(`/members?departmentId=${ids.musterstadt}`, cookies.ahornfeld).expect(403)).body.code).toBe('info-terminal.departmentNotAllowed');
    await kiosk.get(`/overview?departmentId=${ids.ahornfeld}`, cookies.ahornfeld).expect(200);
  });

  it('shows name tiles of the active members and searches all persons who have not left', async () => {
    const members = (await kiosk.get(`/members?departmentId=${ids.musterstadt}`, cookies.musterstadt).expect(200)).body as { id: string; firstName: string }[];
    expect(members.map((m) => m.firstName)).toEqual(['Jonas', 'Max', 'Tim']);
    expect(Object.keys(members[0]).toSorted()).toEqual(['departments', 'firstName', 'id', 'lastName']);
    const youth = (await kiosk.get(`/members?departmentId=${ids.youth}`, cookies.musterstadt).expect(200)).body as { id: string }[];
    expect(youth.map((m) => m.id)).toEqual([ids.mia]);
    expect((await kiosk.get(`/persons?departmentId=${ids.musterstadt}&q=Te`, cookies.musterstadt).expect(200)).body).toEqual([]);
    const found = (await kiosk.get(`/persons?departmentId=${ids.musterstadt}&q=Terminal`, cookies.musterstadt).expect(200)).body as { id: string; departments: string[] }[];
    expect(found.map((p) => p.id)).toEqual(expect.arrayContaining([ids.paul, ids.lena, ids.mia]));
    expect(found.find((p) => p.id === ids.lena)?.departments).toEqual(['Ahornfeld']);
  });
});

describe('booking window', () => {
  it('opens at the alarm and closes 60 min after the confirmed end, or 6 h after the alarm without one', async () => {
    const running = await incident('2026-TERM-A', -30);
    const old = await incident('2026-TERM-B', -7 * 60);
    const longOpen = await incident('2026-TERM-C', -5 * 60);
    const endedLong = await incident('2026-TERM-D', -3 * 60);
    const endedRecently = await incident('2026-TERM-E', -3 * 60);
    await confirmEnd(endedLong.reportId, -3 * 60, -90);
    await confirmEnd(endedRecently.reportId, -3 * 60, -30);
    Object.assign(ids, { running: running.reportId, runningIncident: running.incidentId, longOpen: longOpen.reportId, endedLong: endedLong.reportId, endedRecently: endedRecently.reportId, old: old.reportId });
    ids.unitReport = running.reports.find((r) => r.unit)?.id ?? '';

    const overview = (await kiosk.get(`/overview?departmentId=${ids.musterstadt}`, cookies.musterstadt).expect(200)).body as { incidents: { reportId: string; bookable: boolean; closesAt: string }[] };
    expect(overview.incidents.map((i) => i.reportId).toSorted()).toEqual([running.reportId, longOpen.reportId, endedRecently.reportId].toSorted());
    const closes = (id: string) => new Date(overview.incidents.find((i) => i.reportId === id)!.closesAt).getTime();
    expect(Math.abs(closes(endedRecently.reportId) - new Date(at(30)).getTime())).toBeLessThan(60_000);
    expect(Math.abs(closes(longOpen.reportId) - new Date(at(60)).getTime())).toBeLessThan(60_000);

    expect((await kiosk.get(`/reports/${endedLong.reportId}?departmentId=${ids.musterstadt}`, cookies.musterstadt).expect(409)).body.code).toBe('info-terminal.windowClosed');
    expect((await kiosk.put(`/reports/${old.reportId}/entries/${ids.jonas}`, booking(ids.jonas), cookies.musterstadt).expect(409)).body.code).toBe('info-terminal.windowClosed');
    // Youth departments have no incidents at the terminal; incident reports are not readable from their view.
    expect((await kiosk.get(`/overview?departmentId=${ids.youth}`, cookies.musterstadt).expect(200)).body.incidents).toEqual([]);
    expect((await kiosk.get(`/reports/${running.reportId}?departmentId=${ids.youth}`, cookies.musterstadt).expect(403)).body.code).toBe('info-terminal.notOperational');
    // Other departments' terminals do not see the report.
    expect((await kiosk.get(`/reports/${running.reportId}?departmentId=${ids.ahornfeld}`, cookies.ahornfeld).expect(404)).body.code).toBe('info-terminal.reportNotFound');
  });

  it('does not book into reports of brigade-wide units (duty officer)', async () => {
    expect(ids.unitReport).toBeTruthy();
    await kiosk.get(`/reports/${ids.unitReport}?departmentId=${ids.musterstadt}`, cookies.musterstadt).expect(404);
    await kiosk.put(`/reports/${ids.unitReport}/entries/${ids.jonas}`, booking(ids.jonas), cookies.musterstadt).expect(404);
  });
});

describe('booking into the department report', () => {
  it('books with vehicle, function, breathing apparatus and own times, without changing the report version', async () => {
    const before = await report(ids.running);
    const from = new Date(new Date(at(-30)).getTime() + 10 * 60_000).toISOString();
    const booked = await kiosk.put(`/reports/${ids.running}/entries/${ids.jonas}`, booking(ids.jonas, { function: 'machinist', breathingApparatus: true, lossOfEarnings: true, from }), cookies.musterstadt).expect(200);
    expect(booked.body).toMatchObject({ personId: ids.jonas, firstName: 'Jonas', vehicleId: ids.lf, function: 'machinist', breathingApparatus: true, lossOfEarnings: true, editable: true, from });
    const after = await report(ids.running);
    expect(after.version).toBe(before.version);
    expect(after.personnel).toEqual([expect.objectContaining({ personId: ids.jonas, vehicleId: ids.lf, breathingApparatus: true, from, bookedVia: 'info-terminal', terminalEditable: true })]);
    expect(after.vehicles.map((v) => v.vehicleId)).toEqual([ids.lf]);
    expect(after.latestBookingAt).toBe(after.personnel[0].bookedAt);
    const revisions = (await get(`/incidents/reports/${ids.running}/revisions`).expect(200)).body as { userName: string; personnelCount: number }[];
    expect(revisions[0]).toMatchObject({ userName: 'Infoterminal Feuerwehrhaus Musterstadt · Tablet Fahrzeughalle', personnelCount: 1 });
    const history = (await get(`/core/history/incidents.report/${ids.running}`).expect(200)).body as { userName?: string | null }[];
    expect(JSON.stringify(history)).toContain('Infoterminal Feuerwehrhaus Musterstadt');
  });

  it('books standby at the station of the terminal for the times of the report, without breathing apparatus', async () => {
    const booked = await kiosk.put(`/reports/${ids.running}/entries/${ids.max}`, booking(ids.max, { vehicleId: null, standby: true, breathingApparatus: true, from: at(-20) }), cookies.musterstadt).expect(200);
    expect(booked.body).toMatchObject({ standby: true, vehicleId: null, breathingApparatus: false, from: null, to: null });
    const stored = (await report(ids.running)).personnel.find((p) => p.personId === ids.max)!;
    expect(stored).toMatchObject({ standbyStationId: ids.station, vehicleId: null, breathingApparatus: false });
  });

  it('refuses guests, unknown persons and persons in another report of the same incident', async () => {
    await kiosk.put(`/reports/${ids.running}/entries/x`, { ...booking(''), personId: undefined }, cookies.musterstadt).expect(400);
    expect((await kiosk.put(`/reports/${ids.running}/entries/${ids.ahornfeld}`, booking(ids.ahornfeld), cookies.musterstadt).expect(400)).body.code).toBe('incidents.unknownPerson');
    const other = await post(`/incidents/incidents/${ids.runningIncident}/reports`, { departmentId: ids.ahornfeld }).expect(201);
    await put(`/incidents/reports/${other.body.id}`, { version: other.body.version, times: other.body.times, personnel: [{ personId: ids.lena, vehicleId: ids.elw }] }).expect(200);
    const refused = await kiosk.put(`/reports/${ids.running}/entries/${ids.lena}`, booking(ids.lena), cookies.musterstadt).expect(409);
    expect(refused.body).toMatchObject({ code: 'info-terminal.personInOtherReport', department: 'Abteilung Ahornfeld' });
    const detail = (await kiosk.get(`/reports/${ids.running}?departmentId=${ids.musterstadt}`, cookies.musterstadt).expect(200)).body as { elsewhere: Record<string, { de: string }>; vehicles: { label: string; atStation: boolean }[] };
    expect(detail.elsewhere[ids.lena]).toEqual({ de: 'Abteilung Ahornfeld', en: 'Abteilung Ahornfeld' });
    expect(detail.vehicles[0]).toEqual(expect.objectContaining({ label: 'LF 20 · Florian Musterstadt 1/44 (Musterstadt)', atStation: true }));
  });

  it('corrects and removes own bookings at the terminal', async () => {
    await kiosk.put(`/reports/${ids.running}/entries/${ids.max}`, booking(ids.max, { function: 'group-leader' }), cookies.musterstadt).expect(200);
    expect((await report(ids.running)).personnel.find((p) => p.personId === ids.max)).toMatchObject({ vehicleId: ids.lf, standbyStationId: null, function: 'group-leader' });
    await kiosk.del(`/reports/${ids.running}/entries/${ids.max}?departmentId=${ids.musterstadt}`, cookies.musterstadt).expect(204);
    expect((await report(ids.running)).personnel.map((p) => p.personId)).toEqual([ids.jonas]);
    expect((await kiosk.del(`/reports/${ids.running}/entries/${ids.max}?departmentId=${ids.musterstadt}`, cookies.musterstadt).expect(404)).body.code).toBe('info-terminal.entryNotFound');
  });

  it("keeps bookings the author's editor did not know and locks the author's entries at the terminal", async () => {
    // The author loaded the report before Paul (passive member, found by the search) booked himself.
    const loaded = await report(ids.running);
    await kiosk.put(`/reports/${ids.running}/entries/${ids.paul}`, booking(ids.paul), cookies.musterstadt).expect(200);
    // Auto-save of the editor: Jonas unchanged, Tim added by the author, Paul unknown to the client.
    const saved = await editorSave(loaded, [...content(loaded), { personId: ids.tim, vehicleId: ids.lf }]).expect(200);
    const byPerson = new Map((saved.body as ReportDto).personnel.map((p) => [p.personId, p]));
    expect([...byPerson.keys()].toSorted()).toEqual([ids.jonas, ids.paul, ids.tim].toSorted());
    expect(byPerson.get(ids.jonas)).toMatchObject({ bookedVia: 'info-terminal', terminalEditable: true });
    expect(byPerson.get(ids.paul)).toMatchObject({ bookedVia: 'info-terminal', terminalEditable: true });
    expect(byPerson.get(ids.tim)).toMatchObject({ bookedVia: null, terminalEditable: false });
    expect((await kiosk.put(`/reports/${ids.running}/entries/${ids.tim}`, booking(ids.tim), cookies.musterstadt).expect(409)).body.code).toBe('info-terminal.entryLocked');

    // The author changes Jonas: from now on it is his entry (badge stays), locked at the terminal.
    const current = await report(ids.running);
    const changed = content(current).map((p) => (p.personId === ids.jonas ? { ...p, function: 'group-leader' } : p));
    const after = await editorSave(current, changed).expect(200);
    expect((after.body as ReportDto).personnel.find((p) => p.personId === ids.jonas)).toMatchObject({ function: 'group-leader', bookedVia: 'info-terminal', terminalEditable: false });
    expect((await kiosk.put(`/reports/${ids.running}/entries/${ids.jonas}`, booking(ids.jonas), cookies.musterstadt).expect(409)).body.code).toBe('info-terminal.entryLocked');
    const detail = (await kiosk.get(`/reports/${ids.running}?departmentId=${ids.musterstadt}`, cookies.musterstadt).expect(200)).body as { entries: { personId: string; editable: boolean }[] };
    expect(Object.fromEntries(detail.entries.map((e) => [e.personId, e.editable]))).toEqual({ [ids.jonas]: false, [ids.paul]: true, [ids.tim]: false });

    // A booking removed at the terminal is not brought back by an editor that still has it.
    const stale = await report(ids.running);
    await kiosk.del(`/reports/${ids.running}/entries/${ids.paul}?departmentId=${ids.musterstadt}`, cookies.musterstadt).expect(204);
    const again = await editorSave(stale, content(stale)).expect(200);
    expect((again.body as ReportDto).personnel.map((p) => p.personId).toSorted()).toEqual([ids.jonas, ids.tim].toSorted());
  });

  it('accepts bookings only while the report is an unlocked draft', async () => {
    // A releaser editing the report locks it.
    const current = await report(ids.longOpen);
    await put(`/incidents/reports/${ids.longOpen}`, { version: current.version, times: { alarmedAt: at(-5 * 60), returnedAt: at(-4 * 60) }, endConfirmed: false }).expect(200);
    const overview = (await kiosk.get(`/overview?departmentId=${ids.musterstadt}`, cookies.musterstadt).expect(200)).body as { incidents: { reportId: string; bookable: boolean }[] };
    expect(overview.incidents.find((i) => i.reportId === ids.longOpen)?.bookable).toBe(false);
    expect((await kiosk.put(`/reports/${ids.longOpen}/entries/${ids.jonas}`, booking(ids.jonas), cookies.musterstadt).expect(403)).body.code).toBe('incidents.reportLocked');
  });

  it('refuses bookings into reports the author has finished', async () => {
    // Submitted for review (set directly: the workflow itself is covered by the tests of the incidents module).
    await test.app.get(EntityManager).getConnection().execute(`update incidents.report set status = 'review' where id = ?`, [ids.endedRecently]);
    const overview = (await kiosk.get(`/overview?departmentId=${ids.musterstadt}`, cookies.musterstadt).expect(200)).body as { incidents: { reportId: string; bookable: boolean }[] };
    expect(overview.incidents.find((i) => i.reportId === ids.endedRecently)?.bookable).toBe(false);
    expect((await kiosk.put(`/reports/${ids.endedRecently}/entries/${ids.jonas}`, booking(ids.jonas), cookies.musterstadt).expect(403)).body.code).toBe('incidents.notDraft');
  });

  it('lets the crew follow the alarm of a vehicle alerted later; only differing times are own times', async () => {
    const later = await incident('2026-TERM-G', -60);
    const current = await report(later.reportId);
    const vehicleAlarm = at(-40);
    await put(`/incidents/reports/${later.reportId}`, { version: current.version, times: current.times, endConfirmed: false, vehicles: [{ vehicleId: ids.lf, alarmedAt: vehicleAlarm }] }, writer).expect(200);
    // The time of the vehicle sent as own time is stored as inherited.
    const inherited = await kiosk.put(`/reports/${later.reportId}/entries/${ids.tim}`, booking(ids.tim, { from: vehicleAlarm }), cookies.musterstadt).expect(200);
    expect(inherited.body).toMatchObject({ vehicleId: ids.lf, from: null, to: null });
    const stored = (await report(later.reportId)).personnel.find((p) => p.personId === ids.tim)!;
    expect(new Date(stored.from).getTime()).toBe(new Date(vehicleAlarm).getTime());
    const own = new Date(new Date(vehicleAlarm).getTime() + 10 * 60_000).toISOString();
    expect((await kiosk.put(`/reports/${later.reportId}/entries/${ids.tim}`, booking(ids.tim, { from: own }), cookies.musterstadt).expect(200)).body.from).toBe(own);
  });

  it('refuses reports kept in MP-Feuer while it leads; otherwise a booking ends the management by other systems', async () => {
    const imported = await incident('2026-TERM-H', -20);
    await sql(`update incidents.report set managed_by = 'mp-feuer' where id = ?`, [imported.reportId]);
    // f.orga leads: the booking is the work of a person, the import leaves the report alone from now on.
    const before = await report(imported.reportId);
    await kiosk.put(`/reports/${imported.reportId}/entries/${ids.max}`, booking(ids.max), cookies.musterstadt).expect(200);
    const after = (await report(imported.reportId)) as ReportDto & { managedBy: string | null };
    expect(after).toMatchObject({ managedBy: null, version: before.version });

    const led = await incident('2026-TERM-I', -20);
    await sql(`update incidents.report set managed_by = 'mp-feuer' where id = ?`, [led.reportId]);
    await put('/core/settings/incidents.general', { externalLeading: 'mp-feuer', externalEventsFrom: '2026-01-01' }).expect(200);
    try {
      const overview = (await kiosk.get(`/overview?departmentId=${ids.musterstadt}`, cookies.musterstadt).expect(200)).body as { incidents: { reportId: string; bookable: boolean }[] };
      expect(overview.incidents.find((i) => i.reportId === led.reportId)?.bookable).toBe(false);
      expect((await kiosk.get(`/reports/${led.reportId}?departmentId=${ids.musterstadt}`, cookies.musterstadt).expect(200)).body.bookable).toBe(false);
      expect((await kiosk.put(`/reports/${led.reportId}/entries/${ids.max}`, booking(ids.max), cookies.musterstadt).expect(409)).body.code).toBe('incidents.ledByMpFeuer');
      // "Neuer Einsatz": joining the incident opens the report of the department, which MP-Feuer keeps.
      const join = await kiosk.post('/incidents', form({ joinIncidentId: led.incidentId }), cookies.musterstadt).expect(409);
      expect(join.body.code).toBe('incidents.ledByMpFeuer');
    } finally {
      await put('/core/settings/incidents.general', { externalLeading: null, externalEventsFrom: null }).expect(200);
    }
  });
});

describe('new incident at the terminal', () => {

  it('offers matching incidents with minimal data and accepts alarms at most 6 hours back', async () => {
    const matches = (await kiosk.post('/incidents/matches', form(), cookies.musterstadt).expect(200)).body as { incidentId: string; ownReport: boolean; departments: string[] }[];
    expect(matches.find((m) => m.incidentId === ids.runningIncident)).toEqual(expect.objectContaining({ ownReport: true, departments: expect.arrayContaining(['Musterstadt', 'Ahornfeld']) }));
    expect(Object.keys(matches[0]).toSorted()).toEqual(['alarmKeyword', 'alarmedAt', 'city', 'departments', 'incidentId', 'ownReport', 'street']);
    expect((await kiosk.post('/incidents', form({ alarmedAt: at(-7 * 60) }), cookies.musterstadt).expect(400)).body.code).toBe('info-terminal.alarmTooOld');
    expect((await kiosk.post('/incidents', form({ alarmedAt: at(60) }), cookies.musterstadt).expect(400)).body.code).toBe('info-terminal.alarmInFuture');
    expect((await kiosk.post('/incidents', form({ departmentId: ids.youth }), cookies.musterstadt).expect(403)).body.code).toBe('info-terminal.notOperational');
  });

  it('creates the incident with the report of the department (createdVia terminal, no author)', async () => {
    const created = await kiosk.post('/incidents', form({ alarmKeyword: 'TH1', street: 'Feldweg 1' }), cookies.musterstadt).expect(201);
    const detail = (await report(created.body.reportId)) as ReportDto & { incidentId: string; authorPersonId: string | null; primary: boolean };
    expect(detail).toMatchObject({ authorPersonId: null, primary: true });
    const incidentDto = (await get(`/incidents/incidents/${detail.incidentId}`).expect(200)).body;
    expect(incidentDto).toMatchObject({ createdVia: 'terminal', alarmKeyword: 'TH1', location: expect.objectContaining({ street: 'Feldweg 1', city: 'Musterstadt' }) });
    await kiosk.put(`/reports/${created.body.reportId}/entries/${ids.max}`, booking(ids.max), cookies.musterstadt).expect(200);
    expect(((await get('/core/audit?action=info-terminal.incident-created').expect(200)).body as unknown[]).length).toBe(1);
  });

  it('adds the report of the department to an existing incident of another department', async () => {
    const other = await post('/incidents/incidents', { dispatchNumber: '2026-TERM-F', alarmKeyword: 'B1', alarmedAt: at(-15), departmentIds: [ids.ahornfeld] }).expect(201);
    const joined = await kiosk.post('/incidents', form({ alarmKeyword: 'B1', joinIncidentId: other.body.id }), cookies.musterstadt).expect(201);
    const incidentDto = (await get(`/incidents/incidents/${other.body.id}`).expect(200)).body as { reports: { id: string; departmentId: string | null; primary: boolean }[] };
    expect(incidentDto.reports.find((r) => r.departmentId === ids.musterstadt)).toMatchObject({ id: joined.body.reportId, primary: false });
    // Joining again returns the existing report.
    expect((await kiosk.post('/incidents', form({ alarmKeyword: 'B1', joinIncidentId: other.body.id }), cookies.musterstadt).expect(201)).body.reportId).toBe(joined.body.reportId);
  });
});

describe('sessions at the terminal', () => {

  it('lists sessions of the department at the station from 30 minutes before the start until 60 minutes after the end', async () => {
    ids.soon = await session('Gleich', 20, 140, [ids.musterstadt]);
    ids.later = await session('Später', 31, 150, [ids.musterstadt]);
    ids.ended = await session('Eben vorbei', -120, -50, [ids.musterstadt]);
    ids.over = await session('Vorbei', -150, -70, [ids.musterstadt]);
    ids.elsewhere = await session('Andere Wache', 0, 60, [ids.musterstadt], ids.ahornfeldStation);
    ids.youthSession = await session('Jugenddienst', -10, 90, [ids.youth], null);
    const overview = (await kiosk.get(`/overview?departmentId=${ids.musterstadt}`, cookies.musterstadt).expect(200)).body as { sessions: { sessionId: string }[]; upcoming: { sessionId: string }[] };
    expect(overview.sessions.map((s) => s.sessionId).toSorted()).toEqual([ids.soon, ids.ended].toSorted());
    expect((await kiosk.put(`/sessions/${ids.over}/attendance/${ids.jonas}`, checkIn(ids.jonas), cookies.musterstadt).expect(409)).body.code).toBe('info-terminal.windowClosed');
    expect((await kiosk.put(`/sessions/${ids.later}/attendance/${ids.jonas}`, checkIn(ids.jonas), cookies.musterstadt).expect(409)).body.code).toBe('info-terminal.windowClosed');
    await kiosk.put(`/sessions/${ids.elsewhere}/attendance/${ids.jonas}`, checkIn(ids.jonas), cookies.musterstadt).expect(404);
  });

  it('checks in unconfirmed (checkedInVia info-terminal); the session cannot be closed until the list is saved', async () => {
    await kiosk.put(`/sessions/${ids.ended}/attendance/${ids.jonas}`, checkIn(ids.jonas, { role: 'Ausbilder', breathingApparatus: true }), cookies.musterstadt).expect(204);
    const stored = (await get(`/training/sessions/${ids.ended}`).expect(200)).body as { status: string; attendance: { personId: string; status: string; confirmed: boolean; checkedInVia: string; role: string; breathingApparatus: boolean }[] };
    expect(stored.status).toBe('held');
    expect(stored.attendance).toEqual([expect.objectContaining({ personId: ids.jonas, status: 'present', confirmed: false, checkedInVia: 'info-terminal', role: 'Ausbilder', breathingApparatus: true })]);
    expect((await post(`/training/sessions/${ids.ended}/close`, {}).expect(409)).body.code).toBe('training.unconfirmedCheckIns');
    const detail = (await kiosk.get(`/sessions/${ids.ended}?departmentId=${ids.musterstadt}`, cookies.musterstadt).expect(200)).body as { attendance: { personId: string; editable: boolean }[]; breathingApparatus: boolean };
    expect(detail).toMatchObject({ breathingApparatus: true, attendance: [{ personId: ids.jonas, editable: true }] });
    await kiosk.del(`/sessions/${ids.ended}/attendance/${ids.jonas}?departmentId=${ids.musterstadt}`, cookies.musterstadt).expect(204);
    expect((await get(`/training/sessions/${ids.ended}`).expect(200)).body.attendance).toEqual([]);
  });

  it('records no breathing apparatus in the view of a youth department and locks confirmed attendance', async () => {
    await kiosk.put(`/sessions/${ids.youthSession}/attendance/${ids.mia}`, checkIn(ids.mia, { breathingApparatus: true }, ids.youth), cookies.musterstadt).expect(204);
    const stored = (await get(`/training/sessions/${ids.youthSession}`).expect(200)).body as { attendance: { personId: string; breathingApparatus: boolean; checkedInAt: string }[] };
    expect(stored.attendance[0]).toMatchObject({ personId: ids.mia, breathingApparatus: false });
    // Saving the list confirms the check-in; afterwards it is locked at the terminal.
    await put(`/training/sessions/${ids.youthSession}/attendance`, [{ personId: ids.mia, status: 'present', checkedInAt: stored.attendance[0].checkedInAt }]).expect(200);
    expect((await kiosk.put(`/sessions/${ids.youthSession}/attendance/${ids.mia}`, checkIn(ids.mia, {}, ids.youth), cookies.musterstadt).expect(409)).body.code).toBe('info-terminal.entryLocked');
  });
});

describe('new link, revocation and module state', () => {
  it('invalidates the old link with a new one', async () => {
    const rotated = await post(`/info-terminal/terminals/${ids.ahornfeldTerminal}/rotate`, {}, ahornfeldCommander).expect(200);
    expect((await kiosk.get('/terminal', cookies.ahornfeld).expect(401)).body.code).toBe('info-terminal.invalidKey');
    cookies.ahornfeld = await open(rotated.body.url);
    await kiosk.get('/terminal', cookies.ahornfeld).expect(200);
  });

  it('keeps stations with active terminals; revoking is immediate, keeps the bookings and cannot be undone', async () => {
    await del(`/masterdata/stations/${ids.ahornfeldStation}`).expect(409);
    const revoked = await post(`/info-terminal/terminals/${ids.ahornfeldTerminal}/revoke`, {}, ahornfeldCommander).expect(200);
    expect(revoked.body).toMatchObject({ revokedBy: 'Kdt Ahornfeld', linkAvailable: false });
    expect((await kiosk.get('/terminal', cookies.ahornfeld).expect(403)).body.code).toBe('info-terminal.revoked');
    expect((await post(`/info-terminal/terminals/${ids.ahornfeldTerminal}/link`, {}, ahornfeldCommander).expect(409)).body.code).toBe('info-terminal.revoked');
    expect((await get('/info-terminal/terminals').expect(200)).body.map((t: { id: string }) => t.id)).not.toContain(ids.ahornfeldTerminal);
    expect((await get('/info-terminal/terminals?includeRevoked=true').expect(200)).body.map((t: { id: string }) => t.id)).toContain(ids.ahornfeldTerminal);
    const actions = ((await get('/core/audit?action=info-terminal.').expect(200)).body as { action: string }[]).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['info-terminal.key-rotated', 'info-terminal.revoked']));
  });

  it('serves the kiosk page only while the module is active, which needs the incidents module', async () => {
    expect((await test.http.get('/api/core/modules/kiosk/terminal').expect(200)).body).toEqual({ moduleId: 'info-terminal', remote: 'info_terminal_web', exposed: './Kiosk', entry: '/modules/info-terminal/remoteEntry.js' });
    await put('/core/modules/info-terminal', { active: false }).expect(200);
    expect((await kiosk.get('/terminal', cookies.musterstadt).expect(404)).body.code).toBe('modules.inactive');
    expect((await test.http.get('/api/core/modules/kiosk/terminal').expect(404)).body.code).toBe('modules.inactive');
    for (const id of ['duty-officer', 'cost-recovery']) await put(`/core/modules/${id}`, { active: false }).expect(200);
    await put('/core/modules/incidents', { active: false }).expect(200);
    const refused = await put('/core/modules/info-terminal', { active: true }).expect(400);
    expect(refused.body).toMatchObject({ code: 'modules.requirementsInactive', modules: ['incidents'] });
    await put('/core/modules/incidents', { active: true }).expect(200);
    await put('/core/modules/info-terminal', { active: true }).expect(200);
    expect((await put('/core/modules/incidents', { active: false }).expect(400)).body.code).toBe('modules.requiredByActive');
    await kiosk.get('/terminal', cookies.musterstadt).expect(200);
  });
});
