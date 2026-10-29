import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EntityManager } from '@mikro-orm/core';
import { MailService, PrivacyRegister, Setting } from '@forga/core-api';
import type { AffectedPersons, BreachSourceEntry, PrivacyBreach, PrivacyRequest, ProcessingRegister, RecipientOption } from '@forga/core-contracts';
import { setUp, startTestApp, type TestApp, UI, TOKEN_FIELDS } from './testing/test-app';

/**
 * Data protection, phase 3 part 1 (concept `dokumentation/geplant/datenschutz.md`): register of processing activities
 * with technical measures (L8) and data breaches with the helpers to determine affected persons (L20).
 */
let test: TestApp;
let admin: string;
let privacy: string;
let privacyUnconfirmed: string;
let reader: string;
let readerId: string;
const ids: Record<string, string> = {};
const PASSWORD = 'auch-sehr-geheim';

const post = (path: string, body: unknown, cookie = admin) => test.http.post(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const put = (path: string, body: unknown, cookie = admin) => test.http.put(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const get = (path: string, cookie = admin) => test.http.get(`/api${path}`).set('Cookie', cookie);
const binary = (path: string, cookie = privacy) =>
  test.http
    .get(`/api${path}`)
    .set('Cookie', cookie)
    .buffer(true)
    .parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => done(null, Buffer.concat(chunks)));
    });
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
const audit = async (action: string) => (await get(`/core/audit?action=${action}`).expect(200)).body as { userId: string | null; details: Record<string, unknown> }[];
const register = async (cookie = privacy) => (await get('/core/privacy/register', cookie).expect(200)).body as ProcessingRegister;
const activity = (r: ProcessingRegister, key: string) => r.activities.find((a) => a.key === key)!;
const tasks = async (cookie = privacy) => (await get('/core/tasks?asOf=2099-01-01', cookie).expect(200)).body as { id: string; kind: string; dueOn: string; title: { de: string } }[];

beforeAll(async () => {
  test = await startTestApp();
  admin = await setUp(test);
  ids.musterstadt = (await post('/masterdata/departments', { name: 'Abteilung Musterstadt', shortName: 'Musterstadt', type: 'operational' }).expect(201)).body.id;
  ids.berghausen = (await post('/masterdata/departments', { name: 'Abteilung Berghausen', shortName: 'Berghausen', type: 'operational' }).expect(201)).body.id;
  const person = async (firstName: string, departmentId: string) =>
    (
      await post('/masterdata/persons', {
        firstName,
        lastName: 'Verzeichnis',
        status: 'active',
        street: 'Am Weiher 3',
        postalCode: '12345',
        city: 'Musterstadt',
        email: `${firstName.toLowerCase()}@example.org`,
        phoneMobile: '0170 0000000',
        memberships: [{ departmentId, from: '2020-01-01', primary: true }],
      }).expect(201)
    ).body.id as string;
  ids.tobias = await person('Tobias', ids.musterstadt);
  ids.sandra = await person('Sandra', ids.musterstadt);
  ids.paul = await person('Paul', ids.berghausen);

  const role = async (name: string, permissions: string[]) => (await post('/core/roles', { name, permissions }).expect(201)).body.id as string;
  const privacyRole = await role('Datenschutz', ['core.privacy.manage', 'masterdata.persons.read']);
  const readerRole = await role('Leser Abteilung', ['masterdata.persons.read']);
  await post('/core/users', { username: 'dsb', displayName: 'Datenschutz Verwaltung', email: 'dsb@example.org', password: PASSWORD, roles: [{ roleId: privacyRole, departmentId: null }] }).expect(201);
  readerId = (await post('/core/users', { username: 'leser', displayName: 'Leser Musterstadt', password: PASSWORD, roles: [{ roleId: readerRole, departmentId: ids.musterstadt }] }).expect(201)).body.id;
  privacy = await test.login({ username: 'dsb', password: PASSWORD });
  privacyUnconfirmed = await test.login({ username: 'dsb', password: PASSWORD }, { elevated: false });
  reader = await test.login({ username: 'leser', password: PASSWORD });
});

afterAll(() => test?.app.close());

describe('register of processing activities (L8)', () => {
  it('needs core.privacy.manage with the second factor', async () => {
    expect((await get('/core/privacy/register', reader).expect(403)).body.code).toBe('auth.forbidden');
    expect((await get('/core/privacy/register', privacyUnconfirmed).expect(403)).body.code).toBe('auth.stepUpRequired');
  });

  it('composes the draft from the activities of the active modules with retention, recipients and categories', async () => {
    await put('/core/settings/privacy', { retention: { 'masterdata.person-file': { years: 30, action: 'delete' } } }).expect(200);
    let r = await register();
    expect(r.activities.map((a) => a.key)).toEqual(expect.arrayContaining(['masterdata.persons', 'incidents.reports', 'respiratory-protection.fitness', 'cost-recovery.notices', 'core.accounts']));
    expect(r.activities.at(-1)!.key).toBe('core.accounts');
    const incidents = activity(r, 'incidents.reports');
    expect(incidents).toMatchObject({ health: true, module: { id: 'incidents' }, record: { version: 1, reviewedAt: null } });
    expect(incidents.subjects.map((s) => s.de)).toContain('Beteiligte (Geschädigte, Verursacher, Zeugen, Anrufer)');
    expect(incidents.legalBasisHint?.de).toContain('FwG');
    expect(activity(r, 'masterdata.persons').retention.de).toContain('30 Jahre nach');
    expect(activity(r, 'training.sessions').retention.de).toContain('bis zur Festlegung einer Frist');
    expect(activity(r, 'compensation.payouts').recipients.map((x) => x.source)).toEqual(['module']);

    // Only active modules.
    await put('/core/modules/cost-recovery', { active: false }).expect(200);
    r = await register();
    expect(r.activities.map((a) => a.key)).not.toContain('cost-recovery.notices');
    await put('/core/modules/cost-recovery', { active: true }).expect(200);
  });

  it('names API tokens, the e-mail server and the sign-in service as recipients', async () => {
    const token = (await post('/core/tokens', { ...TOKEN_FIELDS, name: 'Leitstelle (Beispiel)', scopes: ['incidents.reports.read'] }).expect(201)).body;
    ids.token = token.id;
    ids.tokenSecret = token.token;
    await put('/core/settings/smtp', { host: 'mail.example.org', port: 587, starttls: true, username: '', sender: 'forga@example.org' }).expect(200);
    await put('/core/settings/oidc', { enabled: true, issuer: 'https://login.example.org/realm', clientId: 'forga', clientSecret: 'geheim' }).expect(200);
    const r = await register();
    expect(activity(r, 'incidents.reports').recipients).toContainEqual({ id: `token:${token.id}`, name: { de: 'Schnittstelle „Leitstelle (Beispiel)“ – Testsystem (Beispiel)', en: 'Interface "Leitstelle (Beispiel)" – Testsystem (Beispiel)' }, note: 'Integrationstest', source: 'token' });
    expect(activity(r, 'masterdata.persons').recipients.some((x) => x.source === 'token')).toBe(false);
    expect(r.processors.map((p) => p.id)).toEqual(['processor:hosting', 'processor:smtp', 'processor:oidc']);
    expect(r.processors[2].name.de).toContain('login.example.org');
    expect(activity(r, 'core.accounts').recipients.map((x) => x.id)).toEqual(expect.arrayContaining(['processor:smtp', 'processor:oidc']));
  });

  it('describes the technical measures with the current state', async () => {
    const r = await register();
    const measure = (key: string) => r.measures.find((m) => m.key === key);
    // The test request comes over plain HTTP.
    expect(measure('core.https')).toMatchObject({ tone: 'warning', value: { de: 'nein – Aufruf über http://' } });
    expect(measure('core.step-up')?.value.de).toMatch(/Step-up|FORGA_SECRET_KEY/);
    expect(measure('core.mail')?.value.de).toContain('mail.example.org');
    expect(measure('core.protocols')?.value.de).toContain('Audit-Log: 2 Jahre nach Eintrag');
    expect(measure('core.access-log')?.value.de).toContain('Leseprotokoll: 1 Jahr nach');
    // The backup module without a folder: not set up.
    expect(measure('backup.state')).toMatchObject({ tone: 'warning', value: { de: 'nicht eingerichtet' } });
    await put('/core/modules/backup', { active: false }).expect(200);
    expect((await register()).measures.some((m) => m.key === 'backup.state')).toBe(false);
    await put('/core/modules/backup', { active: true }).expect(200);
  });

  it('keeps the municipality’s part per activity, versioned, historized and reviewed', async () => {
    expect((await put('/core/settings/privacy.activities', {}, privacy).expect(400)).body.code).toBe('settings.dedicatedEndpoint');
    const input = { version: 1, legalBasis: '§ 2 FwG in Verbindung mit der Feuerwehrsatzung (Beispiel)', recipients: [{ id: 'insurance', name: 'Unfallkasse (Beispiel)', note: 'bei Dienstunfällen' }], thirdCountry: '', remarks: 'mit dem DSB am 15.09. besprochen' };
    expect((await put('/core/privacy/register/activities/unknown.activity', input, privacy).expect(404)).body.code).toBe('privacy.activityUnknown');
    let r = (await put('/core/privacy/register/activities/masterdata.persons', input, privacy).expect(200)).body as ProcessingRegister;
    expect(activity(r, 'masterdata.persons').record).toMatchObject({ version: 2, legalBasis: input.legalBasis, changedBy: 'Datenschutz Verwaltung', reviewedAt: null });
    expect(activity(r, 'masterdata.persons').recipients).toContainEqual({ id: 'insurance', name: { de: 'Unfallkasse (Beispiel)', en: 'Unfallkasse (Beispiel)' }, note: 'bei Dienstunfällen', source: 'municipality' });
    expect((await put('/core/privacy/register/activities/masterdata.persons', input, privacy).expect(409)).body.code).toBe('conflict.stale');
    expect((await post('/core/privacy/register/activities/masterdata.persons/review', { version: 1 }, privacy).expect(409)).body.code).toBe('conflict.stale');
    r = (await post('/core/privacy/register/activities/masterdata.persons/review', { version: 2 }, privacy).expect(200)).body;
    expect(activity(r, 'masterdata.persons').record).toMatchObject({ version: 2, reviewedBy: 'Datenschutz Verwaltung' });
    // A change makes it a draft again.
    r = (await put('/core/privacy/register/activities/masterdata.persons', { ...input, version: 2, remarks: 'geändert' }, privacy).expect(200)).body;
    expect(activity(r, 'masterdata.persons').record).toMatchObject({ version: 3, reviewedAt: null });
    expect((await audit('privacy.activity-changed')).map((e) => e.details)).toContainEqual({ activity: 'masterdata.persons', version: 2 });
    expect((await audit('privacy.activity-reviewed')).map((e) => e.details)).toContainEqual({ activity: 'masterdata.persons', version: 2 });
    const history = (await get('/core/history/core.setting/privacy.activities', privacy).expect(200)).body as unknown[];
    expect(history.length).toBeGreaterThanOrEqual(3);
  });

  it('moves the former recipients list (privacy.recipients) into the register', async () => {
    const em = test.app.get(EntityManager).fork();
    em.create(Setting, { section: 'privacy.recipients', value: { recipients: [{ id: 'treasury', name: 'Stadtkasse (Beispiel)', note: 'Bankverbindung' }, { id: '', name: 'ungültig' }] } });
    await em.flush();
    expect(await test.app.get(PrivacyRegister).migrateLegacyRecipients()).toBe(1);
    expect(await test.app.get(EntityManager).fork().findOne(Setting, { section: 'privacy.recipients' })).toBeNull();
    expect((await register()).general).toEqual([{ id: 'treasury', name: 'Stadtkasse (Beispiel)', note: 'Bankverbindung' }]);
    // Running again changes nothing.
    expect(await test.app.get(PrivacyRegister).migrateLegacyRecipients()).toBe(0);
    await get('/core/settings/privacy.recipients', privacy).expect(404);
  });

  it('offers the recipients of the register for Art. 19 and the activities for an objection', async () => {
    const options = (await get('/core/privacy/register/recipients', privacy).expect(200)).body as RecipientOption[];
    expect(options.find((o) => o.id === 'treasury')).toMatchObject({ source: 'general', activities: [] });
    expect(options.find((o) => o.id === 'insurance')?.activities.map((a) => a.de)).toEqual(['Personalverwaltung']);
    expect(options.find((o) => o.id === `token:${ids.token}`)?.source).toBe('token');
    expect(options.some((o) => o.id.startsWith('processor:'))).toBe(false);

    const activities = (await get('/core/privacy/register/activities', privacy).expect(200)).body as { key: string }[];
    expect(activities.map((a) => a.key)).toContain('masterdata.persons');
    const objection = { personId: ids.sandra, kind: 'objection', receivedOn: today(), channel: 'letter', activity: 'Telefonliste' };
    expect((await post('/core/privacy/requests', { ...objection, activityKey: 'unknown.activity' }, privacy).expect(400)).body.code).toBe('privacy.activityUnknown');
    const request = (await post('/core/privacy/requests', { ...objection, activityKey: 'masterdata.persons' }, privacy).expect(201)).body as PrivacyRequest;
    expect(request).toMatchObject({ activityKey: 'masterdata.persons', activityName: { de: 'Personalverwaltung', en: 'Personnel administration' }, activity: 'Telefonliste' });
    const updated = (await put(`/core/privacy/requests/${request.id}`, { version: request.version, assigneeId: null, identityChecked: true, identityNote: '', notes: '', language: 'de', activityKey: 'incidents.reports', activity: '' }, privacy).expect(200)).body as PrivacyRequest;
    expect(updated.activityName?.de).toBe('Einsatzdokumentation');
    const reply = await binary(`/core/privacy/requests/${request.id}/reply.pdf`).expect(200);
    expect((reply.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });

  it('exports the register as PDF and Excel', async () => {
    const pdf = await binary('/core/privacy/register/export/pdf?language=de').expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    const xlsx = await binary('/core/privacy/register/export/xlsx?language=en').expect(200);
    expect((xlsx.body as Buffer).subarray(0, 2).toString()).toBe('PK');
    await binary('/core/privacy/register/export/docx').expect(404);
    expect((await audit('privacy.register-exported')).map((e) => e.details)).toEqual(expect.arrayContaining([{ format: 'pdf', language: 'de' }, { format: 'xlsx', language: 'en' }]));
  });
});

const base = () => ({
  title: 'Ausdruck der Telefonliste im Gerätehaus verloren (Beispiel)',
  discoveredAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
  description: 'Ein Ausdruck lag offen im Schulungsraum.',
  activityKeys: ['masterdata.persons'],
  dataCategories: 'Name, Mobilnummer',
});

describe('data breaches (L20)', () => {
  let breach: PrivacyBreach;

  it('records a breach with the 72-hour deadline as task and an e-mail without content', async () => {
    expect((await post('/core/privacy/breaches', base(), reader).expect(403)).body.code).toBe('auth.forbidden');
    expect((await post('/core/privacy/breaches', { ...base(), discoveredAt: new Date(Date.now() + 86_400_000).toISOString() }, privacy).expect(400)).body.code).toBe('privacy.discoveredInFuture');
    expect((await post('/core/privacy/breaches', { ...base(), activityKeys: ['unknown.activity'] }, privacy).expect(400)).body.code).toBe('privacy.activityUnknown');
    await post('/core/privacy/breaches', { ...base(), title: 'x' }, privacy).expect(400);
    const mails = test.app.get(MailService).sent.length;
    breach = (await post('/core/privacy/breaches', base(), privacy).expect(201)).body;
    expect(breach).toMatchObject({ status: 'open', createdByName: 'Datenschutz Verwaltung', version: 1 });
    expect(new Date(breach.notifyBy).getTime() - new Date(breach.discoveredAt).getTime()).toBe(72 * 3_600_000);
    expect((await audit('privacy.breach-recorded'))[0].details).toEqual({ breachId: breach.id });
    const sent = test.app.get(MailService).sent.slice(mails);
    expect(sent.map((m) => m.to)).toEqual(['dsb@example.org']);
    expect(sent[0].text).not.toContain('Telefonliste');
    // The task names no content and shows up also before the step-up.
    const task = (await tasks(privacyUnconfirmed)).find((t) => t.id === `core:privacy-breach:${breach.id}` || t.id.endsWith(`privacy-breach:${breach.id}`));
    expect(task).toMatchObject({ kind: 'privacy-breach', dueOn: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date(breach.notifyBy)) });
    expect(task?.title.de).not.toContain('Telefonliste');
    expect((await tasks(reader)).some((t) => t.kind === 'privacy-breach')).toBe(false);
    const history = (await get(`/core/history/core.privacy_breach/${breach.id}`, privacy).expect(200)).body as unknown[];
    expect(history.length).toBe(1);
    await get(`/core/history/core.privacy_breach/${breach.id}`, reader).expect(404);
  });

  it('records the notification of the authority and of the persons', async () => {
    const update = { ...base(), version: breach.version, risk: 'high' as const };
    expect((await put(`/core/privacy/breaches/${breach.id}`, { ...update, authorityNotifiedOn: '2000-01-01' }, privacy).expect(400)).body.code).toBe('privacy.notifiedBeforeDiscovered');
    expect((await put(`/core/privacy/breaches/${breach.id}`, { ...update, subjectsNotifiedOn: today() }, privacy).expect(400)).body.code).toBe('privacy.notificationWayMissing');
    expect((await put(`/core/privacy/breaches/${breach.id}`, { ...update, authorityNotifiedOn: today(), authorityNotRequired: true }, privacy).expect(400)).body.code).toBe('privacy.authorityNotifiedAndNotRequired');
    expect((await post(`/core/privacy/breaches/${breach.id}/close`, { version: breach.version, closedOn: today() }, privacy).expect(400)).body.code).toBe('privacy.breachAuthorityOpen');
    breach = (await put(`/core/privacy/breaches/${breach.id}`, { ...update, authorityNotifiedOn: today(), authorityReference: 'LfDI-2026-0815 (Beispiel)' }, privacy).expect(200)).body;
    expect(breach).toMatchObject({ authorityNotifiedOn: today(), authorityReference: 'LfDI-2026-0815 (Beispiel)', risk: 'high' });
    let open = await tasks();
    expect(open.some((t) => t.kind === 'privacy-breach')).toBe(false);
    expect(open.some((t) => t.kind === 'privacy-breach-subjects')).toBe(true);
    expect((await audit('privacy.breach-authority-notified'))[0].details).toMatchObject({ breachId: breach.id, reference: 'LfDI-2026-0815 (Beispiel)' });
    breach = (await put(`/core/privacy/breaches/${breach.id}`, { ...update, version: breach.version, authorityNotifiedOn: today(), subjectsNotifiedOn: today(), subjectsNotifiedVia: 'letter' }, privacy).expect(200)).body;
    open = await tasks();
    expect(open.some((t) => t.kind === 'privacy-breach-subjects')).toBe(false);
    expect((await put(`/core/privacy/breaches/${breach.id}`, { ...update, version: 1 }, privacy).expect(409)).body.code).toBe('conflict.stale');
  });

  it('determines affected persons from a list export, a full export and an account', async () => {
    // The reader exports the phone list of his department: the audit entry names its persons.
    await get('/core/lists/masterdata.phones/export/xlsx', reader).expect(200);
    const exported = (await audit('lists.exported'))[0];
    expect(exported.details).toMatchObject({ listId: 'masterdata.phones', format: 'xlsx', params: {} });
    expect((exported.details['personIds'] as string[]).toSorted()).toEqual([ids.tobias, ids.sandra].toSorted());

    const sources = (await get(`/core/privacy/breach-tools/sources?from=${today()}&to=${today()}&userId=${readerId}`, privacy).expect(200)).body as BreachSourceEntry[];
    expect(sources[0]).toMatchObject({ action: 'lists.exported', userName: 'Leser Musterstadt', persons: 2, label: { de: 'Liste exportiert: Telefonliste (xlsx)' } });
    expect((await get('/core/privacy/breach-tools/sources?from=2026-02-01&to=2026-01-01', privacy).expect(400)).body.code).toBe('privacy.periodInvalid');

    let affected = (await post('/core/privacy/breach-tools/affected', { source: 'audit', auditId: sources[0].auditId }, privacy).expect(200)).body as AffectedPersons;
    expect(affected).toMatchObject({ basis: 'recorded' });
    expect(affected.persons.map((p) => p.firstName)).toEqual(['Sandra', 'Tobias']);
    expect(affected.description.de).toContain('Telefonliste');

    // Persons the account can read today: its department only.
    affected = (await post('/core/privacy/breach-tools/affected', { source: 'account', userId: readerId }, privacy).expect(200)).body;
    expect(affected).toMatchObject({ basis: 'current' });
    expect(affected.persons.map((p) => p.id).toSorted()).toEqual([ids.tobias, ids.sandra].toSorted());

    // A technical user reads with the scopes of its token, brigade-wide.
    await post('/core/tokens', { ...TOKEN_FIELDS, name: 'Alarmierung (Beispiel)', scopes: ['masterdata.persons.read'] }).expect(201);
    const accounts = (await get('/core/privacy/breach-tools/accounts', privacy).expect(200)).body as { id: string; displayName: string; technical: boolean }[];
    const technical = accounts.find((a) => a.displayName === 'Alarmierung (Beispiel)')!;
    expect(technical.technical).toBe(true);
    affected = (await post('/core/privacy/breach-tools/affected', { source: 'account', userId: technical.id }, privacy).expect(200)).body;
    expect(affected.persons.map((p) => p.id).toSorted()).toEqual([ids.tobias, ids.sandra, ids.paul].toSorted());

    // A full export concerns all persons.
    await get('/core/export/masterdata').expect(200);
    const full = (await get(`/core/privacy/breach-tools/sources?from=${today()}&to=${today()}`, privacy).expect(200)).body as BreachSourceEntry[];
    const fullEntry = full.find((s) => s.action === 'data.exported')!;
    affected = (await post('/core/privacy/breach-tools/affected', { source: 'audit', auditId: fullEntry.auditId }, privacy).expect(200)).body;
    expect(affected.persons.map((p) => p.id)).toEqual(expect.arrayContaining([ids.tobias, ids.sandra, ids.paul]));

    const entries = (await get('/core/audit?action=privacy.breach-recorded').expect(200)).body as { id: string }[];
    expect((await post('/core/privacy/breach-tools/affected', { source: 'audit', auditId: entries[0].id }, privacy).expect(400)).body.code).toBe('privacy.sourceWithoutPersons');
    expect((await audit('privacy.breach-affected-determined')).length).toBe(4);
  });

  it('takes over the affected persons and exports the contact list for the notification', async () => {
    expect((await put(`/core/privacy/breaches/${breach.id}/affected`, { version: breach.version, personIds: ['00000000-0000-4000-8000-000000000000'], source: '' }, privacy).expect(400)).body.code).toBe('privacy.personUnknown');
    breach = (await put(`/core/privacy/breaches/${breach.id}/affected`, { version: breach.version, personIds: [ids.tobias, ids.sandra], source: 'Export der Telefonliste' }, privacy).expect(200)).body;
    expect(breach.affectedPersonIds).toEqual([ids.tobias, ids.sandra]);
    const xlsx = await binary(`/core/privacy/breaches/${breach.id}/contacts.xlsx`).expect(200);
    expect((xlsx.body as Buffer).subarray(0, 2).toString()).toBe('PK');
    expect((await audit('privacy.breach-contacts-exported'))[0].details).toEqual({ breachId: breach.id, count: 2 });
  });

  it('exports the protocols of a period and a user', async () => {
    const xlsx = await binary(`/core/privacy/breach-tools/protocols.xlsx?from=${today()}&to=${today()}&userId=${readerId}&breachId=${breach.id}`).expect(200);
    expect((xlsx.body as Buffer).subarray(0, 2).toString()).toBe('PK');
    expect(((await get('/core/privacy/breach-tools/protocols', privacy).expect(200)).body as { key: string }[]).map((p) => p.key)).toEqual(['core.audit', 'core.access-log']);
    await get('/core/privacy/breach-tools/protocols.xlsx?from=x&to=y', privacy).expect(400);
    expect((await audit('privacy.breach-protocol-exported'))[0].details).toEqual({ from: today(), to: today(), targetId: readerId, breachId: breach.id });
  });

  it('closes and reopens a breach', async () => {
    breach = (await post(`/core/privacy/breaches/${breach.id}/close`, { version: breach.version, closedOn: today() }, privacy).expect(200)).body;
    expect(breach).toMatchObject({ status: 'closed', closedOn: today() });
    expect((await put(`/core/privacy/breaches/${breach.id}`, { ...base(), version: breach.version }, privacy).expect(409)).body.code).toBe('privacy.breachClosed');
    expect(((await get('/core/privacy/breaches?state=open', privacy).expect(200)).body as unknown[]).length).toBe(0);
    breach = (await post(`/core/privacy/breaches/${breach.id}/reopen`, { version: breach.version }, privacy).expect(200)).body;
    expect(breach.status).toBe('open');
    // Not to be notified: the reason is documented and the task ends.
    const other = (await post('/core/privacy/breaches', { ...base(), title: 'E-Mail an falschen Verteiler (Beispiel)', risk: 'unlikely', authorityNotRequired: true, authorityNote: 'nur dienstliche Adressen, sofort gelöscht' }, privacy).expect(201)).body as PrivacyBreach;
    expect((await tasks()).some((t) => t.id.endsWith(`privacy-breach:${other.id}`))).toBe(false);
    await post(`/core/privacy/breaches/${other.id}/close`, { version: other.version, closedOn: today() }, privacy).expect(200);
  });

  it('ends all other sessions and revokes all API tokens after the step-up', async () => {
    const bearer = { Authorization: `Bearer ${ids.tokenSecret}` };
    await test.http.get('/api/core/session').set(bearer).expect(200);
    expect((await post('/core/privacy/breach-tools/lockdown', { reason: 'Verdacht auf ein abgeflossenes Passwort' }, privacyUnconfirmed).expect(403)).body.code).toBe('auth.stepUpRequired');
    await post('/core/privacy/breach-tools/lockdown', { reason: 'kurz' }, privacy).expect(400);
    const result = (await post('/core/privacy/breach-tools/lockdown', { reason: 'Verdacht auf ein abgeflossenes Passwort', breachId: breach.id }, privacy).expect(200)).body;
    expect(result.sessions).toBeGreaterThanOrEqual(3);
    expect(result.tokens).toBe(2);
    // The own session stays, all others end; tokens no longer work.
    await get('/core/privacy/breaches', privacy).expect(200);
    await get('/core/session', reader).expect(401);
    await get('/core/session', admin).expect(401);
    await test.http.get('/api/core/session').set(bearer).expect(401);
    admin = await test.login();
    expect((await audit('privacy.breach-lockdown'))[0].details).toEqual({ reason: 'Verdacht auf ein abgeflossenes Passwort', sessions: result.sessions, tokens: 2, devices: 0, breachId: breach.id });
  });
});
