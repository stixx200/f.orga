import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addMonthsToDate, type PrivacyRequest, type PrivacyTexts } from '@forga/core-contracts';
import { setUp, startTestApp, type TestApp, UI } from './testing/test-app';

/**
 * Data protection, phase 2 part 1 (concept `dokumentation/geplant/datenschutz.md`): privacy notice and information
 * (L4), requests of data subjects with deadline and restriction of processing (L7), objection (L19).
 */
let test: TestApp;
let admin: string;
let privacy: string;
let privacyUnconfirmed: string;
let reader: string;
let member: string;
let memberId: string;
const ids: Record<string, string> = {};
const PASSWORD = 'auch-sehr-geheim';

const post = (path: string, body: unknown, cookie = admin) => test.http.post(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const put = (path: string, body: unknown, cookie = admin) => test.http.put(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const del = (path: string, cookie = admin) => test.http.delete(`/api${path}`).set('Cookie', cookie).set(UI);
const get = (path: string, cookie = admin) => test.http.get(`/api${path}`).set('Cookie', cookie);
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
const names = (rows: { id?: string; personId?: string }[]) => rows.map((r) => r.id ?? r.personId);
const audit = async (action: string) => (await get(`/core/audit?action=${action}`).expect(200)).body as { details: Record<string, unknown> }[];

beforeAll(async () => {
  test = await startTestApp();
  admin = await setUp(test);
  await post('/masterdata/catalog/templates/bw', {}).expect(201);
  await post('/training/types/templates/bw', {}).expect(201);
  ids.musterstadt = (await post('/masterdata/departments', { name: 'Abteilung Musterstadt', shortName: 'Musterstadt', type: 'operational' }).expect(201)).body.id;
  const person = async (firstName: string, extra: Record<string, unknown> = {}) =>
    (await post('/masterdata/persons', { firstName, lastName: 'Datenschutz', status: 'active', street: 'Am Weiher 3', postalCode: '12345', city: 'Musterstadt', memberships: [{ departmentId: ids.musterstadt, from: '2020-01-01', primary: true }], ...extra }).expect(201)).body.id as string;
  ids.tobias = await person('Tobias');
  ids.sandra = await person('Sandra', { status: 'probation' });
  ids.mia = await person('Mia');
  ids.paul = await person('Paul');

  const role = async (name: string, permissions: string[]) => (await post('/core/roles', { name, permissions }).expect(201)).body.id as string;
  const privacyRole = await role('Datenschutz', ['core.privacy.manage', 'masterdata.persons.read']);
  const readerRole = await role('Leser', [
    'masterdata.persons.read',
    'masterdata.persons.write',
    'incidents.reports.read',
    'respiratory-protection.read',
    'compensation.read',
    'clothing.read',
    'promotions.read',
    'training.read',
    'training.attendance',
  ]);
  const memberRole = await role('Mitglied DS', ['masterdata.self']);
  await post('/core/users', { username: 'dsb', displayName: 'Datenschutz Verwaltung', password: PASSWORD, roles: [{ roleId: privacyRole, departmentId: null }] }).expect(201);
  await post('/core/users', { username: 'leser', displayName: 'Leser', password: PASSWORD, roles: [{ roleId: readerRole, departmentId: null }] }).expect(201);
  memberId = (await post('/core/users', { username: 'mia', displayName: 'Mia Datenschutz', password: PASSWORD, personId: ids.mia, roles: [{ roleId: memberRole, departmentId: ids.musterstadt }] }).expect(201)).body.id;
  privacy = await test.login({ username: 'dsb', password: PASSWORD });
  privacyUnconfirmed = await test.login({ username: 'dsb', password: PASSWORD }, { elevated: false });
  reader = await test.login({ username: 'leser', password: PASSWORD });
  member = await test.login({ username: 'mia', password: PASSWORD });
});

afterAll(() => test?.app.close());

describe('permission and settings', () => {
  it('declares core.privacy.manage as privileged and with step-up', async () => {
    const permissions = (await get('/core/permissions').expect(200)).body as { id: string; stepUp?: boolean; privileged?: boolean; scope: string }[];
    expect(permissions.find((p) => p.id === 'core.privacy.manage')).toMatchObject({ scope: 'brigade', stepUp: true, privileged: true });
    expect((await get('/core/privacy/requests', privacyUnconfirmed).expect(403)).body.code).toBe('auth.stepUpRequired');
    expect((await get('/core/privacy/requests', reader).expect(403)).body.code).toBe('auth.forbidden');
  });

  it('keeps contacts, self-service and recipients for the managers of data protection', async () => {
    const contacts = await put('/core/settings/privacy.contacts', { controller: { name: 'Stadt Musterstadt', address: 'Marktplatz 1, 12345 Musterstadt' }, dpo: { name: 'Datenschutzbeauftragter der Stadt', email: 'datenschutz@musterstadt.example' } }, privacy).expect(200);
    expect(contacts.body.authority.name).toContain('Baden-Württemberg');
    await put('/core/settings/privacy.contacts', { dpo: { email: 'keine-adresse' } }, privacy).expect(400);
    await get('/core/settings/privacy.contacts', reader).expect(403);
    await put('/core/settings/privacy.selfServiceAccess', { mode: 'request', contact: 'Markus Vogt, Kommandant' }, privacy).expect(200);
    await put('/core/settings/privacy.recipients', { recipients: [{ id: 'treasury', name: 'Stadtkasse' }] }, privacy).expect(200);
    // The security settings moved to the data protection page: its managers may change them.
    await put('/core/settings/security', { mailHealthWithoutNames: true, mailAllWithoutNames: false }, privacy).expect(200);
    await get('/core/security/status', privacy).expect(200);
    // Text blocks are versioned by their own endpoint.
    expect((await put('/core/settings/privacy.texts', {}, privacy).expect(400)).body.code).toBe('settings.dedicatedEndpoint');
  });

  it('versions the text blocks: a change makes a template again until it is reviewed', async () => {
    let texts = (await get('/core/privacy/texts', privacy).expect(200)).body as PrivacyTexts;
    expect(texts.rights).toMatchObject({ version: 1, reviewedAt: null });
    expect(texts.rights.text.de).toContain('[Vorlage]');
    expect(texts.replyExtension.text.en).toContain('{extendedUntil}');
    await post('/core/privacy/texts/rights/review', { version: 1 }, privacy).expect(200);
    texts = (await put('/core/privacy/texts/rights', { version: 1, text: { de: 'Ihre Rechte: Auskunft (Art. 15 DSGVO) …', en: 'Your rights: access (Art. 15 GDPR) …' } }, privacy).expect(200)).body;
    expect(texts.rights).toMatchObject({ version: 2, reviewedAt: null, changedBy: 'Datenschutz Verwaltung' });
    expect((await put('/core/privacy/texts/rights', { version: 1, text: { de: 'x', en: 'y' } }, privacy).expect(409)).body.code).toBe('conflict.stale');
    await put('/core/privacy/texts/unknown', { version: 1, text: { de: 'x', en: 'y' } }, privacy).expect(400);
    texts = (await post('/core/privacy/texts/rights/review', { version: 2 }, privacy).expect(200)).body;
    expect(texts.rights).toMatchObject({ version: 2, reviewedBy: 'Datenschutz Verwaltung' });
    expect((await audit('privacy.text-reviewed')).map((e) => e.details)).toContainEqual({ key: 'rights', version: 2 });
    const onboarding = (await get('/core/onboarding').expect(200)).body as { key: string; done: boolean; to: string }[];
    expect(onboarding.find((i) => i.key === 'privacyTexts')).toEqual({ key: 'privacyTexts', done: false, to: '/admin/privacy/settings?tab=texts' });
    expect(onboarding.find((i) => i.key === 'privacyContacts')?.done).toBe(true);
  });
});

describe('privacy notice (L4)', () => {
  it('is public, versioned and available as PDF', async () => {
    const notice = (await test.http.get('/api/core/privacy/notice').expect(200)).body;
    expect(notice.template).toBe(true);
    expect(notice.brigadeName).toBe('Feuerwehr Musterstadt');
    expect(notice.sections.map((s: { key: string }) => s.key)).toEqual(['noticeIntro', 'controller', 'noticeProcessing', 'rights', 'complaint', 'automatedDecisions', 'thirdCountry']);
    expect(notice.sections.find((s: { key: string }) => s.key === 'controller').text.de).toContain('Stadt Musterstadt');
    expect(notice.sections.find((s: { key: string }) => s.key === 'rights').text.en).toContain('Your rights: access');
    // A change of the contacts is a new version; older versions stay readable.
    await put('/core/settings/privacy.contacts', { controller: { name: 'Stadt Musterstadt', address: 'Marktplatz 1, 12345 Musterstadt', representedBy: 'Bürgermeisterin' }, dpo: { name: 'Datenschutzbeauftragter der Stadt', email: 'datenschutz@musterstadt.example' } }, privacy).expect(200);
    const next = (await test.http.get('/api/core/privacy/notice').expect(200)).body;
    expect(next.version).toBe(notice.version + 1);
    expect(next.versions.map((v: { version: number }) => v.version)).toContain(notice.version);
    expect((await test.http.get(`/api/core/privacy/notice?version=${notice.version}`).expect(200)).body.sections).toEqual(notice.sections);
    await test.http.get('/api/core/privacy/notice?version=999').expect(404);
    const pdf = await test.http.get('/api/core/privacy/notice.pdf?language=en').expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('asks for the acknowledgement at the first sign-in once all its blocks are reviewed, then after a new version', async () => {
    expect((await get('/core/session', member).expect(200)).body.privacyNotice).toMatchObject({ acknowledgedVersion: null, due: false });
    const texts = (await get('/core/privacy/texts', privacy).expect(200)).body as PrivacyTexts;
    for (const key of ['noticeIntro', 'noticeProcessing', 'automatedDecisions', 'thirdCountry'] as const) {
      await post(`/core/privacy/texts/${key}/review`, { version: texts[key].version }, privacy).expect(200);
    }
    const state = (await get('/core/session', member).expect(200)).body.privacyNotice;
    expect(state.due).toBe(true);
    const firstLogin = (await get('/core/privacy/notice/first-login', member).expect(200)).body;
    expect(firstLogin.version).toBe(state.version);
    expect(firstLogin.text.de).toContain('Feuerwehr Musterstadt');
    expect((await post('/core/privacy/notice/acknowledge', { version: state.version - 1 }, member).expect(409)).body.code).toBe('privacy.noticeOutdated');
    await post('/core/privacy/notice/acknowledge', { version: state.version }, member).expect(204);
    expect((await get('/core/session', member).expect(200)).body.privacyNotice).toEqual({ version: state.version, acknowledgedVersion: state.version, due: false });
    expect((await audit('privacy.notice-acknowledged'))[0].details).toEqual({ version: state.version });

    // A new version asks again.
    await put('/core/settings/privacy.contacts', { controller: { name: 'Stadt Musterstadt', address: 'Marktplatz 2, 12345 Musterstadt' }, dpo: { name: 'Datenschutzbeauftragter der Stadt', email: 'datenschutz@musterstadt.example' } }, privacy).expect(200);
    expect((await get('/core/session', member).expect(200)).body.privacyNotice).toMatchObject({ acknowledgedVersion: state.version, due: true });

    // An administrator acting as the member cannot acknowledge for him.
    const started = await test.http.post(`/api/core/users/${memberId}/impersonate`).set('Cookie', admin).set(UI).send({ reason: 'Ansicht prüfen' }).expect(200);
    const impersonated = String(started.headers['set-cookie']).split(',').map((c) => c.trim().split(';')[0]).find((c) => c.startsWith('forga_session='))!;
    const during = (await get('/core/session', impersonated).expect(200)).body.privacyNotice;
    expect(during.due).toBe(false);
    expect((await post('/core/privacy/notice/acknowledge', { version: during.version }, impersonated).expect(403)).body.code).toBe('privacy.acknowledgeOwnOnly');
    await test.http.post('/api/core/impersonation/end').set('Cookie', impersonated).set(UI).expect(200);
    await post('/core/privacy/notice/acknowledge', { version: during.version }, member).expect(204);
  });

  it('lists persons without recorded information and records it for many at once', async () => {
    const uninformed = async () => ((await get('/masterdata/privacy/uninformed', privacy).expect(200)).body as { id: string }[]).map((p) => p.id);
    // Mia acknowledged the notice as a user.
    expect(await uninformed()).toEqual(expect.arrayContaining([ids.tobias, ids.sandra, ids.paul]));
    expect(await uninformed()).not.toContain(ids.mia);
    await get('/masterdata/privacy/uninformed', reader).expect(403);
    expect((await post('/masterdata/privacy/information', { personIds: [ids.tobias, ids.paul], informedOn: '2026-10-20', via: 'letter' }, privacy).expect(200)).body).toEqual({ count: 2 });
    expect(await uninformed()).not.toContain(ids.tobias);
    expect((await get(`/masterdata/persons/${ids.tobias}`).expect(200)).body.privacyInformation).toEqual({ informedOn: '2026-10-20', via: 'letter' });
    expect((await audit('privacy.information-recorded'))[0].details).toEqual({ count: 2, informedOn: '2026-10-20', via: 'letter' });
    await post('/masterdata/privacy/information', { personIds: [ids.paul], informedOn: '2026-10-20', via: 'pigeon' }, privacy).expect(400);
  });
});

describe('requests of data subjects (L7, L19)', () => {
  let request: PrivacyRequest;

  it('records a request with the deadline of one month as a task of the privacy managers', async () => {
    const received = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date(Date.now() - 10 * 86_400_000));
    request = (await post('/core/privacy/requests', { personId: ids.tobias, kind: 'access', receivedOn: received, channel: 'letter', identityChecked: true, identityNote: 'Unterschrift, Anschrift', content: 'Bitte um Auskunft.' }, privacy).expect(201)).body;
    expect(request).toMatchObject({ personName: 'Datenschutz, Tobias', status: 'received', dueOn: addMonthsToDate(received, 1), deadline: addMonthsToDate(received, 1), createdByName: 'Datenschutz Verwaltung' });
    await post('/core/privacy/requests', { personId: ids.tobias, kind: 'access', receivedOn: '2099-01-01', channel: 'letter' }, privacy).expect(400);
    await post('/core/privacy/requests', { personId: '0190c0de-0000-7000-8000-000000000000', kind: 'access', receivedOn: received, channel: 'letter' }, privacy).expect(400);
    await post('/core/privacy/requests', { personId: ids.tobias, kind: 'access', receivedOn: received, channel: 'letter', restrict: true }, privacy).expect(400);
    // The task names no person; it shows also before the step-up, never for others.
    const tasks = (await get('/core/tasks?asOf=2099-01-01', privacyUnconfirmed).expect(200)).body as { kind: string; subject: { label: string }; to: string; dueOn: string }[];
    const task = tasks.find((t) => t.kind === 'privacy-request');
    expect(task).toMatchObject({ dueOn: request.deadline, to: `/admin/privacy/requests/${request.id}` });
    expect(task!.subject.label).not.toContain('Tobias');
    expect(((await get('/core/tasks?asOf=2099-01-01', reader).expect(200)).body as { kind: string }[]).some((t) => t.kind === 'privacy-request')).toBe(false);
    expect((await audit('privacy.request-created'))[0].details).toMatchObject({ requestId: request.id, personId: ids.tobias, kind: 'access', channel: 'letter' });
  });

  it('extends the period once with a reason and reminds to tell the person', async () => {
    const assignees = (await get('/core/privacy/assignees', privacy).expect(200)).body as { id: string; displayName: string }[];
    expect(assignees.map((a) => a.displayName)).toEqual(expect.arrayContaining(['Admin', 'Datenschutz Verwaltung']));
    expect(assignees.map((a) => a.displayName)).not.toContain('Leser');
    const dsb = assignees.find((a) => a.displayName === 'Datenschutz Verwaltung')!;
    request = (await put(`/core/privacy/requests/${request.id}`, { version: request.version, status: 'in-review', assigneeId: dsb.id, identityChecked: true, identityNote: 'Unterschrift', notes: 'Rückfrage Kämmerei', language: 'de', activity: '' }, privacy).expect(200)).body;
    expect(request).toMatchObject({ status: 'in-review', assigneeName: 'Datenschutz Verwaltung', notes: 'Rückfrage Kämmerei' });
    await post(`/core/privacy/requests/${request.id}/extend`, { version: request.version, months: 3, reason: 'Viele Einsätze in mehreren Abteilungen' }, privacy).expect(400);
    await post(`/core/privacy/requests/${request.id}/extend`, { version: request.version, months: 2, reason: 'kurz' }, privacy).expect(400);
    request = (await post(`/core/privacy/requests/${request.id}/extend`, { version: request.version, months: 2, reason: 'Viele Einsätze in mehreren Abteilungen' }, privacy).expect(200)).body;
    expect(request).toMatchObject({ status: 'extended', extendedUntil: addMonthsToDate(request.dueOn, 2), deadline: addMonthsToDate(request.dueOn, 2) });
    expect((await post(`/core/privacy/requests/${request.id}/extend`, { version: request.version, months: 1, reason: 'Noch einmal verlängern' }, privacy).expect(409)).body.code).toBe('privacy.alreadyExtended');
    let kinds = ((await get('/core/tasks?asOf=2099-01-01', privacy).expect(200)).body as { kind: string; dueOn: string }[]).filter((t) => t.kind.startsWith('privacy-'));
    expect(kinds).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'privacy-extension-notice', dueOn: request.dueOn })]));
    request = (await post(`/core/privacy/requests/${request.id}/extension-notified`, { version: request.version, notifiedOn: today() }, privacy).expect(200)).body;
    kinds = ((await get('/core/tasks?asOf=2099-01-01', privacy).expect(200)).body as { kind: string; dueOn: string }[]).filter((t) => t.kind.startsWith('privacy-'));
    expect(kinds.map((t) => t.kind)).toEqual(['privacy-request']);
    expect((await audit('privacy.request-extended'))[0].details).toMatchObject({ requestId: request.id, until: request.extendedUntil });
  });

  it('writes the reply letter from a text block, checks off recipients and closes the request', async () => {
    const reply = await get(`/core/privacy/requests/${request.id}/reply.pdf?text=replyExtension`, privacy).expect(200);
    expect(reply.headers['content-type']).toBe('application/pdf');
    await get(`/core/privacy/requests/${request.id}/reply.pdf?text=rights`, privacy).expect(400);
    expect((await audit('privacy.reply-created'))[0].details).toMatchObject({ requestId: request.id, text: 'replyExtension' });
    request = (await put(`/core/privacy/requests/${request.id}/recipients`, { version: request.version, recipients: [{ id: 'treasury', name: 'Stadtkasse', notifiedOn: today() }] }, privacy).expect(200)).body;
    expect(request.recipients).toEqual([{ id: 'treasury', name: 'Stadtkasse', notifiedOn: today() }]);
    await post(`/core/privacy/requests/${request.id}/close`, { version: request.version, outcome: 'rejected', closedOn: today(), reason: 'zu kurz' }, privacy).expect(400);
    request = (await post(`/core/privacy/requests/${request.id}/close`, { version: request.version, outcome: 'rejected', closedOn: today(), reason: 'Auskunft bereits am Vortag persönlich erteilt' }, privacy).expect(200)).body;
    expect(request).toMatchObject({ status: 'rejected', closedOn: today(), rejectionReason: 'Auskunft bereits am Vortag persönlich erteilt' });
    // Default reply of a rejected request: the rejection letter.
    await get(`/core/privacy/requests/${request.id}/reply.pdf`, privacy).expect(200);
    expect((await audit('privacy.reply-created'))[0].details).toMatchObject({ text: 'replyRejection' });
    expect(((await get('/core/tasks?asOf=2099-01-01', privacy).expect(200)).body as { kind: string }[]).some((t) => t.kind.startsWith('privacy-'))).toBe(false);
    expect((await put(`/core/privacy/requests/${request.id}`, { version: request.version, assigneeId: null, identityChecked: true, identityNote: '', notes: '', language: 'de', activity: '' }, privacy).expect(409)).body.code).toBe('privacy.requestClosed');
    request = (await post(`/core/privacy/requests/${request.id}/reopen`, { version: request.version }, privacy).expect(200)).body;
    expect(request.status).toBe('extended');
    request = (await post(`/core/privacy/requests/${request.id}/close`, { version: request.version, outcome: 'done', closedOn: today() }, privacy).expect(200)).body;
    expect((await get('/core/privacy/requests?state=open', privacy).expect(200)).body).toEqual([]);
    expect(((await get('/core/privacy/requests?state=closed', privacy).expect(200)).body as { id: string }[]).map((r) => r.id)).toContain(request.id);
    // History of the request for the privacy managers.
    expect(((await get(`/core/history/core.privacy_request/${request.id}`, privacy).expect(200)).body as unknown[]).length).toBeGreaterThan(1);
  });

  it('lets members ask for access in "My area", once at a time', async () => {
    let mine = (await get('/core/privacy/me', member).expect(200)).body;
    expect(mine).toMatchObject({ requests: [], selfService: { mode: 'request', contact: 'Markus Vogt, Kommandant' }, dpo: { email: 'datenschutz@musterstadt.example' } });
    mine = (await post('/core/privacy/me/requests', { language: 'en' }, member).expect(201)).body;
    expect(mine.requests).toEqual([expect.objectContaining({ kind: 'access', receivedOn: today(), status: 'received', deadline: addMonthsToDate(today(), 1) })]);
    expect((await post('/core/privacy/me/requests', {}, member).expect(409)).body.code).toBe('privacy.requestOpen');
    expect((await post('/core/privacy/me/requests', {}, reader).expect(400)).body.code).toBe('privacy.noPerson');
    const [created] = (await get(`/core/privacy/requests?personId=${ids.mia}`, privacy).expect(200)).body as PrivacyRequest[];
    expect(created).toMatchObject({ channel: 'my-area', identityChecked: true, language: 'en', accessReportDocumentId: null, createdByName: 'Mia Datenschutz' });
    // Data protection tab of the person file.
    const tab = (await get(`/core/privacy/persons/${ids.mia}`, privacy).expect(200)).body;
    expect(tab.requests).toHaveLength(1);
    expect(tab.notice.acknowledgedAt).not.toBeNull();
    expect((await get(`/core/privacy/persons/${ids.tobias}`, privacy).expect(200)).body.notice).toBeNull();
    await get(`/core/privacy/persons/${ids.mia}`, reader).expect(403);
    // The requests are part of the data access (JSON) of the person.
    const exported = (await get(`/core/export/person/${ids.mia}`).expect(200)).body;
    expect(JSON.stringify(exported)).toContain('"privacyRequests":[{"kind":"access"');
  });
});

describe('restriction of processing (Art. 18)', () => {
  beforeAll(async () => {
    process.env['FORGA_SECRET_KEY'] = randomBytes(32).toString('base64');
    await put('/core/settings/brigade', { name: 'Feuerwehr Musterstadt', publicUrl: 'https://forga.example.org/' }).expect(200);
    ids.station = (await post('/masterdata/stations', { name: 'Feuerwehrhaus Musterstadt', departmentId: ids.musterstadt }).expect(201)).body.id;
  });

  it('restricts with an objection until the decision and hides the person everywhere', async () => {
    // Sandra (probation) has a deadline; Paul is the control person.
    const probationTask = async () => ((await get('/core/tasks?asOf=2099-01-01').expect(200)).body as { subject: { id: string } }[]).some((t) => t.subject.id === ids.sandra);
    expect(await probationTask()).toBe(true);
    const objection = (await post('/core/privacy/requests', { personId: ids.sandra, kind: 'objection', receivedOn: today(), channel: 'email', activity: 'Telefonliste der Abteilung', restrict: true }, privacy).expect(201)).body as PrivacyRequest;
    expect(objection.activity).toBe('Telefonliste der Abteilung');
    const person = (await get(`/masterdata/persons/${ids.sandra}`, privacy).expect(200)).body;
    expect(person.processingRestriction).toMatchObject({ reason: 'objection-pending', requestId: objection.id, until: null });
    expect((await audit('privacy.restricted'))[0].details).toMatchObject({ personId: ids.sandra, reason: 'objection-pending', requestId: objection.id });

    // Person file only with core.privacy.manage (and its step-up).
    expect((await get(`/masterdata/persons/${ids.sandra}`, reader).expect(403)).body.code).toBe('privacy.processingRestricted');
    expect((await get(`/masterdata/persons/${ids.sandra}`, privacyUnconfirmed).expect(403)).body.code).toBe('auth.stepUpRequired');
    await put(`/masterdata/persons/${ids.sandra}`, { ...person, firstName: 'Sandra' }, reader).expect(403);
    // Lists, search, pickers.
    expect(names((await get('/masterdata/persons', reader).expect(200)).body)).not.toContain(ids.sandra);
    expect(names((await get('/masterdata/persons').expect(200)).body)).not.toContain(ids.sandra);
    expect(names((await get('/masterdata/persons', reader).expect(200)).body)).toContain(ids.paul);
    expect(((await get('/core/search?q=Sandra', reader).expect(200)).body as unknown[]).length).toBe(0);
    expect(((await get('/core/search?q=Paul', reader).expect(200)).body as unknown[]).length).toBe(1);
    const options = (await get('/core/lists/respiratory-protection.record/parameters/personId/options?q=Datenschutz').expect(200)).body as { value: string }[];
    expect(options.map((o) => o.value)).not.toContain(ids.sandra);
    const phones = (await get('/core/lists/masterdata.phones').expect(200)).body as { rows: unknown[] };
    expect(JSON.stringify(phones.rows)).not.toContain('Sandra');
    expect(JSON.stringify(phones.rows)).toContain('Paul');
    // Deadlines.
    expect(await probationTask()).toBe(false);
    // Pages of other modules about the person.
    for (const path of [`/incidents/persons/${ids.sandra}/assignments`, `/respiratory-protection/persons/${ids.sandra}`, `/compensation/persons/${ids.sandra}/items`, `/clothing/persons/${ids.sandra}`, `/promotions/persons/${ids.sandra}`]) {
      expect((await get(path, reader)).body.code, path).toBe('privacy.processingRestricted');
    }
    await get(`/incidents/persons/${ids.sandra}/assignments`).expect(200);
    // Nothing new is recorded for the person.
    const session = (await post('/training/sessions', { type: 'exercise', title: 'Übung', startsAt: new Date(Date.now() - 3_600_000).toISOString(), endsAt: new Date(Date.now() + 3_600_000).toISOString(), departmentIds: [ids.musterstadt] }).expect(201)).body;
    expect((await put(`/training/sessions/${session.id}/attendance`, [{ personId: ids.sandra, status: 'present' }]).expect(400)).body.code).toBe('training.unknownPerson');
    await put(`/training/sessions/${session.id}/attendance`, [{ personId: ids.paul, status: 'present' }]).expect(200);
    // Info terminal: name tiles and search.
    const terminal = (await post('/info-terminal/terminals', { stationId: ids.station, name: 'Tablet', departmentIds: [ids.musterstadt] }).expect(201)).body;
    const url = terminal.url as string;
    const opened = await test.http.post('/api/info-terminal/kiosk/session').set(UI).send({ key: url.slice(url.indexOf('#k=') + 3) }).expect(200);
    const device = String(opened.headers['set-cookie']).split(';')[0];
    const tiles = (await test.http.get(`/api/info-terminal/kiosk/members?departmentId=${ids.musterstadt}`).set('Cookie', device).expect(200)).body as { id: string }[];
    expect(names(tiles)).toContain(ids.paul);
    expect(names(tiles)).not.toContain(ids.sandra);
    const found = (await test.http.get(`/api/info-terminal/kiosk/persons?q=Sandra&departmentId=${ids.musterstadt}`).set('Cookie', device).expect(200)).body as unknown[];
    expect(found).toEqual([]);

    // Restricted persons for the privacy page.
    const restricted = (await get('/masterdata/privacy/restricted', privacy).expect(200)).body as { id: string; restriction: { reason: string } }[];
    expect(restricted).toEqual([expect.objectContaining({ id: ids.sandra, restriction: expect.objectContaining({ reason: 'objection-pending' }) })]);
    await get('/masterdata/privacy/restricted', reader).expect(403);
    // Uninformed persons leave restricted ones out.
    expect(((await get('/masterdata/privacy/uninformed', privacy).expect(200)).body as { id: string }[]).map((p) => p.id)).not.toContain(ids.sandra);
  });

  it('turns a planned end into a task and lifts the restriction', async () => {
    await put(`/masterdata/persons/${ids.sandra}/restriction`, { reason: 'retention', until: '2030-12-31' }, reader).expect(403);
    const changed = (await put(`/masterdata/persons/${ids.sandra}/restriction`, { reason: 'retention', until: '2030-12-31' }, privacy).expect(200)).body;
    expect(changed.processingRestriction).toMatchObject({ reason: 'retention', until: '2030-12-31' });
    const tasks = (await get('/core/tasks?asOf=2030-12-20', privacyUnconfirmed).expect(200)).body as { kind: string; subject: { label: string }; to: string }[];
    const ends = tasks.find((t) => t.kind === 'restriction-ends');
    expect(ends).toMatchObject({ to: `/masterdata/persons/${ids.sandra}?tab=privacy`, subject: { label: '2030-12-31' } });
    const lifted = (await del(`/masterdata/persons/${ids.sandra}/restriction`, privacy).expect(200)).body;
    expect(lifted.processingRestriction).toBeNull();
    expect((await audit('privacy.restriction-lifted'))[0].details).toEqual({ personId: ids.sandra });
    expect(names((await get('/masterdata/persons', reader).expect(200)).body)).toContain(ids.sandra);
    await get(`/masterdata/persons/${ids.sandra}`, reader).expect(200);
    expect(((await get('/core/tasks?asOf=2099-01-01').expect(200)).body as { subject: { id: string } }[]).some((t) => t.subject.id === ids.sandra)).toBe(true);
  });
});
