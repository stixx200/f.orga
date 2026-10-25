import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { VWV_2022_RULES } from '@forga/promotions-contracts';
import { setUp, startTestApp, type TestApp, UI } from './testing/test-app';

let test: TestApp;
let admin: string;
let commander: string;
const ids: Record<string, string> = {};

const post = (path: string, body: unknown, cookie = admin) => test.http.post(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const put = (path: string, body: unknown, cookie = admin) => test.http.put(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const get = (path: string, cookie = admin) => test.http.get(`/api${path}`).set('Cookie', cookie);

beforeAll(async () => {
  test = await startTestApp();
  admin = await setUp(test);
  await post('/masterdata/catalog/templates/bw', {}).expect(201);
  await put('/core/settings/promotions.general', { rules: VWV_2022_RULES, previewMonths: 3, certificatePlace: 'Musterstadt', certificateSigner: 'Der Kommandant' }).expect(200);
  ids.musterstadt = (await post('/masterdata/departments', { name: 'Abteilung Musterstadt', shortName: 'Musterstadt', type: 'operational' }).expect(201)).body.id;
  ids.ahornfeld = (await post('/masterdata/departments', { name: 'Abteilung Ahornfeld', shortName: 'Ahornfeld', type: 'operational' }).expect(201)).body.id;
  const person = async (firstName: string, department: string, rank: { rank: string; since: string } | null, qualifications: [string, string][]) => {
    const id = (await post('/masterdata/persons', { firstName, lastName: 'Test', status: 'active', joinedOn: '2015-01-01', memberships: [{ departmentId: department, from: '2015-01-01', primary: true }] }).expect(201)).body.id as string;
    if (rank) await post(`/masterdata/persons/${id}/ranks`, { ...rank, notes: '' }).expect(201);
    for (const [qualification, acquiredOn] of qualifications) await post(`/masterdata/persons/${id}/qualifications`, { qualification, acquiredOn }).expect(201);
    return id;
  };
  // Fulfils OFM (3 years FM, Truppmann 2, radio operator); Lea is in Ahornfeld and only lacks time; Tim is a group leader (LM).
  ids.jonas = await person('Jonas', ids.musterstadt, { rank: 'fm', since: '2022-01-01' }, [['truppmann-2', '2021-01-01'], ['radio-operator', '2021-06-01']]);
  ids.lea = await person('Lea', ids.ahornfeld, { rank: 'fm', since: '2024-03-01' }, [['truppmann-2', '2023-01-01'], ['machinist', '2023-06-01']]);
  ids.tim = await person('Tim', ids.musterstadt, { rank: 'ofm', since: '2023-01-01' }, [['group-leader', '2026-03-01']]);

  const roles = (await get('/core/roles')).body as { id: string; templateKey: string }[];
  const role = roles.find((r) => r.templateKey === 'department-commander')?.id;
  await post('/core/users', { username: 'abtkdt', displayName: 'Abt.-Kdt. Musterstadt', password: 'auch-sehr-geheim', roles: [{ roleId: role, departmentId: ids.musterstadt }] }).expect(201);
  commander = await test.login({ username: 'abtkdt', password: 'auch-sehr-geheim' });
});

afterAll(() => test?.app.close());

describe('promotions', () => {
  it('evaluates the next promotion with the missing conditions', async () => {
    const candidates = (await get('/promotions/candidates?on=2026-10-24').expect(200)).body as { personId: string; state: string; targetRank: string; metOn: string | null; missing: { condition: { type: string } }[] }[];
    const by = (id: string) => candidates.find((c) => c.personId === id);
    expect(by(ids.jonas)).toMatchObject({ state: 'fulfilled', targetRank: 'ofm' });
    expect(by(ids.lea)).toMatchObject({ state: 'missing', targetRank: 'ofm', metOn: '2027-03-01', missing: [{ condition: { type: 'years-in-rank' } }] });
    expect(by(ids.tim)).toMatchObject({ state: 'fulfilled', targetRank: 'lm' });
    // With a preview of three months from 2026-10-24, Lea is shown as "soon" on a later date.
    expect((await get('/promotions/candidates?on=2026-12-15').expect(200)).body.find((c: { personId: string }) => c.personId === ids.lea)).toMatchObject({ state: 'preview' });
  });

  it('shows department commanders only their departments', async () => {
    const candidates = (await get('/promotions/candidates', commander).expect(200)).body as { personId: string }[];
    expect(candidates.map((c) => c.personId).toSorted()).toEqual([ids.jonas, ids.tim].toSorted());
    await post('/promotions/lists', { title: 'Test', referenceDate: '2026-10-24', effectiveDate: '2026-12-01' }, commander).expect(403);
  });

  it('keeps excluded persons off the list', async () => {
    const exclusion = (await post('/promotions/exclusions', { personId: ids.tim, from: '2026-01-01', until: '2026-10-31', reason: 'Disziplinarmaßnahme' }).expect(201)).body;
    ids.exclusion = exclusion.id;
    const tim = (await get('/promotions/candidates?on=2026-10-24').expect(200)).body.find((c: { personId: string }) => c.personId === ids.tim);
    expect(tim).toMatchObject({ state: 'excluded', exclusion: { reason: 'Disziplinarmaßnahme' } });
    const tomorrow = (await get('/promotions/candidates?on=2026-11-01').expect(200)).body.find((c: { personId: string }) => c.personId === ids.tim);
    expect(tomorrow.state).toBe('fulfilled');

    // An exclusion for one rank applies only to the promotion to that rank.
    const candidate = async () => (await get('/promotions/candidates?on=2026-10-24').expect(200)).body.find((c: { personId: string }) => c.personId === ids.jonas);
    const target = (await candidate()).targetRank as string;
    const other = (await post('/promotions/exclusions', { personId: ids.jonas, from: '2026-01-01', targetRank: 'other-rank', reason: 'Nur für einen anderen Dienstgrad' }).expect(201)).body;
    expect((await candidate()).state).not.toBe('excluded');
    const same = (await post('/promotions/exclusions', { personId: ids.jonas, from: '2026-01-01', targetRank: target, reason: 'Nur für diesen Dienstgrad' }).expect(201)).body;
    expect(await candidate()).toMatchObject({ state: 'excluded', exclusion: { targetRank: target } });
    for (const e of [other, same]) await test.http.delete(`/api/promotions/exclusions/${e.id}`).set('Cookie', admin).set(UI).expect(204);

    // A draft list on a date within the exclusion shows Tim greyed out instead of proposing him.
    const early = (await post('/promotions/lists', { title: 'Zwischenliste', referenceDate: '2026-10-24', effectiveDate: '2026-10-24' }).expect(201)).body;
    const shown = (await get(`/promotions/lists/${early.id}`).expect(200)).body;
    expect(shown.entries.some((e: { personId: string }) => e.personId === ids.tim)).toBe(false);
    expect(shown.excluded).toEqual([expect.objectContaining({ personId: ids.tim, exclusion: { from: '2026-01-01', until: '2026-10-31', reason: 'Disziplinarmaßnahme' } })]);
    await test.http.delete(`/api/promotions/lists/${early.id}`).set('Cookie', admin).set(UI).expect(204);
  });

  it('creates a list, takes proposals and decides it', async () => {
    const list = (await post('/promotions/lists', { title: 'Hauptversammlung 2026', referenceDate: '2026-12-15', effectiveDate: '2026-12-20' }).expect(201)).body;
    ids.list = list.id;
    // Jonas fulfils, Lea is a preview (deferred by default), Tim was excluded until 31.10. and fulfils on 15.12.
    expect(list.entries.map((e: { firstName: string; decision: string }) => [e.firstName, e.decision])).toEqual([['Jonas', 'promote'], ['Lea', 'defer'], ['Tim', 'promote']]);

    // The department commander of Musterstadt sees and proposes for Musterstadt only.
    const own = (await get(`/promotions/lists/${ids.list}`, commander).expect(200)).body;
    expect(own.entries.map((e: { firstName: string }) => e.firstName)).toEqual(['Jonas', 'Tim']);
    // The overview counts only the entries the user may see.
    const summary = (lists: { id: string; total: number; promote: number }[]) => lists.find((l) => l.id === ids.list);
    expect(summary((await get('/promotions/lists', commander).expect(200)).body)).toMatchObject({ total: 2, promote: 2 });
    expect(summary((await get('/promotions/lists').expect(200)).body)).toMatchObject({ total: 3, promote: 2 });
    await put(`/promotions/lists/${ids.list}/entries/${ids.lea}`, { decision: 'promote', version: own.version }, commander).expect(403);
    const rejected = await put(`/promotions/lists/${ids.list}/entries/${ids.tim}`, { decision: 'reject', version: own.version }, commander).expect(400);
    expect(rejected.body.code).toBe('promotions.reasonRequired');
    const updated = (await put(`/promotions/lists/${ids.list}/entries/${ids.tim}`, { decision: 'defer', comment: 'Erst nach Gruppenführer-Hospitation', version: own.version }, commander).expect(200)).body;

    // A manual promotion outside the rules needs a higher rank and a reason.
    const full = (await get(`/promotions/lists/${ids.list}`).expect(200)).body;
    await post(`/promotions/lists/${ids.list}/entries`, { personId: ids.lea, targetRank: 'fm', comment: 'x', version: full.version }).expect(409);
    expect(updated.version).toBe(full.version);

    await post(`/promotions/lists/${ids.list}/execute`, { version: full.version }).expect(409);
    const decided = (await post(`/promotions/lists/${ids.list}/decide`, { decidedOn: '2026-11-20', version: full.version }).expect(200)).body;
    expect(decided).toMatchObject({ status: 'decided', decidedOn: '2026-11-20' });
    await put(`/promotions/lists/${ids.list}/entries/${ids.jonas}`, { decision: 'defer', version: decided.version }).expect(409);
    ids.version = String(decided.version);
  });

  it('prints certificates and enters the promotions in the person file', async () => {
    const printed = (await get(`/core/lists/promotions.list?listId=${ids.list}`).expect(200)).body;
    expect(printed.rows.map((r: { name: string; decision: string }) => [r.name, r.decision])).toEqual(expect.arrayContaining([[expect.stringContaining('Jonas'), 'befördern']]));
    expect(printed.rows.every((r: { basis: string }) => r.basis.length > 0)).toBe(true);
    const musterstadt = (await get(`/core/lists/promotions.list?listId=${ids.list}&departmentId=${ids.musterstadt}`).expect(200)).body;
    expect(musterstadt.rows.length).toBeLessThan(printed.rows.length);
    const pdf = await get(`/promotions/lists/${ids.list}/certificates.pdf`).buffer(true).expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');

    const executed = (await post(`/promotions/lists/${ids.list}/execute`, { version: Number(ids.version) }).expect(200)).body;
    expect(executed.status).toBe('executed');
    // Decision and execution are recorded in the audit log.
    const audit = (await get('/core/audit?action=promotions.').expect(200)).body as { action: string; details: { listId: string } }[];
    expect(audit.filter((e) => e.details.listId === ids.list).map((e) => e.action).toSorted()).toEqual(['promotions.list-decided', 'promotions.list-executed']);
    const jonas = (await get(`/masterdata/persons/${ids.jonas}`).expect(200)).body;
    expect(jonas.ranks.at(-1)).toMatchObject({ rank: 'ofm', since: '2026-12-20', notes: 'Hauptversammlung 2026' });
    // Tim was deferred: rank unchanged.
    expect((await get(`/masterdata/persons/${ids.tim}`).expect(200)).body.ranks.map((r: { rank: string }) => r.rank)).toEqual(['ofm']);
    await post(`/promotions/lists/${ids.list}/reopen`, { version: executed.version }).expect(409);
    await test.http.delete(`/api/promotions/lists/${ids.list}`).set('Cookie', admin).set(UI).expect(409);

    const tab = (await get(`/promotions/persons/${ids.jonas}`).expect(200)).body;
    expect(tab).toMatchObject({ rank: 'ofm', rankSince: '2026-12-20', lists: [{ id: ids.list, status: 'executed', targetRank: 'ofm', decision: 'promote' }] });
  });

  it('refuses executing when a rank changed meanwhile', async () => {
    const list = (await post('/promotions/lists', { title: 'Nachtrag', referenceDate: '2026-12-15', effectiveDate: '2026-12-31' }).expect(201)).body;
    const decided = (await post(`/promotions/lists/${list.id}/decide`, { decidedOn: '2026-12-21', version: list.version }).expect(200)).body;
    await post(`/masterdata/persons/${ids.tim}/ranks`, { rank: 'lm', since: '2026-12-22', notes: '' }).expect(201);
    const refused = await post(`/promotions/lists/${list.id}/execute`, { version: decided.version }).expect(409);
    expect(refused.body).toMatchObject({ code: 'promotions.rankChanged', names: 'Tim Test' });
  });

  it('takes the population of the district of the primary department when the rule asks for it', async () => {
    const rule = { key: 'population-test', rank: 'ofm', description: { de: 'Test', en: 'Test' }, condition: { type: 'and', children: [{ type: 'rank', ranks: ['fm'] }, { type: 'population', min: 15001, max: null, scope: 'department' }] } };
    await put('/core/settings/promotions.general', { rules: [rule], previewMonths: 3 }).expect(200);
    await put('/core/settings/brigade', { name: 'Feuerwehr Test', population: 10_000 }).expect(200);
    const lea = async () => (await get('/promotions/candidates?on=2026-10-24').expect(200)).body.find((c: { personId: string }) => c.personId === ids.lea);
    expect((await lea()).state).toBe('missing');
    const ahornfeld = ((await get('/masterdata/departments').expect(200)).body as { id: string }[]).find((d) => d.id === ids.ahornfeld)!;
    const { id: _id, version, statisticsRelevant: _s, ...fields } = ahornfeld as Record<string, unknown>;
    await put(`/masterdata/departments/${ids.ahornfeld}`, { ...fields, population: 20_000, version }).expect(200);
    expect(await lea()).toMatchObject({ state: 'fulfilled', targetRank: 'ofm' });
    await put('/core/settings/promotions.general', { rules: VWV_2022_RULES, previewMonths: 3 }).expect(200);
  });

  it('extends the time in rank by rest periods of the person file', async () => {
    const before = (await get(`/promotions/persons/${ids.lea}`).expect(200)).body;
    await post(`/masterdata/persons/${ids.lea}/rest-periods`, { reason: 'dormant', from: '2025-01-01', to: '2025-12-31' }).expect(201);
    const after = (await get(`/promotions/persons/${ids.lea}`).expect(200)).body;
    // A year dormant postpones the next promotion by that year.
    expect(after.next.metOn > before.next.metOn).toBe(true);
  });

  it('tries an unsaved rule on a person', async () => {
    const rule = { key: 'test', rank: 'ofm', description: { de: 'Test', en: 'Test' }, condition: { type: 'and', children: [{ type: 'rank', ranks: ['fm'] }, { type: 'qualification', keys: ['radio-operator'] }] } };
    // Lea (FM) has the pump operator course but not the radio operator course.
    expect((await post('/promotions/rules/test', { personId: ids.lea, rule, on: '2026-10-24' }).expect(200)).body).toMatchObject({ state: 'missing', missing: [{ condition: { type: 'qualification' } }] });
    const machinist = { ...rule, condition: { type: 'and', children: [{ type: 'rank', ranks: ['fm'] }, { type: 'qualification', keys: ['machinist'] }] } };
    expect((await post('/promotions/rules/test', { personId: ids.lea, rule: machinist, on: '2026-10-24' }).expect(200)).body).toMatchObject({ state: 'fulfilled' });
    await post('/promotions/rules/test', { personId: ids.jonas, rule, on: '2026-10-24' }, commander).expect(403);
  });
});
