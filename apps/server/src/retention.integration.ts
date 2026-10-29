import { EntityManager } from '@mikro-orm/core';
import { strFromU8, unzipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SAMPLE_STATUTE } from '@forga/compensation-contracts';
import { Attachments } from '@forga/core-api';
import { RETENTION_TEMPLATE_MUNICIPAL, type RetentionCase, type RetentionRuleInput } from '@forga/core-contracts';
import { setUp, startTestApp, type TestApp, UI } from './testing/test-app';

let test: TestApp;
let admin: string;
let clerk: string;
let reader: string;
let writer: string;
const ids: Record<string, string> = {};

const post = (path: string, body: unknown, cookie = admin) => test.http.post(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const put = (path: string, body: unknown, cookie = admin) => test.http.put(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const get = (path: string, cookie = admin) => test.http.get(`/api${path}`).set('Cookie', cookie);
const sql = () => test.app.get(EntityManager).getConnection();
const rules = (retention: Record<string, RetentionRuleInput>) => put('/core/settings/privacy', { retention }).expect(200);
const run = async (dryRun: boolean, retention?: Record<string, RetentionRuleInput>, cookie = admin) =>
  (await post('/core/retention/run', { dryRun, ...(retention ? { settings: { retention } } : {}) }, cookie).expect(200)).body as {
    counts: Record<string, number>;
    cases: Record<string, number>;
    effectiveYears: Record<string, number>;
    warnings: string[];
  };
const cases = async () => (await get('/core/retention/cases').expect(200)).body as RetentionCase[];
const caseOf = async (recordId: string) => (await cases()).find((c) => c.recordId === recordId && c.status !== 'done');

/** supertest collects binary bodies only with an explicit parser. */
function binary() {
  return ((res: NodeJS.ReadableStream, callback: (error: Error | null, body: Buffer) => void) => {
    const chunks: Buffer[] = [];
    res.on('data', (chunk: Buffer) => chunks.push(chunk));
    res.on('end', () => callback(null, Buffer.concat(chunks)));
  }) as never;
}

const at = (date: string, time = '13:05') => `${date}T${time}:00+02:00`;

/** An incident of a past day with one report of Musterstadt, its content and statistics. */
async function incident(dispatchNumber: string, date: string, content: object = {}, statistics: object = { mainType: 'fire', fireSize: 'small-b' }) {
  const created = await post('/incidents/incidents', {
    dispatchNumber,
    alarmKeyword: 'B2',
    alarmMessage: 'Brand in Wohnhaus, Anrufer Herr Meier',
    alarmedAt: at(date),
    location: { street: 'Hauptstraße', houseNumber: '12', city: 'Musterstadt', district: 'Nord' },
    departmentIds: [ids.musterstadt],
  }).expect(201);
  const reportId = created.body.reports[0].id as string;
  const report = await get(`/incidents/reports/${reportId}`).expect(200);
  await put(`/incidents/reports/${reportId}`, {
    version: report.body.version,
    times: { alarmedAt: at(date), returnedAt: at(date, '15:50') },
    situation: 'Rauch aus Kellerfenster',
    actions: 'Innenangriff mit 1 C-Rohr',
    incidentCommander: 'Max Test',
    personnel: [{ personId: ids.jonas, vehicleId: ids.lf }, { guestName: 'Gast Hans', vehicleId: ids.lf }],
    vehicles: [{ vehicleId: ids.lf }],
    involvedParties: [{ role: 'owner', name: 'Erika Mustermann', street: 'Hauptstraße 12', licensePlate: 'MU-XY 12' }],
    ...content,
  }).expect(200);
  const current = await get(`/incidents/incidents/${created.body.id}`).expect(200);
  await put(`/incidents/incidents/${created.body.id}/statistics`, { statistics, version: current.body.version }).expect(200);
  return { id: created.body.id as string, reportId };
}

beforeAll(async () => {
  test = await startTestApp();
  admin = await setUp(test);
  await post('/masterdata/catalog/templates/bw', {}).expect(201);
  await post('/incidents/keywords/templates/bw', {}).expect(201);
  await post('/training/types/templates/bw', {}).expect(201);
  await put('/core/settings/incidents.general', { homeMunicipalities: ['Musterstadt'] }).expect(200);
  await put('/core/settings/duty-officer.general', { reportRequired: false }).expect(200);
  await put('/core/settings/compensation.general', SAMPLE_STATUTE).expect(200);
  ids.musterstadt = (await post('/masterdata/departments', { name: 'Abteilung Musterstadt', shortName: 'Musterstadt', type: 'operational' }).expect(201)).body.id;
  ids.lf = (await post('/masterdata/vehicles', { designation: 'LF 20/16', vehicleType: 'lf-20-16', departmentId: ids.musterstadt }).expect(201)).body.id;
  const person = async (firstName: string, extra: object = {}) =>
    (await post('/masterdata/persons', { firstName, lastName: 'Test', status: 'active', email: `${firstName.toLowerCase()}@example.org`, memberships: [{ departmentId: ids.musterstadt, from: '1980-01-01', primary: true }], ...extra }).expect(201)).body.id as string;
  ids.jonas = await person('Jonas');
  ids.otto = await person('Otto', { personnelNumber: 'P-77' });

  // The administration works on the list „Aussonderung“ without managing the settings.
  const clerkRole = await post('/core/roles', { name: 'Aussonderung', permissions: ['core.retention.manage'] }).expect(201);
  await post('/core/users', { username: 'verwaltung', displayName: 'Verwaltung', password: 'auch-sehr-geheim', roles: [{ roleId: clerkRole.body.id }] }).expect(201);
  clerk = await test.login({ username: 'verwaltung', password: 'auch-sehr-geheim' });
  const readerRole = await post('/core/roles', { name: 'Leser', permissions: ['incidents.reports.read'] }).expect(201);
  await post('/core/users', { username: 'leser', displayName: 'Leser', password: 'auch-sehr-geheim', roles: [{ roleId: readerRole.body.id }] }).expect(201);
  reader = await test.login({ username: 'leser', password: 'auch-sehr-geheim' });
  const writerRole = await post('/core/roles', { name: 'GF', permissions: ['incidents.reports.read', 'incidents.reports.write'] }).expect(201);
  await post('/core/users', { username: 'gf.test', displayName: 'GF', password: 'auch-sehr-geheim', roles: [{ roleId: writerRole.body.id, departmentId: ids.musterstadt }] }).expect(201);
  writer = await test.login({ username: 'gf.test', password: 'auch-sehr-geheim' });
});

afterAll(() => test?.app.close());

describe('retention plan', () => {
  it('deletes nothing until periods are chosen; only audit log, read log and locked accounts without person have a default', async () => {
    const old = await incident('2010-000001', '2010-03-12');
    ids.old = old.id;
    const categories = (await get('/core/retention/categories').expect(200)).body as { key: string; defaultRule: { action: string; years: number | null } }[];
    expect(categories.map((c) => c.key)).toEqual(
      expect.arrayContaining(['core.audit', 'core.history', 'masterdata.person-core', 'masterdata.person-file', 'masterdata.vehicles-retired', 'incidents.incidents', 'training.sessions', 'equipment.retired', 'cost-recovery.notices', 'compensation.runs']),
    );
    const defaults: Record<string, string> = { 'core.audit': 'delete', 'core.access-log': 'delete', 'core.locked-accounts': 'anonymize' };
    for (const c of categories) expect(c.defaultRule.action).toBe(defaults[c.key] ?? 'none');
    expect((await get('/core/settings/privacy')).body).toEqual({ retention: {} });
    const result = await run(false);
    expect(Object.keys(result.counts).filter((k) => !['core.audit', 'core.access-log', 'core.imports', 'mp-feuer.rows'].includes(k) && result.counts[k] > 0)).toEqual([]);
    expect(await cases()).toEqual([]);
    expect((await get(`/incidents/incidents/${old.id}`).expect(200)).body).toMatchObject({ alarmMessage: 'Brand in Wohnhaus, Anrufer Herr Meier', anonymizedAt: null });
  });

  it('needs core.retention.manage for the list; trying unsaved rules needs core.settings.manage', async () => {
    await get('/core/retention/cases', reader).expect(403);
    await get('/core/retention/categories', reader).expect(403);
    await post('/core/retention/run', { dryRun: true }, reader).expect(403);
    await get('/core/retention/cases', clerk).expect(200);
    await get('/core/retention/categories', clerk).expect(200);
    await post('/core/retention/run', { dryRun: false }, clerk).expect(200);
    await post('/core/retention/run', { dryRun: true, settings: { retention: {} } }, clerk).expect(403);
    await put('/core/settings/privacy', { retention: {} }, clerk).expect(403);
    await post('/core/retention/cases/execute', { caseIds: ['0190c0de-0000-7000-8000-000000000001'] }, reader).expect(403);
  });

  it('applies the template „Kommunaler Aktenplan (Beispiel)“ only when saved; the basic data stay as long as the file', async () => {
    const preview = await run(true, RETENTION_TEMPLATE_MUNICIPAL);
    expect(preview.effectiveYears['masterdata.person-core']).toBe(30);
    expect(preview.warnings).toContain('privacy.personCoreShorter');
    expect((await get('/core/settings/privacy')).body).toEqual({ retention: {} });
    await rules(RETENTION_TEMPLATE_MUNICIPAL);
    const stored = (await get('/core/settings/privacy')).body.retention;
    expect(stored['incidents.incidents:special']).toMatchObject({ years: 30, action: 'offer-archive', afterDecision: 'anonymize', specialCase: true });
    expect(stored['training.sessions:staff-meeting']).toMatchObject({ years: 5, specialCase: true });
    expect(stored['cost-recovery.notices']).toBeUndefined();
    // An offer to the archive needs to know what happens afterwards.
    await put('/core/settings/privacy', { retention: { 'incidents.incidents': { years: 3, action: 'offer-archive' } } }).expect(400);
    await rules({});
  });

  it('counts due records in a dry run, per subtype and with the „30 Jahre aufbewahren“ checkbox', async () => {
    const plain = await incident('2018-000002', '2018-05-02');
    const injured = await incident('2018-000003', '2018-06-03', { personnel: [{ personId: ids.jonas, vehicleId: ids.lf, injured: true }] });
    const marked = await incident('2018-000004', '2018-07-04');
    ids.plain = plain.id;
    ids.injured = injured.id;
    ids.marked = marked.id;

    // Releasers, the commander and the writers of the primary report mark an incident; readers do not.
    const current = (await get(`/incidents/incidents/${marked.id}`, writer).expect(200)).body;
    expect(current).toMatchObject({ retentionSpecial: false, retentionSpecialEditable: true });
    expect((await get(`/incidents/incidents/${marked.id}`, reader).expect(200)).body.retentionSpecialEditable).toBe(false);
    await put(`/incidents/incidents/${marked.id}/retention`, { retentionSpecial: true, version: current.version }, reader).expect(403);
    const updated = await put(`/incidents/incidents/${marked.id}/retention`, { retentionSpecial: true, version: current.version }, writer).expect(200);
    expect(updated.body.retentionSpecial).toBe(true);
    await put(`/incidents/incidents/${marked.id}/retention`, { retentionSpecial: false, version: current.version }, writer).expect(409);
    const audit = (await get('/core/audit?action=incidents.retention-changed')).body as { details: Record<string, unknown> }[];
    expect(audit[0].details).toMatchObject({ incidentId: marked.id, retentionSpecial: true });
    const history = (await get(`/core/history/incidents.incident/${marked.id}`)).body as { changes: Record<string, unknown> }[];
    expect(history.some((h) => 'retentionSpecial' in h.changes)).toBe(true);

    const dry = await run(true, {
      'incidents.incidents': { years: 3, action: 'anonymize' },
      'incidents.incidents:special': { years: 30, action: 'anonymize' },
    });
    // 2010 and 2018 without special features are older than 3 years; the injured and the marked one count as special.
    expect(dry.counts['incidents.incidents']).toBe(2);
    expect(dry.counts['incidents.incidents:special']).toBe(0);
    const special = await run(true, { 'incidents.incidents:special': { years: 5, action: 'offer-archive', afterDecision: 'anonymize' } });
    expect(special.counts['incidents.incidents:special']).toBe(2);
    expect(special.counts['incidents.incidents'] ?? 0).toBe(0);
  });

  it('anonymises incidents without changing the annual statistics', async () => {
    const pdf = Buffer.from('%PDF-1.4\n%Test\n');
    const { reportId } = { reportId: ((await get(`/incidents/incidents/${ids.plain}`)).body.reports[0].id) as string };
    await test.http.post(`/api/core/attachments?type=incidents.report&id=${reportId}`).set('Cookie', admin).set(UI).attach('file', pdf, { filename: 'Alarmfax.pdf', contentType: 'application/pdf' }).expect(201);
    const before = (await get('/incidents/statistics/2018').expect(200)).body.values;

    // Without archive and special case: processed by the run right away.
    await rules({ 'incidents.incidents': { years: 3, action: 'anonymize' } });
    const result = await run(false);
    expect(result.counts['incidents.incidents']).toBe(2);
    expect((await get('/incidents/statistics/2018').expect(200)).body.values).toEqual(before);

    const anonymized = (await get(`/incidents/incidents/${ids.plain}`).expect(200)).body;
    expect(anonymized).toMatchObject({ dispatchNumber: '2018-000002', alarmKeyword: 'B2', alarmMessage: '', statistics: expect.objectContaining({ mainType: 'fire' }) });
    expect(anonymized.anonymizedAt).not.toBeNull();
    expect(anonymized.location).toMatchObject({ street: '', houseNumber: '', city: 'Musterstadt', district: 'Nord' });
    const report = (await get(`/incidents/reports/${reportId}`).expect(200)).body;
    expect(report).toMatchObject({ situation: '', actions: '', incidentCommander: '' });
    expect(report.involvedParties).toEqual([expect.objectContaining({ role: 'owner', name: '', street: '', licensePlate: '' })]);
    // Members stay as references (their names follow the retention of the persons), guests lose their names.
    expect(report.personnel.map((p: { personId: string | null; guestName: string }) => [p.personId, p.guestName])).toEqual([[ids.jonas, ''], [null, '']]);
    expect(await test.app.get(Attachments).list('incidents.report', [reportId])).toEqual([]);
    expect((await get(`/core/history/incidents.report/${reportId}`)).body).toEqual([]);
    expect((await get(`/incidents/reports/${reportId}/revisions`)).body).toEqual([]);
    // An anonymised incident is not anonymised again, and its checkbox cannot be set any more.
    expect((await run(true)).counts['incidents.incidents']).toBe(0);
    await put(`/incidents/incidents/${ids.plain}/retention`, { retentionSpecial: true, version: anonymized.version }).expect(409);
    await rules({});
  });

  it('offers sessions to the archive, exports them with attachments, and deletes them after the decision', async () => {
    const meeting = await post('/training/sessions', { type: 'meeting', title: 'Feuerwehrausschuss', startsAt: '1990-03-01T18:00:00Z', endsAt: '1990-03-01T20:00:00Z', departmentIds: [ids.musterstadt] }).expect(201);
    const pdf = Buffer.from('%PDF-1.4\n%Protokoll\n');
    await test.http.post(`/api/core/attachments?type=training.session&id=${meeting.body.id}`).set('Cookie', admin).set(UI).attach('file', pdf, { filename: 'Protokoll.pdf', contentType: 'application/pdf' }).expect(201);
    const exercise = await post('/training/sessions', { type: 'exercise', title: 'Übung 1990', startsAt: '1990-04-01T18:00:00Z', endsAt: '1990-04-01T20:00:00Z', departmentIds: [ids.musterstadt] }).expect(201);
    await rules({ 'training.sessions:meeting': { years: 30, action: 'offer-archive', afterDecision: 'delete' } });
    const result = await run(false, undefined, clerk);
    expect(result.cases['training.sessions:meeting']).toBe(1);
    // Other kinds keep the rule of the category: nothing.
    expect(await caseOf(exercise.body.id)).toBeUndefined();
    const due = (await caseOf(meeting.body.id))!;
    expect(due).toMatchObject({ status: 'due', label: 'Feuerwehrausschuss', eventDate: '1990-03-01', dueSince: '2020-03-01', attachments: 1, action: 'offer-archive', afterDecision: 'delete' });
    // A second run does not add the record again.
    expect((await run(false)).cases['training.sessions:meeting']).toBe(0);

    // Nothing happens without the decision of the archive.
    expect((await post('/core/retention/cases/execute', { caseIds: [due.id] }, clerk).expect(200)).body).toEqual({ executed: 0, failed: [{ caseId: due.id, code: 'retention.decisionMissing' }] });
    await post('/core/retention/cases/decide', { caseIds: [due.id], decision: 'destroyed', date: '2026-10-28' }, clerk).expect(400);

    const { offerId } = (await post('/core/retention/cases/offer', { caseIds: [due.id], archive: 'Kreisarchiv', note: 'per Datenträger' }, clerk).expect(200)).body;
    expect(await caseOf(meeting.body.id)).toMatchObject({ status: 'offered', archive: 'Kreisarchiv', offerId });
    const zip = await test.http.get(`/api/core/retention/offers/${offerId}/export?lang=de`).set('Cookie', clerk).buffer(true).parse(binary()).expect(200);
    expect(zip.headers['content-type']).toBe('application/zip');
    const files = unzipSync(new Uint8Array(zip.body as Buffer));
    const names = Object.keys(files);
    expect(names).toEqual(expect.arrayContaining(['anbietungsverzeichnis.pdf', 'uebersicht.csv', 'daten.json']));
    expect(names.some((n) => /^001-Feuerwehrausschuss\/datensatz\.pdf$/.test(n))).toBe(true);
    const attachment = names.find((n) => n.endsWith('/anhaenge/Protokoll.pdf'))!;
    expect(strFromU8(files[attachment])).toContain('%Protokoll');
    expect(strFromU8(files['anbietungsverzeichnis.pdf']).startsWith('%PDF')).toBe(true);
    expect(strFromU8(files['uebersicht.csv'])).toContain('Feuerwehrausschuss');
    const json = JSON.parse(strFromU8(files['daten.json']));
    expect(json).toMatchObject({ format: 'forga.export', kind: 'retention-offer', archive: 'Kreisarchiv', records: [expect.objectContaining({ category: 'training.sessions', recordId: meeting.body.id })] });
    // The record stays unchanged until the decision.
    await get(`/training/sessions/${meeting.body.id}`).expect(200);

    await post('/core/retention/cases/decide', { caseIds: [due.id], decision: 'destroyed', date: '2026-10-28', note: 'nicht archivwürdig' }, clerk).expect(204);
    const executed = (await post('/core/retention/cases/execute', { caseIds: [due.id] }, clerk).expect(200)).body;
    expect(executed).toEqual({ executed: 1, failed: [] });
    await get(`/training/sessions/${meeting.body.id}`).expect(404);
    // Attachments follow their record.
    expect(await test.app.get(Attachments).list('training.session', [meeting.body.id])).toEqual([]);
    expect(await sql().execute('select id from core.history where entity_id = ? or parent_id = ?', [meeting.body.id, meeting.body.id])).toEqual([]);
    // The case stays as proof.
    const proof = (await cases()).find((c) => c.id === due.id)!;
    expect(proof).toMatchObject({ status: 'done', executedAction: 'delete', decidedOn: '2026-10-28', archive: 'Kreisarchiv' });
    for (const action of ['retention.offered', 'retention.exported', 'retention.decided', 'retention.executed']) {
      expect(((await get(`/core/audit?action=${action}`)).body as unknown[]).length).toBeGreaterThan(0);
    }
    const decided = ((await get('/core/audit?action=retention.decided')).body as { references: Record<string, { label: unknown }> }[])[0];
    expect(decided.references['training.sessions'].label).toEqual({ de: 'Dienste', en: 'Sessions' });
    await rules({});
  });

  it('defers special cases and takes over by the archive before anonymising persons', async () => {
    await post(`/masterdata/persons/${ids.otto}/leave`, { leftOn: '1990-06-30', exitReason: 'own-request' }).expect(201);
    // What other modules keep about the person goes with the file (here a note on a duty of the duty officer roster).
    await sql().execute(`insert into duty_officer.duty_assignment (id, person_id, kind, "from", "to", notes, version) values ('0190c0de-0000-7000-8000-00000000d0d0', ?, 'evd', '1989-01-01T00:00:00Z', '1989-01-08T00:00:00Z', 'krank gemeldet', 1)`, [ids.otto]);
    await rules({
      'masterdata.person-file': { years: 30, action: 'offer-archive', afterDecision: 'anonymize', specialCase: true },
      'masterdata.person-core': { years: 15, action: 'offer-archive', afterDecision: 'anonymize' },
    });
    await run(false);
    const file = (await cases()).find((c) => c.recordId === ids.otto && c.category === 'masterdata.person-file')!;
    const core = (await cases()).find((c) => c.recordId === ids.otto && c.category === 'masterdata.person-core')!;
    expect(file).toMatchObject({ status: 'due', label: 'Test, Otto · P-77', specialCase: true, dueSince: '2020-06-30' });
    // The basic data stay as long as the file: 30 instead of 15 years.
    expect(core.dueSince).toBe('2020-06-30');

    await post('/core/retention/cases/defer', { caseIds: [core.id], until: '2020-01-01', reason: 'x' }, clerk).expect(400);
    await post('/core/retention/cases/defer', { caseIds: [core.id], until: '2099-12-31', reason: 'laufendes Verfahren' }, clerk).expect(204);
    expect((await cases()).find((c) => c.id === core.id)).toMatchObject({ status: 'deferred', deferReason: 'laufendes Verfahren' });

    await post('/core/retention/cases/offer', { caseIds: [file.id], archive: 'Stadtarchiv' }, clerk).expect(200);
    await post('/core/retention/cases/decide', { caseIds: [file.id], decision: 'accepted', date: '2026-10-28' }, clerk).expect(204);
    await post('/core/retention/cases/execute', { caseIds: [file.id] }, clerk).expect(200);
    // The file is anonymised, the name stays with the basic data until their case is decided.
    const person = (await get(`/masterdata/persons/${ids.otto}`).expect(200)).body;
    expect(person).toMatchObject({ firstName: 'Otto', lastName: 'Test', email: '', anonymizedAt: null });
    expect(await sql().execute('select notes from duty_officer.duty_assignment where person_id = ?', [ids.otto])).toEqual([{ notes: '' }]);
    const done = (await cases()).find((c) => c.id === file.id)!;
    // Without names of persons after the execution.
    expect(done).toMatchObject({ status: 'done', label: 'P-77', executedAction: 'anonymize' });
    await rules({});
  });

  it('does not delete incidents with an open cost notice', async () => {
    const blocked = await incident('2012-000005', '2012-02-02');
    await sql().execute(
      `insert into cost_recovery.notice (id, number, incident_id, dispatch_number, alarm_keyword, alarmed_at, offense_key, status, version, created_at) values ('0190c0de-0000-7000-8000-00000000c0de', 'KE-2012-001', ?, '2012-000005', 'B2', '2012-02-02T11:05:00Z', 'x', 'issued', 1, now())`,
      [blocked.id],
    );
    await rules({ 'incidents.incidents': { years: 3, action: 'delete' } });
    const result = await run(false);
    // The incident of 2010 is deleted; the one with the open notice stays as blocked case.
    expect(result.counts['incidents.incidents']).toBeGreaterThanOrEqual(1);
    await get(`/incidents/incidents/${ids.old}`).expect(404);
    await get(`/incidents/incidents/${blocked.id}`).expect(200);
    expect(await caseOf(blocked.id)).toMatchObject({ status: 'due', blockedBy: 'retention.costNoticeOpen' });
    // Settled, the notice no longer blocks: the next run deletes the incident.
    await sql().execute(`update cost_recovery.notice set status = 'paid', paid_on = '2012-05-01' where id = '0190c0de-0000-7000-8000-00000000c0de'`);
    await run(false);
    await get(`/incidents/incidents/${blocked.id}`).expect(404);
    expect((await cases()).find((c) => c.recordId === blocked.id)).toMatchObject({ status: 'done', label: '2012-000005', executedAction: 'delete' });
    await rules({});
  });

  it('removes due cases whose rule was switched off, and deletes old history in bulk', async () => {
    await rules({ 'incidents.incidents:special': { years: 5, action: 'offer-archive', afterDecision: 'anonymize' } });
    await run(false);
    expect(await caseOf(ids.marked)).toMatchObject({ status: 'due', reason: { de: '30 Jahre aufbewahren (Sonderfall)', en: 'Keep for 30 years (special case)' } });
    expect(await caseOf(ids.injured)).toMatchObject({ reason: { de: 'Verletzte oder Tote', en: 'Injured or dead' } });
    await rules({});
    await run(false);
    expect(await caseOf(ids.marked)).toBeUndefined();

    await sql().execute(`update core.history set timestamp = '2001-01-01' where entity = 'masterdata.vehicle'`);
    const preview = await run(true, { 'core.history': { years: 10, action: 'delete' } });
    expect(preview.counts['core.history']).toBeGreaterThanOrEqual(1);
    await rules({ 'core.history': { years: 10, action: 'delete' } });
    await run(false);
    expect((await get(`/core/history/masterdata.vehicle/${ids.lf}`)).body).toEqual([]);
    await rules({});
  });
});
