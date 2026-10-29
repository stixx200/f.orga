import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EntityManager } from '@mikro-orm/core';
import { AccessReportService, AccessReportTexts, AuditEntry, ExportRegistry, MailService, PrivacyDocument, sectionTexts, UUID_PATTERN, type PersonDataSection } from '@forga/core-api';
import { INSTALLED_MODULES } from './app/installed-modules';
import { createFixture, OTHER_NAMES, type AccessReportFixture, type SeedResult } from './testing/access-report/fixture';
import { SEEDS } from './testing/access-report/seeds';
import { setUp, startTestApp, type TestApp } from './testing/test-app';

/**
 * Access report (Art. 15 GDPR, concept „Auskunft nach Art. 15 als PDF“): a made-up member with data in every module gets
 * a readable report; every module with personal data contributes, no ID, no other person's name, health data marked.
 * `ACCESS_REPORT_MODULES=incidents,training` seeds and checks only these modules (while working on one module).
 */
let test: TestApp;
let fx: AccessReportFixture;
const results = new Map<string, SeedResult>();
const only = process.env['ACCESS_REPORT_MODULES']?.split(',').map((m) => m.trim()).filter(Boolean);
const seeds = SEEDS.filter(([module]) => module === 'masterdata' || !only || only.includes(module));
let sections: PersonDataSection[] = [];
let english: PersonDataSection[] = [];

beforeAll(async () => {
  process.env['FORGA_SECRET_KEY'] = randomBytes(32).toString('base64');
  test = await startTestApp();
  const admin = await setUp(test);
  fx = await createFixture(test, admin);
  for (const [module, seed] of seeds) results.set(module, await seed(fx));
  const service = test.app.get(AccessReportService);
  sections = (await service.sections(fx.ids.person, 'de')).sections;
  english = (await service.sections(fx.ids.person, 'en')).sections;
}, 180_000);

afterAll(async () => {
  await test?.app.close();
  delete process.env['FORGA_SECRET_KEY'];
});

const texts = (list: PersonDataSection[]) => sectionTexts(list).join('\n');
const service = () => test.app.get(AccessReportService);
const em = () => test.app.get(EntityManager).fork();
const audits = async (action: string) => (await em().find(AuditEntry, { action }, { orderBy: { timestamp: 'asc' } })).map((a) => a.details);

describe('readable access report', () => {
  it('has a section of every module that stores data about the member', () => {
    const exports = test.app.get(ExportRegistry);
    for (const { manifest } of INSTALLED_MODULES) {
      if (!results.has(manifest.id)) continue;
      const expected = results.get(manifest.id)!.sections;
      if (expected) {
        for (const key of expected) expect(sections.map((s) => s.key), `${manifest.id}: ${key}`).toContain(key);
        continue;
      }
      if (!manifest.privacy?.personData || !exports.sources.get(manifest.id)?.describePerson) continue;
      expect(sections.some((s) => s.key === manifest.id || s.key.startsWith(`${manifest.id}.`)), `section of ${manifest.id}`).toBe(true);
    }
    expect(sections.map((s) => s.key)).toEqual(expect.arrayContaining(['core.account', 'core.protocol']));
  });

  it('every module with personal data describes it or anonymises it', () => {
    const exports = test.app.get(ExportRegistry);
    const missing = INSTALLED_MODULES.filter((m) => m.manifest.privacy?.personData && !exports.sources.get(m.manifest.id)?.describePerson).map((m) => m.manifest.id);
    expect(missing).toEqual([]);
  });

  it('shows what the seeds created, in plain text', () => {
    for (const [module, result] of results) {
      const own = sections.filter((s) => s.key === module || s.key.startsWith(`${module}.`) || (result.sections ?? []).includes(s.key));
      const all = texts(own);
      for (const text of result.expect) expect(all, `${module}: ${text}`).toContain(text);
    }
  });

  it('contains no IDs, no names of other persons and nothing a seed forbids', () => {
    const forbidden = [...OTHER_NAMES, ...[...results.values()].flatMap((r) => r.forbid ?? [])];
    for (const list of [sections, english]) {
      for (const text of sectionTexts(list)) {
        expect(text).not.toMatch(UUID_PATTERN);
        for (const name of forbidden) expect(text, text).not.toContain(name);
      }
    }
  });

  it('marks the sections the seeds expect as health data', () => {
    for (const [module, result] of results) {
      if (result.health) expect(sections.filter((s) => s.key === module || s.key.startsWith(`${module}.`)).some((s) => s.health), module).toBe(true);
    }
  });

  it('marks health data and names the own changes as „Sie selbst“', () => {
    const protocol = sections.find((s) => s.key === 'core.protocol')!;
    expect(texts([protocol])).toContain('Sie selbst');
    expect(texts([protocol])).toContain('Kommandant Test');
    if (results.has('training')) expect(sections.find((s) => s.key === 'training')?.health).toBe(true);
    if (results.has('respiratory-protection') && results.get('respiratory-protection')!.expect.length) {
      expect(sections.filter((s) => s.key.startsWith('respiratory-protection')).some((s) => s.health)).toBe(true);
    }
  });

  it('is written in English when asked', () => {
    expect(english.find((s) => s.key === 'core.account')?.title).toBe('User account');
    expect(texts(english)).not.toContain('Sie selbst');
  });
});

describe('access report documents', () => {
  let id: string;

  it('shows the sections with their number of entries before creating', async () => {
    const preview = (await fx.get(`/core/privacy/access-reports/preview?personId=${fx.ids.person}`).expect(200)).body as { key: string; entries: number; health: boolean }[];
    expect(preview.find((s) => s.key === 'core.account')!.entries).toBeGreaterThan(0);
    await fx.get('/core/privacy/access-reports/preview?personId=nope').expect(400);
    await fx.get(`/core/privacy/access-reports/preview?personId=${fx.ids.person}`, fx.member).expect(403);
  });

  it('creates the PDF in the background and stores it encrypted', async () => {
    const created = (await fx.post('/core/privacy/access-reports', { personId: fx.ids.person, language: 'de', includeJson: true }).expect(202)).body;
    expect(created).toMatchObject({ status: 'pending', includeJson: true, createdBy: 'Admin' });
    id = created.id;
    await service().idle();
    const ready = (await fx.get(`/core/privacy/access-reports/${id}`).expect(200)).body;
    expect(ready.status).toBe('ready');
    expect(new Date(ready.expiresAt).getTime() - new Date(ready.createdAt).getTime()).toBe(30 * 86_400_000);
    const stored = await em().findOneOrFail(PrivacyDocument, id, { populate: ['content'] });
    const raw = Buffer.from(stored.content!);
    expect(raw.subarray(0, 8).toString('latin1')).not.toContain('%PDF');
    expect(raw.toString('latin1')).not.toContain('Probe');

    const file = await fx.get(`/core/privacy/access-reports/${id}/file`).buffer(true).parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => done(null, Buffer.concat(chunks)));
    }).expect(200);
    const pdf = file.body as Buffer;
    expect(file.headers['content-type']).toBe('application/pdf');
    expect(file.headers['content-disposition']).not.toContain('Probe');
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    // To look at the report: ACCESS_REPORT_PDF=<path> writes it there.
    if (process.env['ACCESS_REPORT_PDF']) writeFileSync(process.env['ACCESS_REPORT_PDF'], pdf);
    expect(pdf.toString('latin1')).toContain('EmbeddedFile');
    expect(await audits('privacy.access-report-created')).toEqual([expect.objectContaining({ personId: fx.ids.person, documentId: id, includeJson: true })]);
    expect(await audits('privacy.access-report-downloaded')).toEqual([expect.objectContaining({ documentId: id, by: 'administration' })]);
  });

  it('lists the reports of the person and refuses unknown persons', async () => {
    const list = (await fx.get(`/core/privacy/access-reports?personId=${fx.ids.person}`).expect(200)).body;
    expect(list).toEqual([expect.objectContaining({ id, status: 'ready', channel: null })]);
    await fx.post('/core/privacy/access-reports', { personId: '00000000-0000-4000-8000-000000000000' }).expect(404);
  });

  it('provides the report in "Mein Bereich" with an e-mail that names no data', async () => {
    await fx.get(`/core/me/access-reports/${id}/file`, fx.member).expect(404);
    expect((await fx.get('/core/me/access-reports', fx.member).expect(200)).body).toEqual([]);
    const mail = test.app.get(MailService);
    const before = mail.sent.length;
    const handed = (await fx.post(`/core/privacy/access-reports/${id}/hand-over`, { channel: 'self-service' }).expect(201)).body;
    expect(handed).toMatchObject({ channel: 'self-service', handedOverOn: expect.any(String) });
    const sent = mail.sent.slice(before);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: 'tobias.probe@example.org', subject: 'Ihre Auskunft liegt in f.orga bereit' });
    expect(sent[0].text).not.toMatch(/Atemschutz|Einsatz|krank/);
    expect((await fx.get('/core/me/access-reports', fx.member).expect(200)).body).toEqual([expect.objectContaining({ id })]);
    // Another member sees nothing of it.
    expect((await fx.get('/core/me/access-reports', fx.other).expect(200)).body).toEqual([]);
    await fx.get(`/core/me/access-reports/${id}/file`, fx.other).expect(404);
    const own = await fx.get(`/core/me/access-reports/${id}/file`, fx.member).expect(200);
    expect(own.headers['content-type']).toBe('application/pdf');
    expect((await fx.get(`/core/privacy/access-reports/${id}`).expect(200)).body.downloadedByPersonAt).not.toBeNull();
    expect(await audits('privacy.access-report-handed-over')).toEqual([expect.objectContaining({ documentId: id, channel: 'self-service' })]);
    expect((await audits('privacy.access-report-downloaded')).at(-1)).toMatchObject({ documentId: id, by: 'person' });
  });

  it('deletes the file after 30 days and keeps the record', async () => {
    expect(await service().purgeExpired(new Date(Date.now() + 29 * 86_400_000))).toBe(0);
    expect(await service().purgeExpired(new Date(Date.now() + 31 * 86_400_000))).toBe(1);
    const stored = await em().findOneOrFail(PrivacyDocument, id, { populate: ['content'] });
    expect(stored.content).toBeNull();
    expect((await fx.get(`/core/privacy/access-reports/${id}`).expect(200)).body).toMatchObject({ status: 'expired', channel: 'self-service' });
    expect((await fx.get(`/core/privacy/access-reports/${id}/file`).expect(410)).body.code).toBe('privacy.documentExpired');
    expect((await fx.get('/core/me/access-reports', fx.member).expect(200)).body).toEqual([]);
    await fx.post(`/core/privacy/access-reports/${id}/hand-over`, { channel: 'post' }).expect(410);
  });

  it('needs the server key and refuses to store a report in plain text', async () => {
    const key = process.env['FORGA_SECRET_KEY'];
    delete process.env['FORGA_SECRET_KEY'];
    try {
      expect((await fx.post('/core/privacy/access-reports', { personId: fx.ids.person }).expect(503)).body.code).toBe('privacy.noSecretKey');
    } finally {
      process.env['FORGA_SECRET_KEY'] = key;
    }
  });

  it('records a handover in person or by post', async () => {
    const created = (await fx.post('/core/privacy/access-reports', { personId: fx.ids.person, language: 'en' }).expect(202)).body;
    await service().idle();
    const handed = (await fx.post(`/core/privacy/access-reports/${created.id}/hand-over`, { channel: 'post', date: '2026-10-28' }).expect(201)).body;
    expect(handed).toMatchObject({ channel: 'post', handedOverOn: '2026-10-28', language: 'en' });
    // A member without account cannot get it in "Mein Bereich".
    const other = (await fx.post('/masterdata/persons', { firstName: 'Ohne', lastName: 'Konto', status: 'active', memberships: [{ departmentId: fx.ids.department, from: '2020-01-01', primary: true }] }).expect(201)).body.id;
    const report = (await fx.post('/core/privacy/access-reports', { personId: other }).expect(202)).body;
    await service().idle();
    expect((await fx.post(`/core/privacy/access-reports/${report.id}/hand-over`, { channel: 'self-service' }).expect(400)).body.code).toBe('privacy.noAccount');
  });
});

const request = async (kind = 'access', personId = fx.ids.person) =>
  (await fx.post('/core/privacy/requests', { personId, kind, receivedOn: '2026-10-20', channel: 'letter', identityChecked: true, identityNote: 'Unterschrift' }).expect(201)).body as { id: string };

describe('access reports for data subject requests', () => {
  let requestId: string;

  it('links the report to the access request it answers', async () => {
    requestId = (await request()).id;
    const created = (await fx.post('/core/privacy/access-reports', { personId: fx.ids.person, requestId }).expect(202)).body;
    expect(created.requestId).toBe(requestId);
    await service().idle();
    expect((await fx.get(`/core/privacy/requests/${requestId}`).expect(200)).body.accessReportDocumentId).toBe(created.id);
    // Only an access request of the same person.
    const objection = await request('objection');
    expect((await fx.post('/core/privacy/access-reports', { personId: fx.ids.person, requestId: objection.id }).expect(400)).body.code).toBe('privacy.requestMismatch');
    expect((await fx.post('/core/privacy/access-reports', { personId: fx.ids.otherPerson, requestId }).expect(400)).body.code).toBe('privacy.requestMismatch');

    // „Anfrage damit erledigt“ with the handover.
    await fx.post(`/core/privacy/access-reports/${created.id}/hand-over`, { channel: 'in-person', date: '2026-10-28', closeRequest: true }).expect(201);
    expect((await fx.get(`/core/privacy/requests/${requestId}`).expect(200)).body).toMatchObject({ status: 'done', closedOn: '2026-10-28' });
  });

  it('writes the cover letter from the contacts and text blocks of the settings', async () => {
    await fx.put('/core/settings/privacy.contacts', { controller: { name: 'Stadt Musterstadt', address: 'Marktplatz 1, 12345 Musterstadt', representedBy: 'Bürgermeisterin' }, dpo: { name: 'Datenschutzbeauftragter der Stadt', email: 'datenschutz@musterstadt.example' } }).expect(200);
    const letter = await test.app.get(AccessReportTexts).letter('de', { name: 'Tobias Probe', receivedOn: '2026-10-20' });
    expect(letter.controller).toBe('Stadt Musterstadt, Marktplatz 1, 12345 Musterstadt, vertreten durch Bürgermeisterin');
    expect(letter.dataProtectionOfficer).toContain('datenschutz@musterstadt.example');
    expect(letter.authority).toContain('Baden-Württemberg');
    expect(letter.introduction).toContain('20.10.2026');
    expect(letter.introduction).not.toContain('{');
    // Text blocks not reviewed yet: the letter is a template.
    expect(letter.template).toBe(true);
  });

  it('lets the member create the own report right away with `instant`, at most once a day', async () => {
    await fx.put('/core/settings/privacy.selfServiceAccess', { mode: 'instant', contact: '' }).expect(200);
    try {
      await fx.post('/core/privacy/me/requests', { language: 'de' }, fx.member).expect(201);
      await service().idle();
      const mine = (await fx.get('/core/me/access-reports', fx.member).expect(200)).body as { id: string; status: string }[];
      expect(mine[0]).toMatchObject({ status: 'ready' });
      await fx.get(`/core/me/access-reports/${mine[0].id}/file`, fx.member).expect(200);
      // Recorded as an access request of the channel "Mein Bereich", answered by the report and done.
      const requests = (await fx.get(`/core/privacy/requests?state=all&personId=${fx.ids.person}`).expect(200)).body as { channel: string; status: string; accessReportDocumentId: string | null }[];
      expect(requests.find((r) => r.channel === 'my-area')).toMatchObject({ status: 'done', accessReportDocumentId: mine[0].id });
      expect((await fx.post('/core/privacy/me/requests', { language: 'de' }, fx.member).expect(409)).body.code).toBe('privacy.accessReportToday');
    } finally {
      await fx.put('/core/settings/privacy.selfServiceAccess', { mode: 'request', contact: '' }).expect(200);
    }
  });
});
