import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setUp, startTestApp, type TestApp, UI } from './testing/test-app';

let test: TestApp;
let admin: string;
let officer: string;
let leader: string;
const ids: Record<string, string> = {};

const post = (path: string, body: unknown, cookie = admin) => test.http.post(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const get = (path: string, cookie = admin) => test.http.get(`/api${path}`).set('Cookie', cookie);

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
    ids.jacket = (await piece('J-001').expect(201)).body.id;
    ids.trousers = (await piece('H-001', 'trousers').expect(201)).body.id;
    await piece('J-001').expect(409);
    // Consumables have no pieces; another department's store is not the officer's.
    await piece('G-001', 'gloves').expect(400);
    await piece('J-900', 'jacket', ids.ahornfeld).expect(403);

    const issued = await post(`/clothing/items/${ids.jacket}/issue`, { personId: ids.anna, date: '2026-02-01' }, officer).expect(200);
    expect(issued.body).toMatchObject({ status: 'issued', holderId: ids.anna, issuedOn: '2026-02-01', impregnationDueOn: '2027-01-15' });
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
    // The group leader has no right in the clothing store: no hits and no input mask.
    expect(await lookup('psa-j-001', leader)).toEqual([]);
    expect((await get('/core/codes/modules', leader).expect(200)).body).not.toContain('clothing');
    expect((await get('/core/codes/modules', officer).expect(200)).body).toContain('clothing');
  });

  it('records washing and impregnation; impregnating counts as washing and restarts the interval', async () => {
    await post('/clothing/care', { itemIds: [ids.jacket, ids.trousers], kind: 'wash', date: '2026-03-01', place: 'Feuerwehrhaus' }, officer).expect(201);
    let jacket = (await get(`/clothing/items/${ids.jacket}`, officer).expect(200)).body;
    expect(jacket).toMatchObject({ lastWashedOn: '2026-03-01', lastImpregnatedOn: null, impregnationDueOn: '2027-01-15' });
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
