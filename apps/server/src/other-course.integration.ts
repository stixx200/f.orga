import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setUp, startTestApp, type TestApp, UI } from './testing/test-app';

let test: TestApp;
let admin: string;
const ids: Record<string, string> = {};

const post = (path: string, body: unknown) => test.http.post(`/api${path}`).set('Cookie', admin).set(UI).send(body as object);
const get = (path: string) => test.http.get(`/api${path}`).set('Cookie', admin);

type Qualification = { qualification: string; acquiredOn: string; description: string };

beforeAll(async () => {
  test = await startTestApp();
  admin = await setUp(test);
  await post('/masterdata/catalog/templates/bw', {}).expect(201);
  ids.department = (await post('/masterdata/departments', { name: 'Abteilung Musterstadt', shortName: 'Musterstadt', type: 'operational' }).expect(201)).body.id;
  ids.person = (
    await post('/masterdata/persons', { firstName: 'Jonas', lastName: 'Keller', status: 'active', memberships: [{ departmentId: ids.department, from: '2020-01-01', primary: true }] }).expect(201)
  ).body.id;
});

afterAll(() => test?.app.close());

describe('collective qualification "other course"', () => {
  it('is part of the BW template and needs a description', async () => {
    const catalog = (await get('/masterdata/catalog?kind=qualification').expect(200)).body as { key: string; name: unknown; attributes: Record<string, unknown> }[];
    expect(catalog.find((e) => e.key === 'other-course')).toMatchObject({ name: { de: 'Anderer Lehrgang', en: 'Other course' }, attributes: { validityMonths: null, describe: true } });
    expect(catalog.find((e) => e.key === 'machinist')?.attributes).toMatchObject({ describe: false });
  });

  it('refuses a qualification of the entry without description', async () => {
    const refused = await post(`/masterdata/persons/${ids.person}/qualifications`, { qualification: 'other-course', acquiredOn: '2024-03-01', description: '  ' }).expect(400);
    expect(refused.body).toMatchObject({ code: 'masterdata.descriptionRequired' });
  });

  it('keeps the description of the entry and drops it on other entries', async () => {
    await post(`/masterdata/persons/${ids.person}/qualifications`, { qualification: 'other-course', acquiredOn: '2024-03-01', description: 'Erste Hilfe' }).expect(201);
    const person = await post(`/masterdata/persons/${ids.person}/qualifications`, { qualification: 'machinist', acquiredOn: '2024-05-01', description: 'ignored' }).expect(201);
    expect(person.body.qualifications).toEqual([
      expect.objectContaining({ qualification: 'other-course', acquiredOn: '2024-03-01', description: 'Erste Hilfe' }),
      expect.objectContaining({ qualification: 'machinist', acquiredOn: '2024-05-01', description: '' }),
    ]);
  });

  it('lists the described courses in the qualification matrix', async () => {
    await post(`/masterdata/persons/${ids.person}/qualifications`, { qualification: 'other-course', acquiredOn: '2024-04-01', description: 'Holz in Spannung' }).expect(201);
    const matrix = await get('/core/lists/masterdata.qualification-matrix?lang=de').expect(200);
    expect(matrix.body.columns).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'other-course', label: { de: 'Anderer Lehrgang', en: 'Other course' } })]));
    expect(matrix.body.rows).toEqual([expect.objectContaining({ name: 'Keller, Jonas', machinist: 'x', 'other-course': 'Erste Hilfe, Holz in Spannung' })]);
  });

  it('describes the entry by the name of a course that grants it', async () => {
    await post('/masterdata/courses', { key: 'chainsaw', name: { de: 'Motorsägenlehrgang', en: 'Chainsaw course' }, level: 'municipal', grantsQualifications: ['other-course'] }).expect(201);
    await post(`/masterdata/persons/${ids.person}/course-attendances`, { course: 'chainsaw', startsOn: '2025-02-01', result: 'passed' }).expect(201);
    const person = (await get(`/masterdata/persons/${ids.person}`).expect(200)).body as { qualifications: Qualification[] };
    expect(person.qualifications.filter((q) => q.qualification === 'other-course').map((q) => q.description)).toEqual(['Erste Hilfe', 'Holz in Spannung', 'Motorsägenlehrgang']);
  });
});
