import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccessLog, MailService } from '@forga/core-api';
import { addMonthsToDate, CORE_ROLE_TEMPLATES, type ConsentCatalog, type MyConsents, type PersonConsents, type PrivacyRequest } from '@forga/core-contracts';
import { setUp, startTestApp, type TestApp, UI } from './testing/test-app';

/**
 * Data protection, phase 3 part 2 (concept `dokumentation/geplant/datenschutz.md`): consents (L9), rectification with
 * values removed from the history (L12), read log and transparency of "Anmelden als" (L15).
 */
let test: TestApp;
let admin: string;
let privacy: string;
let privacyUnconfirmed: string;
let commander: string;
let writerB: string;
let auditor: string;
let auditorUnconfirmed: string;
let member: string;
let youth: string;
let memberUserId: string;
const ids: Record<string, string> = {};
const PASSWORD = 'auch-sehr-geheim';

const post = (path: string, body: unknown, cookie = admin) => test.http.post(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const put = (path: string, body: unknown, cookie = admin) => test.http.put(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const del = (path: string, cookie = admin) => test.http.delete(`/api${path}`).set('Cookie', cookie).set(UI);
const get = (path: string, cookie = admin) => test.http.get(`/api${path}`).set('Cookie', cookie);
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
const audit = async (action: string) => (await get(`/core/audit?action=${action}`).expect(200)).body as { details: Record<string, unknown> }[];
const PDF = Buffer.from('%PDF-1.4\n% Nachweis\n');
const attach = (type: string, id: string, cookie: string) => test.http.post(`/api/core/attachments?type=${type}&id=${id}`).set('Cookie', cookie).set(UI).attach('file', PDF, { filename: 'nachweis.pdf', contentType: 'application/pdf' });
const listRows = async (id: string, query: string, cookie: string) => (await get(`/core/lists/${id}?${query}`, cookie).expect(200)).body.rows as Record<string, unknown>[];

async function impersonate(userId: string, reason = 'Ansicht von Mein Bereich prüfen'): Promise<string> {
  const started = await test.http.post(`/api/core/users/${userId}/impersonate`).set('Cookie', admin).set(UI).send({ reason }).expect(200);
  return String(started.headers['set-cookie']).split(',').map((c) => c.trim().split(';')[0]).find((c) => c.startsWith('forga_session='))!;
}
const endImpersonation = (cookie: string) => test.http.post('/api/core/impersonation/end').set('Cookie', cookie).set(UI).expect(200);

beforeAll(async () => {
  test = await startTestApp();
  admin = await setUp(test);
  await post('/masterdata/catalog/templates/bw', {}).expect(201);
  ids.a = (await post('/masterdata/departments', { name: 'Abteilung Musterstadt', shortName: 'Musterstadt', type: 'operational' }).expect(201)).body.id;
  ids.b = (await post('/masterdata/departments', { name: 'Abteilung Nordheim', shortName: 'Nordheim', type: 'operational' }).expect(201)).body.id;
  ids.youth = (await post('/masterdata/departments', { name: 'Jugendfeuerwehr Musterstadt', shortName: 'Jugend', type: 'youth', parentId: ids.a }).expect(201)).body.id;
  const person = async (firstName: string, department: string, extra: Record<string, unknown> = {}) =>
    (await post('/masterdata/persons', { firstName, lastName: 'Einwilligung', status: 'active', phoneMobile: `0170 ${firstName.length}23456`, birthDate: '1990-05-12', memberships: [{ departmentId: department, from: '2020-01-01', primary: true }], ...extra }).expect(201)).body.id as string;
  ids.tobias = await person('Tobias', ids.a);
  ids.sandra = await person('Sandra', ids.a, { birthDate: '1988-03-02' });
  ids.mia = await person('Mia', ids.a, { email: 'mia@example.org' });
  ids.paul = await person('Paul', ids.a);
  ids.nora = await person('Nora', ids.b);
  const year = Number(today().slice(0, 4));
  ids.jonas = await person('Jonas', ids.youth, { birthDate: `${year - 15}-01-10`, status: 'youth', memberships: [{ departmentId: ids.youth, from: `${year - 1}-01-01`, primary: true }] });

  const role = async (name: string, permissions: string[]) => (await post('/core/roles', { name, permissions }).expect(201)).body.id as string;
  const privacyRole = await role('Datenschutz', ['core.privacy.manage', 'masterdata.persons.read']);
  const commanderRole = await role('Abteilungskommandant A', ['core.privacy.consents', 'masterdata.persons.read', 'masterdata.persons.write', 'masterdata.persons.sensitive']);
  const writerRole = await role('Schreiber B', ['masterdata.persons.read', 'masterdata.persons.write']);
  const auditorRole = await role('Prüfer', ['core.audit.read']);
  const memberRole = await role('Mitglied EW', ['masterdata.self']);
  const user = async (username: string, roleId: string, departmentId: string | null, extra: Record<string, unknown> = {}) =>
    (await post('/core/users', { username, displayName: username, password: PASSWORD, roles: [{ roleId, departmentId }], ...extra }).expect(201)).body.id as string;
  await user('dsb', privacyRole, null);
  await user('kommandant', commanderRole, ids.a, { personId: ids.paul });
  await user('schreiber', writerRole, ids.b);
  await user('pruefer', auditorRole, null);
  memberUserId = await user('mia', memberRole, ids.a, { personId: ids.mia, email: 'mia@example.org' });
  await user('jonas', memberRole, ids.a, { personId: ids.jonas });
  const login = (username: string, elevated = true) => test.login({ username, password: PASSWORD }, { elevated });
  privacy = await login('dsb');
  privacyUnconfirmed = await login('dsb', false);
  commander = await login('kommandant');
  writerB = await login('schreiber');
  auditor = await login('pruefer');
  auditorUnconfirmed = await login('pruefer', false);
  member = await login('mia');
  youth = await login('jonas');
});

afterAll(() => test?.app.close());

describe('consents (L9)', () => {
  it('declares core.privacy.consents per department for commanders', async () => {
    const permissions = (await get('/core/permissions').expect(200)).body as { id: string; scope: string; stepUp?: boolean }[];
    expect(permissions.find((p) => p.id === 'core.privacy.consents')).toMatchObject({ scope: 'department' });
    expect(permissions.find((p) => p.id === 'core.privacy.consents')?.stepUp).toBeUndefined();
    for (const key of ['commander', 'department-commander']) expect(CORE_ROLE_TEMPLATES.find((t) => t.key === key)?.permissions).toContain('core.privacy.consents');
  });

  it('keeps a versioned catalog with templates that apply only once reviewed', async () => {
    expect((await get('/core/privacy/consents', privacy).expect(200)).body.consents).toEqual([]);
    await get('/core/privacy/consents', commander).expect(403);
    expect((await get('/core/privacy/consents', privacyUnconfirmed).expect(403)).body.code).toBe('auth.stepUpRequired');
    const inserted = (await post('/core/privacy/consents/templates', {}, privacy).expect(200)).body as ConsentCatalog;
    expect(inserted.consents.map((c) => c.key)).toEqual(['photos-public-relations', 'birthday-posting', 'phone-list-mobile', 'birthday-greeting']);
    expect(inserted.consents.every((c) => c.reviewedAt === null && c.version === 1 && c.text.de.startsWith('[Vorlage]'))).toBe(true);
    expect(inserted.effects.map((e) => e.key)).toEqual(['masterdata.phone-list-mobile', 'masterdata.birthdays-posting']);
    // Inserting again adds nothing; the setting itself is changed only through the catalog endpoints.
    expect((await post('/core/privacy/consents/templates', {}, privacy).expect(200)).body.consents).toHaveLength(4);
    expect((await put('/core/settings/privacy.consents', { consents: [] }, privacy).expect(400)).body.code).toBe('settings.dedicatedEndpoint');

    // Not reviewed: not offered and not recordable.
    expect(((await get(`/core/privacy/persons/${ids.tobias}/consents`, commander).expect(200)).body as PersonConsents).recordable).toEqual([]);
    expect((await post(`/core/privacy/persons/${ids.tobias}/consents`, { key: 'phone-list-mobile', givenOn: today(), via: 'written' }, commander).expect(400)).body.code).toBe('privacy.consentNotApplicable');
    expect(((await get('/core/privacy/me/consents', member).expect(200)).body as MyConsents).consents).toEqual([]);

    for (const c of inserted.consents) await post(`/core/privacy/consents/${c.key}/review`, { version: 1 }, privacy).expect(200);
    const photos = inserted.consents[0];
    // A changed text is a new version and a template again; other fields keep the version.
    const changed = (await put('/core/privacy/consents/photos-public-relations', { ...photos, text: { de: 'Fotos auf der Website der Feuerwehr.', en: 'Photos on the website of the brigade.' }, version: 1 }, privacy).expect(200)).body as ConsentCatalog;
    expect(changed.consents[0]).toMatchObject({ version: 2, reviewedAt: null });
    await put('/core/privacy/consents/photos-public-relations', { ...photos, version: 1 }, privacy).expect(409);
    await post('/core/privacy/consents/photos-public-relations/review', { version: 2 }, privacy).expect(200);
    const toggled = (await put('/core/privacy/consents/birthday-greeting', { ...inserted.consents[3], active: false, version: 1 }, privacy).expect(200)).body as ConsentCatalog;
    expect(toggled.consents[3]).toMatchObject({ version: 1, active: false });
    expect(toggled.consents[3].reviewedAt).not.toBeNull();

    // A new entry; unused entries can be removed.
    await put('/core/privacy/consents/newsletter', { title: { de: 'Rundbrief', en: 'Newsletter' }, text: { de: 'Text', en: 'Text' }, givenBy: 'person' }, privacy).expect(200);
    await put('/core/privacy/consents/Ungültig', { title: { de: 'X', en: 'X' }, text: { de: 'X', en: 'X' }, givenBy: 'person' }, privacy).expect(400);
    expect((await del('/core/privacy/consents/newsletter', privacy).expect(200)).body.consents).toHaveLength(4);
    expect((await audit('privacy.consent-definition-reviewed')).length).toBe(5);
  });

  it('records consents of persons of the own department with proof', async () => {
    const recorded = await post(`/core/privacy/persons/${ids.tobias}/consents`, { key: 'phone-list-mobile', givenOn: today(), via: 'written' }, commander).expect(201);
    expect(recorded.body).toMatchObject({ key: 'phone-list-mobile', version: 1, givenVia: 'written', recordedByName: 'kommandant', withdrawnOn: null });
    ids.tobiasPhone = recorded.body.id;
    await post(`/core/privacy/persons/${ids.tobias}/consents`, { key: 'phone-list-mobile', givenOn: today(), via: 'written' }, commander).expect(409);
    await post(`/core/privacy/persons/${ids.tobias}/consents`, { key: 'birthday-posting', givenOn: '2999-01-01', via: 'written' }, commander).expect(400);
    // Another department: no permission; without any permission neither.
    expect((await post(`/core/privacy/persons/${ids.nora}/consents`, { key: 'phone-list-mobile', givenOn: today(), via: 'written' }, commander).expect(403)).body.code).toBe('auth.forbidden');
    await get(`/core/privacy/persons/${ids.nora}/consents`, commander).expect(403);
    await get(`/core/privacy/persons/${ids.tobias}/consents`, writerB).expect(403);

    await attach('core.consent', ids.tobiasPhone, commander).expect(201);
    await attach('core.consent', ids.tobiasPhone, writerB).expect(404);
    const consents = (await get(`/core/privacy/persons/${ids.tobias}/consents`, privacy).expect(200)).body as PersonConsents;
    expect(consents.consents[0]).toMatchObject({ proofCount: 1, title: { de: 'Handynummer in der Telefonliste der Abteilung' } });
    expect(consents.recordable.map((r) => r.key)).toEqual(['photos-public-relations', 'birthday-posting', 'phone-list-mobile']);

    await post(`/core/privacy/persons/${ids.sandra}/consents`, { key: 'birthday-posting', givenOn: today(), via: 'in-person' }, commander).expect(201);
    expect((await audit('privacy.consent-given')).length).toBe(2);
    // The history of the consent is the proof.
    expect((await get(`/core/history/core.consent/${ids.tobiasPhone}`, commander).expect(200)).body[0]).toMatchObject({ action: 'created' });
    await get(`/core/history/core.consent/${ids.tobiasPhone}`, writerB).expect(404);
  });

  it('asks the legal guardians of minors and lets minors only see their consents', async () => {
    const minor = (await get(`/core/privacy/persons/${ids.jonas}/consents`, commander).expect(200)).body as PersonConsents;
    expect(minor.minor).toBe(true);
    expect((await post(`/core/privacy/persons/${ids.jonas}/consents`, { key: 'photos-public-relations', givenOn: today(), via: 'written' }, commander).expect(400)).body.code).toBe('privacy.consentGuardiansRequired');
    await post(`/core/privacy/persons/${ids.jonas}/consents`, { key: 'photos-public-relations', givenOn: today(), via: 'guardians' }, commander).expect(201);
    const own = (await get('/core/privacy/me/consents', youth).expect(200)).body as MyConsents;
    expect(own.minor).toBe(true);
    expect(own.consents.find((c) => c.key === 'photos-public-relations')?.given).toMatchObject({ via: 'guardians', version: 2 });
    expect((await put('/core/privacy/me/consents/photos-public-relations', { given: false }, youth).expect(403)).body.code).toBe('privacy.consentMinor');
  });

  it('lets members give and withdraw their consents in "My area" and at the first sign-in', async () => {
    const offered = (await get('/core/privacy/me/consents', member).expect(200)).body as MyConsents;
    expect(offered.minor).toBe(false);
    // The inactive greeting is not offered.
    expect(offered.consents.map((c) => c.key)).toEqual(['photos-public-relations', 'birthday-posting', 'phone-list-mobile']);
    expect(offered.consents.every((c) => c.given === null)).toBe(true);
    await put('/core/privacy/me/consents/phone-list-mobile', { given: true, version: 7 }, member).expect(409);
    const given = (await put('/core/privacy/me/consents/phone-list-mobile', { given: true, version: 1 }, member).expect(200)).body as MyConsents;
    expect(given.consents.find((c) => c.key === 'phone-list-mobile')?.given).toMatchObject({ version: 1, via: 'my-area', givenOn: today() });
    const firstLogin = (await put('/core/privacy/me/consents/birthday-posting', { given: true, version: 1, firstLogin: true }, member).expect(200)).body as MyConsents;
    expect(firstLogin.consents.find((c) => c.key === 'birthday-posting')?.given?.via).toBe('first-login');
    const withdrawn = (await put('/core/privacy/me/consents/birthday-posting', { given: false }, member).expect(200)).body as MyConsents;
    expect(withdrawn.consents.find((c) => c.key === 'birthday-posting')).toMatchObject({ given: null, withdrawnOn: today() });
    await put('/core/privacy/me/consents/birthday-greeting', { given: true, version: 1 }, member).expect(400);

    // Not during an impersonation.
    const impersonated = await impersonate(memberUserId);
    expect((await put('/core/privacy/me/consents/birthday-posting', { given: true, version: 1 }, impersonated).expect(403)).body.code).toBe('privacy.ownConsentOnly');
    await endImpersonation(impersonated);
  });

  it('shows the mobile number in the phone list of the department only with consent', async () => {
    const rows = await listRows('masterdata.phones', `departmentId=${ids.a}`, commander);
    const mobile = (first: string) => rows.find((r) => String(r['name']).endsWith(first))?.['phoneMobile'];
    expect(mobile('Tobias')).toBe('0170 623456');
    expect(mobile('Mia')).toBe('0170 323456');
    expect(mobile('Sandra')).toBe('über Gruppenführer');
    expect((await listRows('masterdata.phones', `departmentId=${ids.a}&lang=en`, commander)).find((r) => String(r['name']).endsWith('Sandra'))?.['phoneMobile']).toBe('via group leader');
    // The list of the leaders is part of the brigade's task: with a leader qualification or an office, always with number.
    await post(`/masterdata/persons/${ids.sandra}/offices`, { office: 'secretary', departmentId: ids.a, from: '2024-01-01' }).expect(201);
    const leaders = await listRows('masterdata.phones', `departmentId=${ids.a}&purpose=leaders`, commander);
    expect(leaders.map((r) => r['name'])).toEqual(['Einwilligung, Sandra']);
    expect(leaders[0]['phoneMobile']).toBe('0170 623456');
  });

  it('puts only persons with consent on the birthday list for posting', async () => {
    const query = `from=${today().slice(0, 4)}-01-01&to=${today().slice(0, 4)}-12-31&departmentId=${ids.a}`;
    const internal = await listRows('masterdata.birthdays', `${query}&purpose=internal`, commander);
    expect(internal).toHaveLength(4);
    const posting = await listRows('masterdata.birthdays', `${query}&purpose=posting`, commander);
    expect(posting.map((r) => r['name'])).toEqual(['Einwilligung, Sandra']);
  });

  it('closes a request "withdrawal of consent" by withdrawing', async () => {
    const request = (await post('/core/privacy/requests', { personId: ids.tobias, kind: 'consent-withdrawal', receivedOn: today(), channel: 'letter' }, privacy).expect(201)).body as PrivacyRequest;
    // Only the request of the same person, and only data protection may close it.
    const other = (await post('/core/privacy/requests', { personId: ids.sandra, kind: 'consent-withdrawal', receivedOn: today(), channel: 'letter' }, privacy).expect(201)).body as PrivacyRequest;
    expect((await post(`/core/privacy/given-consents/${ids.tobiasPhone}/withdraw`, { withdrawnOn: today(), via: 'written', requestId: other.id }, privacy).expect(400)).body.code).toBe('privacy.requestMismatch');
    await post(`/core/privacy/given-consents/${ids.tobiasPhone}/withdraw`, { withdrawnOn: today(), via: 'written', requestId: request.id }, commander).expect(403);
    const withdrawn = await post(`/core/privacy/given-consents/${ids.tobiasPhone}/withdraw`, { withdrawnOn: today(), via: 'written', requestId: request.id }, privacy).expect(200);
    expect(withdrawn.body).toMatchObject({ withdrawnOn: today(), withdrawnVia: 'request', requestId: request.id });
    expect((await get(`/core/privacy/requests/${request.id}`, privacy).expect(200)).body).toMatchObject({ status: 'done', closedOn: today() });
    await post(`/core/privacy/given-consents/${ids.tobiasPhone}/withdraw`, { withdrawnOn: today(), via: 'written' }, privacy).expect(409);
    expect((await audit('privacy.consent-withdrawn'))[0].details).toMatchObject({ personId: ids.tobias, key: 'phone-list-mobile', via: 'request', requestId: request.id });
    // Withdrawn: the number disappears again.
    const rows = await listRows('masterdata.phones', `departmentId=${ids.a}`, commander);
    expect(rows.find((r) => String(r['name']).endsWith('Tobias'))?.['phoneMobile']).toBe('über Gruppenführer');
    // Never deleted.
    expect(((await get(`/core/privacy/persons/${ids.tobias}/consents`, privacy).expect(200)).body as PersonConsents).consents).toHaveLength(1);
  });

  it('keeps the version consented to until the person consents again', async () => {
    const catalog = (await get('/core/privacy/consents', privacy).expect(200)).body as ConsentCatalog;
    expect(catalog.given).toMatchObject({ 'phone-list-mobile': 1, 'birthday-posting': 1, 'photos-public-relations': 1 });
    const entry = catalog.consents.find((c) => c.key === 'phone-list-mobile')!;
    await put('/core/privacy/consents/phone-list-mobile', { ...entry, title: { de: 'Handynummer in der Telefonliste', en: 'Mobile number in the phone list' }, version: 1 }, privacy).expect(200);
    await post('/core/privacy/consents/phone-list-mobile/review', { version: 2 }, privacy).expect(200);
    const mine = (await get('/core/privacy/me/consents', member).expect(200)).body as MyConsents;
    expect(mine.consents.find((c) => c.key === 'phone-list-mobile')).toMatchObject({ version: 2, given: { version: 1 } });
    await put('/core/privacy/me/consents/phone-list-mobile', { given: true, version: 2 }, member).expect(200);
    const consents = ((await get(`/core/privacy/persons/${ids.mia}/consents`, privacy).expect(200)).body as PersonConsents).consents.filter((c) => c.key === 'phone-list-mobile');
    expect(consents.map((c) => c.version).toSorted()).toEqual([1, 2]);
    expect(consents.find((c) => c.version === 1)?.title.de).toBe('Handynummer in der Telefonliste der Abteilung');
    expect((await get('/core/privacy/consents', privacy).expect(200)).body.given['phone-list-mobile']).toBe(1);
    await del('/core/privacy/consents/phone-list-mobile', privacy).expect(409);
  });

  it('puts consents into the access report and the JSON export', async () => {
    const sections = (await get(`/core/privacy/access-reports/preview?personId=${ids.mia}`, privacy).expect(200)).body as { key: string; entries: number }[];
    expect(sections.find((s) => s.key === 'core.consents')?.entries).toBe(3);
    const exported = JSON.parse((await get(`/core/export/person/${ids.mia}`).expect(200)).text);
    expect(exported.data.core.consents.map((c: { key: string; version: number }) => `${c.key}:${c.version}`)).toEqual(expect.arrayContaining(['phone-list-mobile:1', 'phone-list-mobile:2', 'birthday-posting:1']));
  });
});

describe('rectification (L12)', () => {
  it('creates a request with deadline and a task for the responsible persons of the department', async () => {
    const asked = await post('/core/privacy/me/rectifications', { area: 'masterdata', wrong: 'Lehrgang Maschinist fehlt', correct: 'Maschinist bestanden am 12.03.2025' }, member).expect(201);
    ids.rectification = asked.body.id;
    await attach('core.privacy-request', ids.rectification, member).expect(201);
    const request = (await get(`/core/privacy/requests/${ids.rectification}`, privacy).expect(200)).body as PrivacyRequest;
    expect(request).toMatchObject({ kind: 'rectification', channel: 'my-area', identityChecked: true, dueOn: addMonthsToDate(today(), 1) });
    expect(request.rectification).toMatchObject({ area: 'masterdata', areaLabel: { de: 'Stammdaten' }, wrong: 'Lehrgang Maschinist fehlt', correctedAt: null });
    expect((await get('/core/privacy/me', member).expect(200)).body.requests[0].rectification).toMatchObject({ areaLabel: { de: 'Stammdaten' }, wrong: 'Lehrgang Maschinist fehlt' });

    const task = ((await get('/core/tasks', commander).expect(200)).body as { kind: string; title: { de: string }; to: string }[]).find((t) => t.kind === 'privacy-rectification');
    expect(task).toMatchObject({ title: { de: 'Berichtigung prüfen: Stammdaten' }, to: `/privacy/rectifications/${ids.rectification}` });
    expect(((await get('/core/tasks', writerB).expect(200)).body as { kind: string }[]).some((t) => t.kind === 'privacy-rectification')).toBe(false);
    expect(((await get('/core/tasks', privacy).expect(200)).body as { kind: string }[]).some((t) => t.kind === 'privacy-request')).toBe(true);

    // The proof: the person, data protection and the responsible persons, nobody else.
    expect((await get(`/core/attachments?type=core.privacy-request&id=${ids.rectification}`, commander).expect(200)).body).toHaveLength(1);
    await get(`/core/attachments?type=core.privacy-request&id=${ids.rectification}`, writerB).expect(404);
    await attach('core.privacy-request', ids.rectification, youth).expect(404);
  });

  it('is checked and marked as corrected by the department', async () => {
    const view = await get(`/core/privacy/rectifications/${ids.rectification}`, commander).expect(200);
    expect(view.body).toMatchObject({ personName: 'Einwilligung, Mia', rectification: { correct: 'Maschinist bestanden am 12.03.2025' } });
    await get(`/core/privacy/rectifications/${ids.rectification}`, writerB).expect(404);
    await post(`/core/privacy/rectifications/${ids.rectification}/corrected`, {}, writerB).expect(404);
    const corrected = await post(`/core/privacy/rectifications/${ids.rectification}/corrected`, {}, commander).expect(200);
    expect(corrected.body.rectification).toMatchObject({ correctedByName: 'kommandant' });
    expect(corrected.body.rectification.correctedAt).toBeTruthy();
    await post(`/core/privacy/rectifications/${ids.rectification}/corrected`, {}, commander).expect(409);
    expect(((await get('/core/tasks', commander).expect(200)).body as { kind: string }[]).some((t) => t.kind === 'privacy-rectification')).toBe(false);
    // The request stays with data protection until it is closed.
    expect((await get(`/core/privacy/requests/${ids.rectification}`, privacy).expect(200)).body.status).toBe('received');
    expect((await audit('privacy.rectification-corrected'))[0].details).toMatchObject({ requestId: ids.rectification, area: 'masterdata' });
  });

  it('refuses invalid input, foreign sessions and members without person', async () => {
    await post('/core/privacy/me/rectifications', { area: 'Stammdaten', wrong: 'x', correct: 'y' }, member).expect(400);
    await post('/core/privacy/me/rectifications', { area: 'other', wrong: '', correct: 'y' }, member).expect(400);
    expect((await post('/core/privacy/me/rectifications', { area: 'other', wrong: 'x', correct: 'y' }, privacy).expect(400)).body.code).toBe('privacy.noPerson');
    const impersonated = await impersonate(memberUserId);
    expect((await post('/core/privacy/me/rectifications', { area: 'other', wrong: 'x', correct: 'y' }, impersonated).expect(403)).body.code).toBe('privacy.ownRequestOnly');
    await endImpersonation(impersonated);
  });

  it('removes a wrong value from the history with a reason', async () => {
    const request = (await get(`/core/privacy/requests/${ids.rectification}`, privacy).expect(200)).body as PrivacyRequest;
    await put(`/core/privacy/requests/${ids.rectification}`, { ...request, notes: 'Falsches Datum 01.01.1900 notiert' }, privacy).expect(200);
    const history = (await get(`/core/history/core.privacy_request/${ids.rectification}`, privacy).expect(200)).body as { id: string; changes: Record<string, { old: unknown; new: unknown; redactedNew?: string }> }[];
    const entry = history.find((h) => h.changes['notes'])!;
    const redact = (body: object, cookie = privacy) => post(`/core/history/entries/${entry.id}/redact`, body, cookie);
    await redact({ field: 'notes', side: 'new', reason: 'zu kurz' }).expect(400);
    expect((await redact({ field: 'unbekannt', side: 'new', reason: 'Wert war nachweislich falsch' }).expect(400)).body.code).toBe('history.unknownField');
    expect((await redact({ field: 'notes', side: 'old', reason: 'Wert war nachweislich falsch' }).expect(400)).body.code).toBe('history.nothingToRedact');
    expect((await redact({ field: 'notes', side: 'new', reason: 'Wert war nachweislich falsch' }, privacyUnconfirmed).expect(403)).body.code).toBe('auth.stepUpRequired');
    await redact({ field: 'notes', side: 'new', reason: 'Wert war nachweislich falsch' }, commander).expect(403);
    await redact({ field: 'notes', side: 'new', reason: 'Wert war nachweislich falsch' }).expect(200);
    expect((await redact({ field: 'notes', side: 'new', reason: 'Wert war nachweislich falsch' }).expect(409)).body.code).toBe('history.alreadyRedacted');
    const after = ((await get(`/core/history/core.privacy_request/${ids.rectification}`, privacy).expect(200)).body as typeof history).find((h) => h.id === entry.id)!;
    expect(after.changes['notes']).toMatchObject({ old: '', new: null });
    expect(after.changes['notes'].redactedNew).toBeTruthy();
    const logged = (await audit('privacy.history-redacted'))[0];
    expect(logged.details).toMatchObject({ entity: 'core.privacy_request', field: 'notes', side: 'new', reason: 'Wert war nachweislich falsch' });
    expect(JSON.stringify(logged.details)).not.toContain('1900');
  });
});

describe('read log (L15)', () => {
  it('logs reads of sensitive person data per user, person and day', async () => {
    await get(`/masterdata/persons/${ids.tobias}`, commander).expect(200);
    await get(`/masterdata/persons/${ids.tobias}`, commander).expect(200);
    // Own data is not logged; reads without the sensitive fields neither.
    await get(`/masterdata/persons/${ids.paul}`, commander).expect(200);
    await get(`/masterdata/persons/${ids.nora}`, writerB).expect(200);
    const rows = (await get(`/core/access-log?personId=${ids.tobias}&area=masterdata.person-sensitive`, auditor).expect(200)).body as { userName: string; count: number; areaLabel: { de: string }; personName: string; day: string }[];
    expect(rows).toEqual([expect.objectContaining({ userName: 'kommandant', count: 2, personName: 'Einwilligung, Tobias', day: today(), areaLabel: { de: 'Personalakte mit sensiblen Feldern', en: 'Person file with sensitive fields' } })]);
    expect((await get(`/core/access-log?personId=${ids.paul}`, auditor).expect(200)).body).toEqual([]);
    expect((await get(`/core/access-log?personId=${ids.nora}`, auditor).expect(200)).body).toEqual([]);
  });

  it('logs lists with contact data, access reports and exports', async () => {
    const rows = (await get(`/core/access-log?area=masterdata.lists&personId=${ids.sandra}`, auditor).expect(200)).body as { count: number }[];
    expect(rows[0].count).toBeGreaterThanOrEqual(3);
    await get(`/core/export/person/${ids.sandra}`).expect(200);
    await get('/core/export/masterdata').expect(200);
    const exports = (await get('/core/access-log?area=core.export', auditor).expect(200)).body as { personId: string | null }[];
    expect(exports.map((r) => r.personId)).toEqual(expect.arrayContaining([ids.sandra, ids.mia, null]));
    const filters = (await get('/core/access-log/filters', auditor).expect(200)).body as { users: { name: string }[]; areas: { key: string }[] };
    expect(filters.users.map((u) => u.name)).toEqual(expect.arrayContaining(['Admin', 'kommandant']));
    expect(filters.areas.map((a) => a.key)).toEqual(expect.arrayContaining(['masterdata.lists', 'respiratory-protection.examinations', 'core.access-report']));
    // The service for other features (e.g. data breaches).
    expect((await test.app.get(AccessLog).query({ personId: ids.sandra, from: today(), to: today() })).length).toBeGreaterThanOrEqual(2);
  });

  it('logs reads of medical examinations', async () => {
    await post('/respiratory-protection/evidence', { personId: ids.tobias, kind: 'examination', date: today(), validUntil: addMonthsToDate(today(), 12), result: 'no-concerns' }).expect(201);
    await get(`/respiratory-protection/persons/${ids.tobias}`).expect(200);
    const rows = (await get(`/core/access-log?personId=${ids.tobias}&area=respiratory-protection.examinations`, auditor).expect(200)).body as { userName: string; areaLabel: { de: string } }[];
    expect(rows).toEqual([expect.objectContaining({ userName: 'Admin', areaLabel: expect.objectContaining({ de: 'Eignungsuntersuchungen (Gesundheitsdaten)' }) })]);
  });

  it('is readable only with core.audit.read after the step-up', async () => {
    await get('/core/access-log', commander).expect(403);
    expect((await get('/core/access-log', auditorUnconfirmed).expect(403)).body.code).toBe('auth.stepUpRequired');
  });

  it('has its own retention category of 12 months and appears in the access report', async () => {
    const categories = (await get('/core/retention/categories').expect(200)).body as { key: string; defaultRule: { action: string; years: number | null } }[];
    expect(categories.find((c) => c.key === 'core.access-log')?.defaultRule).toMatchObject({ years: 1, action: 'delete' });
    const sections = (await get(`/core/privacy/access-reports/preview?personId=${ids.tobias}`, privacy).expect(200)).body as { key: string; entries: number }[];
    expect(sections.find((s) => s.key === 'core.access-log')?.entries).toBeGreaterThanOrEqual(2);
  });
});

describe('logins as a user (L15)', () => {
  it('tells the user by e-mail and lists the logins with administrator and reason', async () => {
    const mail = test.app.get(MailService);
    const before = mail.sent.length;
    const impersonated = await impersonate(memberUserId, 'Fehlende Dienste prüfen');
    expect(mail.sent.slice(before)).toEqual([expect.objectContaining({ to: 'mia@example.org', subject: 'f.orga: Ein Administrator hat sich als Sie angemeldet' })]);
    expect(mail.sent.at(-1)?.text).toContain('Fehlende Dienste prüfen');
    const during = (await get('/core/me/impersonations', impersonated).expect(200)).body as { endedAt: string | null }[];
    expect(during[0].endedAt).toBeNull();
    await endImpersonation(impersonated);
    const logins = (await get('/core/me/impersonations', member).expect(200)).body as { administrator: string; reason: string; endedAt: string | null }[];
    expect(logins[0]).toMatchObject({ administrator: 'Admin', reason: 'Fehlende Dienste prüfen' });
    expect(logins[0].endedAt).toBeTruthy();
    expect(logins.length).toBeGreaterThanOrEqual(3);
    expect((await get('/core/me/impersonations', youth).expect(200)).body).toEqual([]);
  });

  it('sends no e-mail when switched off and still needs a reason', async () => {
    await put('/core/settings/security', { mailHealthWithoutNames: true, mailAllWithoutNames: false, notifyImpersonation: false }, privacy).expect(200);
    const mail = test.app.get(MailService);
    const before = mail.sent.length;
    const impersonated = await impersonate(memberUserId);
    expect(mail.sent.length).toBe(before);
    await endImpersonation(impersonated);
    await test.http.post(`/api/core/users/${memberUserId}/impersonate`).set('Cookie', admin).set(UI).send({ reason: '' }).expect(400);
  });
});
