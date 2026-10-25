import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setUp, startTestApp, type TestApp, UI } from './testing/test-app';

let test: TestApp;
let admin: string;
let officer: string;
let leader: string;
const ids: Record<string, string> = {};

const post = (path: string, body: unknown, cookie = admin) => test.http.post(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const put = (path: string, body: unknown, cookie = admin) => test.http.put(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const get = (path: string, cookie = admin) => test.http.get(`/api${path}`).set('Cookie', cookie);
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
const FUTURE = '2099-01-01';

beforeAll(async () => {
  test = await startTestApp();
  admin = await setUp(test);
  await post('/masterdata/catalog/templates/bw', {}).expect(201);
  ids.musterstadt = (await post('/masterdata/departments', { name: 'Abteilung Musterstadt', shortName: 'Musterstadt', type: 'operational' }).expect(201)).body.id;
  ids.ahornfeld = (await post('/masterdata/departments', { name: 'Abteilung Ahornfeld', shortName: 'Ahornfeld', type: 'operational' }).expect(201)).body.id;
  ids.veterans = (await post('/masterdata/departments', { name: 'Altersabteilung Musterstadt', shortName: 'Alters Musterstadt', type: 'veterans', parentId: ids.musterstadt }).expect(201)).body.id;
  const person = async (firstName: string, departmentId: string) =>
    (await post('/masterdata/persons', { firstName, lastName: 'Kleider', status: 'active', memberships: [{ departmentId, from: '2010-01-01', primary: true }] }).expect(201)).body.id as string;
  ids.anna = await person('Anna', ids.musterstadt);
  ids.ben = await person('Ben', ids.ahornfeld);
  ids.wart = await person('Wanda', ids.musterstadt);

  const roles = (await get('/core/roles')).body as { id: string; templateKey: string }[];
  const role = (key: string) => roles.find((r) => r.templateKey === key)!.id;
  await post('/core/users', { username: 'kleiderwart', displayName: 'Kleiderwart', password: 'auch-sehr-geheim', personId: ids.wart, roles: [{ roleId: role('clothing-officer'), departmentId: ids.musterstadt }] }).expect(201);
  await post('/core/users', { username: 'gruppenfuehrer', displayName: 'GF', password: 'auch-sehr-geheim', roles: [{ roleId: role('group-leader'), departmentId: ids.musterstadt }] }).expect(201);
  officer = await test.login({ username: 'kleiderwart', password: 'auch-sehr-geheim' });
  leader = await test.login({ username: 'gruppenfuehrer', password: 'auch-sehr-geheim' });
});

afterAll(() => test?.app.close());

describe('clothing store', () => {
  it('adds the article template once; the catalog needs the brigade-wide right', async () => {
    // The clothing officer of one department may not change the shared catalog.
    await post('/clothing/articles/template', {}, officer).expect(403);
    expect((await post('/clothing/articles/template', {}).expect(201)).body.added).toBeGreaterThan(5);
    expect((await post('/clothing/articles/template', {}).expect(201)).body.added).toBe(0);
    const articles = (await get('/clothing/articles', officer).expect(200)).body as { key: string; kind: string; textile: boolean; impregnationMonths: number | null }[];
    expect(articles.find((a) => a.key === 'jacket')).toMatchObject({ kind: 'inventory', textile: true, impregnationMonths: 12 });
    expect(articles.find((a) => a.key === 'gloves')).toMatchObject({ kind: 'consumable', textile: false });
  });

  it('records pieces, issues them and keeps the history of the person', async () => {
    const piece = (inventoryNumber: string, articleKey = 'jacket', departmentId = ids.musterstadt) =>
      post('/clothing/items', { articleKey, inventoryNumber, size: '52', departmentId, purchasedOn: '2026-01-15' }, officer);
    const created = await piece('J-001').expect(201);
    ids.jacket = created.body.id;
    // In stock, a piece needs no washing or impregnation; the year counts from the issue.
    expect(created.body).toMatchObject({ status: 'stock', impregnationDueOn: null, inspectionDueOn: '2027-01-15' });
    ids.trousers = (await piece('H-001', 'trousers').expect(201)).body.id;
    await piece('J-001').expect(409);
    // Consumables have no pieces; another department's store is not the officer's.
    await piece('G-001', 'gloves').expect(400);
    await piece('J-900', 'jacket', ids.ahornfeld).expect(403);

    const issued = await post(`/clothing/items/${ids.jacket}/issue`, { personId: ids.anna, date: '2026-02-01' }, officer).expect(200);
    expect(issued.body).toMatchObject({ status: 'issued', holderId: ids.anna, issuedOn: '2026-02-01', impregnationDueOn: '2027-02-01' });
    await post(`/clothing/items/${ids.jacket}/issue`, { personId: ids.anna, date: '2026-02-01' }, officer).expect(400);
    await post(`/clothing/items/${ids.trousers}/issue`, { personId: ids.anna, date: '2026-02-01' }, officer).expect(200);
    // A person of another department is not the officer's to equip.
    await post(`/clothing/items/${ids.trousers}/issue`, { personId: ids.ben, date: '2026-02-01' }, officer).expect(400);

    // Gloves are only handed out and recorded, not assigned.
    await post('/clothing/consumables', { personId: ids.anna, articleKey: 'gloves', size: '9', quantity: 2, date: '2026-02-01' }, officer).expect(201);
    await post('/clothing/consumables', { personId: ids.ben, articleKey: 'gloves', size: '9', date: '2026-02-01' }, officer).expect(403);

    const anna = (await get(`/clothing/persons/${ids.anna}`, officer).expect(200)).body;
    expect(anna.items.map((i: { inventoryNumber: string }) => i.inventoryNumber).toSorted()).toEqual(['H-001', 'J-001']);
    expect(anna.history.map((h: { articleKey: string; quantity: number }) => [h.articleKey, h.quantity]).toSorted()).toEqual([['gloves', 2], ['jacket', 1], ['trousers', 1]]);
    // The group leader has no right in the clothing store.
    await get(`/clothing/persons/${ids.anna}`, leader).expect(404);
  });

  it('stores barcodes and RFID chips once and finds pieces by a scanned code', async () => {
    const jacket = (await get(`/clothing/items/${ids.jacket}`, officer).expect(200)).body;
    const input = { articleKey: 'jacket', inventoryNumber: 'J-001', size: '52', departmentId: ids.musterstadt, purchasedOn: '2026-01-15' };
    expect((await post('/clothing/items', { ...input, inventoryNumber: 'J-002', barcode: 'PSA-J-001', rfid: '04:a2:1f:6b:c3:5d:80' }, officer).expect(201)).body).toMatchObject({ rfid: '04A21F6BC35D80' });
    const taken = await test.http.put(`/api/clothing/items/${ids.jacket}`).set('Cookie', officer).set(UI).send({ ...input, barcode: 'psa-j-001', rfid: '04A21F6BC35D80', version: jacket.version }).expect(409);
    expect(taken.body).toMatchObject({ code: 'codes.taken', field: 'rfid' });

    const lookup = async (code: string, cookie = officer) => ((await get(`/core/codes?code=${encodeURIComponent(code)}`, cookie).expect(200)).body as { title: string }[]).map((h) => h.title);
    expect(await lookup('04 A2 1F 6B C3 5D 80')).toEqual(['J-002 Einsatzjacke']);
    expect(await lookup('psa-j-001')).toEqual(['J-002 Einsatzjacke']);
    expect(await lookup('J-001')).toEqual(['J-001 Einsatzjacke']);
    // The group leader only sees the own protective equipment (`clothing.self`): no hits for other pieces.
    expect(await lookup('psa-j-001', leader)).toEqual([]);
    expect((await get('/core/codes/modules', leader).expect(200)).body).toContain('clothing');
    expect((await get('/core/codes/modules', officer).expect(200)).body).toContain('clothing');
  });

  it('records washing and impregnation; impregnating counts as washing and restarts the interval', async () => {
    await post('/clothing/care', { itemIds: [ids.jacket, ids.trousers], kind: 'wash', date: '2026-03-01', place: 'Feuerwehrhaus' }, officer).expect(201);
    let jacket = (await get(`/clothing/items/${ids.jacket}`, officer).expect(200)).body;
    expect(jacket).toMatchObject({ lastWashedOn: '2026-03-01', lastImpregnatedOn: null, impregnationDueOn: '2027-02-01' });
    await post('/clothing/care', { itemIds: [ids.jacket], kind: 'impregnation', date: '2026-06-10', place: 'Wäscherei Muster' }, officer).expect(201);
    jacket = (await get(`/clothing/items/${ids.jacket}`, officer).expect(200)).body;
    expect(jacket).toMatchObject({ lastWashedOn: '2026-06-10', lastImpregnatedOn: '2026-06-10', impregnationDueOn: '2027-06-10' });
    expect(jacket.care.map((c: { kind: string; place: string }) => [c.kind, c.place])).toEqual([['impregnation', 'Wäscherei Muster'], ['wash', 'Feuerwehrhaus']]);

    await post(`/clothing/items/${ids.jacket}/inspections`, { date: '2026-06-11', passed: true, inspector: 'Kleiderwart' }, officer).expect(201);
    expect((await get(`/clothing/items/${ids.jacket}`, officer)).body).toMatchObject({ lastInspectedOn: '2026-06-11', inspectionDueOn: '2027-06-11' });

    // Boots are not textile.
    ids.boots = (await post('/clothing/items', { articleKey: 'boots', inventoryNumber: 'S-001', size: '43', departmentId: ids.musterstadt }, officer).expect(201)).body.id;
    await post('/clothing/care', { itemIds: [ids.boots], kind: 'wash', date: '2026-06-10' }, officer).expect(400);
  });

  it('refuses leaving and the transfer to the veterans while protective equipment is assigned', async () => {
    const veterans = await post(`/masterdata/persons/${ids.anna}/transfer-to-veterans`, { departmentId: ids.veterans, on: '2026-10-01' }).expect(409);
    expect(veterans.body).toMatchObject({ code: 'masterdata.personHoldsItems', count: 2 });
    await post('/masterdata/catalog/templates/bw', {});
    await post(`/masterdata/persons/${ids.anna}/leave`, { leftOn: '2026-10-01', exitReason: 'own-request' }).expect(409);

    // Taking back: the jacket goes into stock, the worn trousers out of use.
    await post(`/clothing/items/${ids.jacket}/return`, { date: '2026-01-01' }, officer).expect(400);
    await post(`/clothing/items/${ids.jacket}/return`, { date: '2026-09-30' }, officer).expect(200);
    const trousers = await post(`/clothing/items/${ids.trousers}/return`, { date: '2026-09-30', retire: true }, officer).expect(200);
    expect(trousers.body).toMatchObject({ status: 'retired', holderId: null, impregnationDueOn: null });
    expect((await get(`/clothing/persons/${ids.anna}`, officer)).body.items).toEqual([]);

    await post(`/masterdata/persons/${ids.anna}/transfer-to-veterans`, { departmentId: ids.veterans, on: '2026-10-01' }).expect(201);
    // Now in the veterans department, outside the officer's department; the history stays.
    const history = (await get(`/clothing/persons/${ids.anna}`)).body.history as { kind: string }[];
    expect(history.filter((h) => h.kind === 'return')).toHaveLength(2);
  });

  it('offers lists, deadlines and search', async () => {
    const lists = (await get('/core/lists', officer).expect(200)).body as { id: string }[];
    expect(lists.map((l) => l.id)).toEqual(expect.arrayContaining(['clothing.issued', 'clothing.due']));
    const due = (await get('/core/lists/clothing.due?until=2027-12-31', officer).expect(200)).body;
    expect(due.rows.map((r: { number: string }) => r.number)).toContain('J-001');
    const hits = (await get('/core/search?q=J-001', officer).expect(200)).body as { to: string }[];
    expect(hits.some((h) => h.to === `/clothing/items/${ids.jacket}`)).toBe(true);
  });
});

const piece = async (inventoryNumber: string, articleKey: string, extra: Record<string, unknown> = {}, cookie = officer) =>
  (await post('/clothing/items', { articleKey, inventoryNumber, departmentId: ids.musterstadt, ...extra }, cookie).expect(201)).body.id as string;
const item = async (id: string) => (await get(`/clothing/items/${id}`, officer).expect(200)).body;

describe('clothing store: checks, blocks and corrections', () => {
  it('refuses dates in the future and issues before the purchase or the last return', async () => {
    expect((await post('/clothing/care', { itemIds: [ids.jacket], kind: 'wash', date: FUTURE }, officer).expect(400)).body).toMatchObject({ code: 'clothing.dateInFuture' });
    await post(`/clothing/items/${ids.jacket}/inspections`, { date: FUTURE, passed: true }, officer).expect(400);
    await post(`/clothing/items/${ids.jacket}/issue`, { personId: ids.wart, date: FUTURE }, officer).expect(400);
    await post('/clothing/consumables', { personId: ids.wart, articleKey: 'gloves', date: FUTURE }, officer).expect(400);
    // J-001 was taken back on 2026-09-30; an earlier issue would leave no period in use.
    expect((await post(`/clothing/items/${ids.jacket}/issue`, { personId: ids.wart, date: '2026-09-01' }, officer).expect(400)).body).toMatchObject({ code: 'clothing.issueBeforeReturn' });
    ids.jacket2 = ((await get('/clothing/items?q=J-002', officer)).body as { id: string }[])[0].id;
    expect((await post(`/clothing/items/${ids.jacket2}/issue`, { personId: ids.wart, date: '2026-01-01' }, officer).expect(400)).body).toMatchObject({ code: 'clothing.issueBeforePurchase' });

    const issued = await post(`/clothing/items/${ids.jacket}/issue`, { personId: ids.wart, date: today }, officer).expect(200);
    expect(issued.body.impregnationDueOn).not.toBeNull();
    await post(`/clothing/items/${ids.jacket}/return`, { date: FUTURE }, officer).expect(400);
  });

  it('refuses issuing to the veterans', async () => {
    expect((await post(`/clothing/items/${ids.jacket2}/issue`, { personId: ids.anna, date: today }, officer).expect(400)).body).toMatchObject({ code: 'clothing.personVeteran' });
    await post('/clothing/consumables', { personId: ids.anna, articleKey: 'gloves', date: today }, officer).expect(400);
  });

  it('blocks a piece after a failed inspection until one is passed; a failed one keeps the interval', async () => {
    ids.boots2 = await piece('S-002', 'boots', { size: '44', purchasedOn: '2025-01-10' });
    await post(`/clothing/items/${ids.boots2}/inspections`, { date: '2026-10-01', passed: false, notes: 'Sohle gelöst' }, officer).expect(201);
    expect(await item(ids.boots2)).toMatchObject({ blockedBy: ['inspection'], lastInspectedOn: '2026-10-01', lastInspectionPassed: false, inspectionDueOn: '2026-01-10' });
    expect((await post(`/clothing/items/${ids.boots2}/issue`, { personId: ids.wart, date: today, acceptOverdueInspection: true }, officer).expect(400)).body).toMatchObject({ code: 'clothing.failedInspection' });

    // Several pieces in one step, one result each.
    ids.boots3 = await piece('S-003', 'boots', { size: '44', purchasedOn: '2025-01-10' });
    const inspected = await post('/clothing/inspections', { date: today, inspector: 'Fachfirma', results: [{ itemId: ids.boots2, passed: true }, { itemId: ids.boots, passed: true }] }, officer).expect(201);
    expect(inspected.body).toHaveLength(2);
    expect(await item(ids.boots2)).toMatchObject({ blockedBy: [], lastInspectionPassed: true, lastInspectedOn: today });

    // Overdue inspection: issued only when accepted.
    expect((await post(`/clothing/items/${ids.boots3}/issue`, { personId: ids.wart, date: today }, officer).expect(409)).body).toMatchObject({ code: 'clothing.inspectionOverdue', number: 'S-003' });
    await post(`/clothing/items/${ids.boots3}/issue`, { personId: ids.wart, date: today, acceptOverdueInspection: true }, officer).expect(200);
  });

  it('issues several pieces at once, takes them back to the laundry and keeps them until washed', async () => {
    ids.jacket10 = await piece('J-010', 'jacket', { purchasedOn: '2026-01-15' });
    ids.trousers10 = await piece('H-010', 'trousers', { purchasedOn: '2026-01-15' });
    // All or none: the retired trousers stop the whole issue.
    await post('/clothing/issue', { personId: ids.wart, date: today, itemIds: [ids.jacket10, ids.trousers10, ids.trousers] }, officer).expect(400);
    expect((await item(ids.jacket10)).status).toBe('stock');
    const issued = await post('/clothing/issue', { personId: ids.wart, date: today, itemIds: [ids.jacket10, ids.trousers10] }, officer).expect(200);
    expect(issued.body.map((i: { status: string }) => i.status)).toEqual(['issued', 'issued']);

    // Boots are not washed.
    expect((await post('/clothing/return', { date: today, items: [{ itemId: ids.boots3, laundry: true }] }, officer).expect(400)).body).toMatchObject({ code: 'clothing.notTextile' });
    const back = await post('/clothing/return', { date: today, notes: 'nach Brandeinsatz', items: [{ itemId: ids.jacket10, laundry: true }, { itemId: ids.trousers10, retire: true }] }, officer).expect(200);
    expect(back.body).toMatchObject([{ status: 'stock', blockedBy: ['laundry'] }, { status: 'retired', blockedBy: [] }]);
    expect((await post(`/clothing/items/${ids.jacket10}/issue`, { personId: ids.wart, date: today }, officer).expect(400)).body).toMatchObject({ code: 'clothing.awaitingLaundry' });
    await post('/clothing/care', { itemIds: [ids.jacket10], kind: 'wash', date: today }, officer).expect(201);
    expect((await item(ids.jacket10)).blockedBy).toEqual([]);
  });

  it('cancels wrong entries with a reason; they stay visible', async () => {
    const [care] = (await post('/clothing/care', { itemIds: [ids.jacket], kind: 'impregnation', date: today }, officer).expect(201)).body;
    expect((await item(ids.jacket)).lastImpregnatedOn).toBe(today);
    await post(`/clothing/care/${care.id}/cancel`, { reason: '' }, officer).expect(400);
    await post(`/clothing/care/${care.id}/cancel`, { reason: 'falsches Stück' }, leader).expect(403);
    expect((await post(`/clothing/care/${care.id}/cancel`, { reason: 'falsches Stück' }, officer).expect(200)).body).toMatchObject({ cancelledBy: 'Kleiderwart', cancelReason: 'falsches Stück' });
    await post(`/clothing/care/${care.id}/cancel`, { reason: 'nochmal' }, officer).expect(409);
    const jacket = await item(ids.jacket);
    expect(jacket).toMatchObject({ lastImpregnatedOn: '2026-06-10' });
    expect(jacket.care[0]).toMatchObject({ id: care.id, cancelledBy: 'Kleiderwart' });

    // Only the last issue or return of a piece: the issue to Wanda goes, the piece is back in stock.
    const history = jacket.history as { id: string; kind: string; personId: string }[];
    await post(`/clothing/issues/${history[1].id}/cancel`, { reason: 'Versehen' }, officer).expect(409);
    await post(`/clothing/issues/${history[0].id}/cancel`, { reason: 'falsche Person' }, officer).expect(200);
    expect(await item(ids.jacket)).toMatchObject({ status: 'stock', holderId: null });
    // Cancelling a return gives the piece back.
    const tenHistory = (await item(ids.jacket10)).history as { id: string; kind: string }[];
    await post(`/clothing/issues/${tenHistory[0].id}/cancel`, { reason: 'nicht abgegeben' }, officer).expect(200);
    expect(await item(ids.jacket10)).toMatchObject({ status: 'issued', holderId: ids.wart, issuedOn: today });

    // A cancelled passed inspection: the failed one before counts again.
    const inspections = (await item(ids.boots2)).inspections as { id: string; passed: boolean }[];
    await post(`/clothing/inspections/${inspections.find((i) => i.passed)!.id}/cancel`, { reason: 'anderes Stück geprüft' }, officer).expect(200);
    expect((await item(ids.boots2)).blockedBy).toEqual(['inspection']);

    const gloves = (await post('/clothing/consumables', { personId: ids.wart, articleKey: 'gloves', size: '9', date: today }, officer).expect(201)).body;
    await post(`/clothing/issues/${gloves.id}/cancel`, { reason: 'doppelt erfasst' }, officer).expect(200);
    const wanda = (await get(`/clothing/persons/${ids.wart}`, officer)).body.history as { id: string; cancelledAt: string | null }[];
    expect(wanda.find((h) => h.id === gloves.id)?.cancelledAt).not.toBeNull();
  });

  it('checks sizes against the article and refuses inactive articles', async () => {
    const articles = (await get('/clothing/articles')).body as ({ id: string; key: string } & Record<string, unknown>)[];
    const update = (key: string, change: Record<string, unknown>) => {
      const { id, version: _version, ...article } = articles.find((a) => a.key === key)!;
      return put(`/clothing/articles/${id}`, { ...article, ...change }).expect(200);
    };
    await update('jacket', { sizes: ['48', '50', '52', '54'], minimumStock: { '52': 5, '99': 1 } });
    expect((await post('/clothing/items', { articleKey: 'jacket', inventoryNumber: 'J-020', size: '99', departmentId: ids.musterstadt }, officer).expect(400)).body).toMatchObject({ code: 'clothing.unknownSize' });
    ids.jacket20 = await piece('J-020', 'jacket', { size: '52' });
    expect((await post('/clothing/consumables', { personId: ids.wart, articleKey: 'cap', size: '58', date: today }, officer).expect(201)).body).toMatchObject({ size: '58' });

    ids.helmet = await piece('HE-001', 'helmet');
    await update('helmet', { active: false });
    expect((await post(`/clothing/items/${ids.helmet}/issue`, { personId: ids.wart, date: today }, officer).expect(400)).body).toMatchObject({ code: 'clothing.articleInactive' });
    await post('/clothing/items', { articleKey: 'helmet', inventoryNumber: 'HE-002', departmentId: ids.musterstadt }, officer).expect(400);
  });

  it('lists the stock per size with minimum stock and the counter of consumables', async () => {
    await post('/clothing/consumables/receipts', { articleKey: 'gloves', size: '9', quantity: 10, date: today }, leader).expect(403);
    await post('/clothing/consumables/receipts', { articleKey: 'jacket', size: '52', quantity: 10, date: today }, officer).expect(400);
    const stock = (await post('/clothing/consumables/receipts', { articleKey: 'gloves', size: '9', quantity: 10, date: today }, officer).expect(201)).body as { articleKey: string; size: string }[];
    // 10 received, 2 handed to Anna (the cancelled pair does not count).
    expect(stock.find((r) => r.articleKey === 'gloves' && r.size === '9')).toMatchObject({ kind: 'consumable', available: 8 });
    const rows = (await get('/clothing/stock', officer).expect(200)).body as { articleKey: string; size: string }[];
    // Jackets of size 52 in stock: J-001, J-002, J-020; the minimum is 5. The unknown size of the minimum is dropped.
    expect(rows.find((r) => r.articleKey === 'jacket' && r.size === '52')).toMatchObject({ available: 3, minimum: 5, reorder: true });
    expect(rows.some((r) => r.articleKey === 'jacket' && r.size === '99')).toBe(false);
    expect(rows.find((r) => r.articleKey === 'boots' && r.size === '44')).toMatchObject({ available: 0, blocked: 1, issued: 1 });
  });

  it('keeps the clothing sizes of a person', async () => {
    const saved = await put(`/clothing/persons/${ids.wart}/sizes`, { sizes: { jacket: '52', boots: '', unknown: 'x' } }, officer).expect(200);
    expect(saved.body.sizes).toEqual({ jacket: '52' });
    expect((await get(`/clothing/persons/${ids.wart}`, officer)).body.sizes).toEqual({ jacket: '52' });
    await put(`/clothing/persons/${ids.wart}/sizes`, { sizes: { jacket: '50' } }, leader).expect(403);
  });

  it('lets members find the pieces they hold by a scanned code', async () => {
    const roles = (await get('/core/roles')).body as { id: string; templateKey: string }[];
    const member = roles.find((r) => r.templateKey === 'member')!.id;
    await post('/core/users', { username: 'ben', displayName: 'Ben', password: 'auch-sehr-geheim', personId: ids.ben, roles: [{ roleId: member, departmentId: ids.ahornfeld }] }).expect(201);
    const ben = await test.login({ username: 'ben', password: 'auch-sehr-geheim' });
    const own = (await post('/clothing/items', { articleKey: 'jacket', inventoryNumber: 'J-030', size: '50', barcode: 'BEN-1', departmentId: ids.ahornfeld }).expect(201)).body.id;
    await post(`/clothing/items/${own}/issue`, { personId: ids.ben, date: today }).expect(200);
    const hits = (await get('/core/codes?code=ben-1', ben).expect(200)).body;
    expect(hits).toEqual([expect.objectContaining({ title: 'J-030 Einsatzjacke', to: '/me' })]);
    expect((await get('/core/codes?code=PSA-J-001', ben).expect(200)).body).toEqual([]);
  });
});
