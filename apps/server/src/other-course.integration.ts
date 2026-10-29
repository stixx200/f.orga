import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setUp, startTestApp, type TestApp, UI } from './testing/test-app';

/** The collective course "other course": attendances name the actual course in a description and grant no qualification. */
let test: TestApp;
let admin: string;
const ids: Record<string, string> = {};

const post = (path: string, body: unknown) => test.http.post(`/api${path}`).set('Cookie', admin).set(UI).send(body as object);
const get = (path: string) => test.http.get(`/api${path}`).set('Cookie', admin);

type Attendance = { id: string; course: string; startsOn: string; result: string; description: string };
const attendances = async (person = ids.person) => (await get(`/masterdata/persons/${person}/course-attendances`).expect(200)).body as Attendance[];
const qualifications = async (person = ids.person) => ((await get(`/masterdata/persons/${person}`).expect(200)).body as { qualifications: { qualification: string; courseAttendanceId: string | null }[] }).qualifications;

/** Uploads a CSV and runs the profile with the suggested columns. */
async function importCsv(profile: string, lines: string[], apply: boolean, mappings: Record<string, Record<string, string>> = {}, status = 200) {
  const upload = await test.http.post('/api/core/imports').set('Cookie', admin).set(UI).attach('file', Buffer.from(lines.join('\r\n')), 'tabelle.csv').expect(201);
  return (await post(`/core/imports/${upload.body.id}/${apply ? 'apply' : 'preview'}`, { profile, mapping: upload.body.suggestions[profile], mappings }).expect(status)).body as {
    code?: string;
    counts: Record<string, number>;
    unmatched: { kind: string; value: string; count: number }[];
    rows: { row: number; action: string; messages: { code: string }[] }[];
  };
}
const career = (...rows: [string, string][]) => ['Name;Art;Bezeichnung;Datum', ...rows.map(([name, date]) => `Keller Jonas;Lehrgang;${name};${date}`)];

beforeAll(async () => {
  test = await startTestApp();
  admin = await setUp(test);
  await post('/masterdata/catalog/templates/bw', {}).expect(201);
  await post('/masterdata/courses/templates/bw', {}).expect(201);
  ids.department = (await post('/masterdata/departments', { name: 'Abteilung Musterstadt', shortName: 'Musterstadt', type: 'operational' }).expect(201)).body.id;
  ids.person = (
    await post('/masterdata/persons', { firstName: 'Jonas', lastName: 'Keller', status: 'active', memberships: [{ departmentId: ids.department, from: '2020-01-01', primary: true }] }).expect(201)
  ).body.id;
});

afterAll(() => test?.app.close());

describe('collective course "other course"', () => {
  it('is a course of the BW template granting nothing, not a qualification', async () => {
    const courses = (await get('/masterdata/courses').expect(200)).body as { key: string; describe: boolean; grantsQualifications: string[] }[];
    expect(courses.find((c) => c.key === 'other-course')).toMatchObject({ name: { de: 'Anderer Lehrgang', en: 'Other course' }, describe: true, grantsQualifications: [] });
    expect(courses.find((c) => c.key === 'machinist')).toMatchObject({ describe: false });
    const catalog = (await get('/masterdata/catalog?kind=qualification').expect(200)).body as { key: string; attributes: Record<string, unknown> }[];
    expect(catalog.map((e) => e.key)).not.toContain('other-course');
    expect(catalog.find((e) => e.key === 'machinist')?.attributes).not.toHaveProperty('describe');
  });

  it('refuses an attendance without description or with only the course name', async () => {
    for (const description of [undefined, '  ', 'Anderer Lehrgang', 'other-course']) {
      const refused = await post(`/masterdata/persons/${ids.person}/course-attendances`, { course: 'other-course', startsOn: '2024-03-01', result: 'passed', description }).expect(400);
      expect(refused.body).toMatchObject({ code: 'masterdata.descriptionRequired' });
    }
  });

  it('keeps the description of the attendance, grants no qualification and drops it on other courses', async () => {
    const created = await post(`/masterdata/persons/${ids.person}/course-attendances`, { course: 'other-course', startsOn: '2024-03-01', result: 'passed', description: ' Erste Hilfe ' }).expect(201);
    expect(created.body).toMatchObject({ course: 'other-course', description: 'Erste Hilfe' });
    await post(`/masterdata/persons/${ids.person}/course-attendances`, { course: 'truppmann-1', startsOn: '2024-05-01', result: 'passed', description: 'ignored' }).expect(201);
    expect(await attendances()).toEqual([
      expect.objectContaining({ course: 'other-course', startsOn: '2024-03-01', description: 'Erste Hilfe' }),
      expect.objectContaining({ course: 'truppmann-1', startsOn: '2024-05-01', description: '' }),
    ]);
    expect((await qualifications()).map((q) => q.qualification)).toEqual(['truppmann-1']);
  });

  it('counts "passed once" per description', async () => {
    const twice = await post(`/masterdata/persons/${ids.person}/course-attendances`, { course: 'other-course', startsOn: '2025-03-01', result: 'passed', description: 'Erste Hilfe' }).expect(409);
    expect(twice.body).toMatchObject({ code: 'masterdata.coursePassedAlready' });
    await post(`/masterdata/persons/${ids.person}/course-attendances`, { course: 'other-course', startsOn: '2025-03-01', result: 'passed', description: 'Motorsäge' }).expect(201);
  });

  it('records results of several persons with one description', async () => {
    const results = { course: 'other-course', startsOn: '2025-04-01', results: [{ personId: ids.person, result: 'passed' }] };
    expect((await post('/masterdata/course-results', results).expect(400)).body).toMatchObject({ code: 'masterdata.descriptionRequired' });
    expect((await post('/masterdata/course-results', { ...results, description: 'Absturzsicherung' }).expect(201)).body).toEqual({ recorded: 1, skipped: [] });
    expect((await attendances()).map((a) => a.description)).toContain('Absturzsicherung');
  });

  it('shows the description in the course year and keeps the course out of the needs and the qualification matrix', async () => {
    const year = (await get('/core/lists/masterdata.course-year?year=2024&lang=de').expect(200)).body as { rows: { course: string }[] };
    expect(year.rows.map((r) => r.course)).toEqual(['Anderer Lehrgang: Erste Hilfe', 'Truppmann Teil 1']);
    const needs = (await get('/masterdata/course-needs').expect(200)).body as { course: string }[];
    expect(needs.map((n) => n.course)).not.toContain('other-course');
    const matrix = (await get('/core/lists/masterdata.qualification-matrix?lang=de').expect(200)).body as { columns: { key: string }[]; rows: Record<string, string>[] };
    expect(matrix.columns.map((c) => c.key)).not.toContain('other-course');
    expect(matrix.rows).toEqual([expect.objectContaining({ name: 'Keller, Jonas', 'truppmann-1': 'x' })]);
  });
});

describe('career import of courses', () => {
  it('offers the courses as targets of course names', async () => {
    const entries = (await get('/core/imports/lookups/qualification').expect(200)).body as { key: string; name: { de: string } }[];
    expect(entries).toContainEqual({ key: 'course:other-course', name: { de: 'Anderer Lehrgang (Lehrgangsteilnahme)', en: 'Other course (course attendance)' } });
    expect(entries).toContainEqual(expect.objectContaining({ key: 'machinist' }));
    expect((await importCsv('masterdata.career', career(['Holz in Spannung', '01.06.2023']), false, { qualification: { 'Holz in Spannung': 'course:unknown' } }, 400)).code).toBe('imports.unknownMappingTarget');
  });

  it('records a name mapped to "other course" as attendance with the name as description and no qualification', async () => {
    const rows = career(['Holz in Spannung', '01.06.2023'], ['Anderer Lehrgang', '01.07.2023']);
    const preview = await importCsv('masterdata.career', rows, false);
    expect(preview.unmatched).toEqual([{ kind: 'qualification', value: 'Holz in Spannung', count: 1 }, { kind: 'qualification', value: 'Anderer Lehrgang', count: 1 }]);

    const mappings = { qualification: { 'Holz in Spannung': 'course:other-course', 'Anderer Lehrgang': 'course:other-course' } };
    const applied = await importCsv('masterdata.career', rows, true, mappings);
    expect(applied.counts).toMatchObject({ create: 1, error: 1 });
    expect(applied.rows.find((r) => r.action === 'error')?.messages).toEqual([expect.objectContaining({ code: 'masterdata.descriptionRequired' })]);
    expect(await attendances()).toContainEqual(expect.objectContaining({ course: 'other-course', startsOn: '2023-06-01', result: 'passed', description: 'Holz in Spannung' }));
    expect((await qualifications()).map((q) => q.qualification)).toEqual(['truppmann-1']);
  });

  it('finds the attendance again on a repeated import', async () => {
    const before = (await attendances()).length;
    // Remembered from the apply before: no mapping needed.
    const again = await importCsv('masterdata.career', career(['Holz in Spannung', '01.06.2023']), true);
    expect(again.counts).toMatchObject({ create: 0, unchanged: 1 });
    expect(await attendances()).toHaveLength(before);
    expect((await get('/core/imports/mappings?kind=qualification').expect(200)).body).toContainEqual(expect.objectContaining({ value: 'Holz in Spannung', key: 'course:other-course', targetState: 'active' }));
  });

  it('records a name of a course without own qualification as attendance granting its qualifications', async () => {
    await post('/masterdata/catalog', { kind: 'qualification', key: 'chainsaw-operator', name: { de: 'Motorsägenführer', en: 'Chainsaw operator' } }).expect(201);
    await post('/masterdata/courses', { key: 'chainsaw', name: { de: 'Motorsägen-Grundlehrgang', en: 'Chainsaw basic course' }, level: 'municipal', grantsQualifications: ['chainsaw-operator'] }).expect(201);
    const applied = await importCsv('masterdata.career', career(['Motorsägen-Grundlehrgang', '01.02.2022']), true);
    expect(applied.counts).toMatchObject({ create: 1 });
    const attendance = (await attendances()).find((a) => a.course === 'chainsaw');
    expect(attendance).toMatchObject({ startsOn: '2022-02-01', result: 'passed', description: '' });
    expect(await qualifications()).toContainEqual(expect.objectContaining({ qualification: 'chainsaw-operator', courseAttendanceId: attendance?.id }));
    expect((await importCsv('masterdata.career', career(['Motorsägen-Grundlehrgang', '01.02.2022']), true)).counts).toMatchObject({ unchanged: 1 });
  });
});
