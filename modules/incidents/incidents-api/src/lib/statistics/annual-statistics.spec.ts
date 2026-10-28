import type { IncidentStatistics } from '@forga/incidents-contracts';
import type { Department, PersonSnapshot, Vehicle } from '@forga/masterdata-contracts';
import { checkAnnualStatistics, computeAnnualStatistics, type StatisticsInput } from './annual-statistics.js';

const department = (id: string, type: Department['type'], specialTasks: Department['specialTasks'] = []): Department => ({
  id,
  name: id,
  shortName: id,
  type,
  parentId: null,
  specialTasks,
  commanderId: null,
  deputyIds: [],
  statisticsRelevant: true,
  population: null,
  version: 1,
});

const member = (departmentIds: string[], extra: Partial<PersonSnapshot> = {}): PersonSnapshot => ({
  id: Math.random().toString(),
  firstName: 'x',
  lastName: 'y',
  status: 'active',
  birthDate: null,
  departmentIds,
  primaryDepartmentId: departmentIds[0] ?? null,
  qualifications: [],
  rank: null,
  gender: 'male',
  employment: 'volunteer',
  musician: false,
  driverLicenseClasses: [],
  ...extra,
});

const stats = (extra: Partial<IncidentStatistics>): IncidentStatistics => ({
  ownMunicipality: true,
  mainType: 'fire',
  fireSize: null,
  technicalCategory: null,
  falseAlarmType: null,
  disasterPreAlarm: false,
  disasterOperation: false,
  rescued: 0,
  rescuedSmokeInhalation: 0,
  dead: 0,
  vehicleFire: false,
  trafficAccident: false,
  animalsRescued: 0,
  ...extra,
});

const input = (extra: Partial<StatisticsInput>): StatisticsInput => ({
  referenceDate: '2026-12-31',
  departments: [department('musterstadt', 'operational', ['height-rescue']), department('ahornfeld', 'operational'), department('jf', 'youth'), department('alt', 'veterans')],
  stationCount: 6,
  permanentlyStaffedStations: 0,
  members: [],
  vehicles: [],
  incidents: [],
  ownCasualties: [],
  ...extra,
});

const vehicle = (statisticsCategory: string, extra: Partial<Vehicle> = {}) =>
  ({ statisticsCategory, status: 'in-service', commissionedOn: null, decommissionedOn: null, ...extra }) as Vehicle;

const asMap = (values: ReturnType<typeof computeAnnualStatistics>) =>
  Object.fromEntries(values.map((v) => [`${v.question}:${v.column}`, v.value]));

describe('computeAnnualStatistics', () => {
  it('counts organisation and members per column', () => {
    const values = asMap(
      computeAnnualStatistics(
        input({
          members: [
            member(['musterstadt'], { gender: 'female', qualifications: ['breathing-apparatus', 'group-leader'], driverLicenseClasses: ['B', 'CE'] }),
            member(['musterstadt', 'ahornfeld'], { status: 'probation', employment: 'career-intermediate', musician: true }),
            member(['ahornfeld'], { status: 'passive' }),
            member(['jf'], { status: 'youth', gender: 'female' }),
            member(['alt'], { status: 'veterans' }),
          ],
        }),
      ),
    );
    expect(values).toEqual({
      'F2:D': 2, 'F2:F': 1, 'F2:G': 1, 'F7:D': 1, 'F10:D': 6,
      'F13:D': 2, 'F14:D': 1, 'F17:D': 1, 'F19:D': 1, 'F20:D': 1, 'F21:D': 1, 'F22:D': 1, 'F24:D': 1,
      'F12:F': 1, 'F19:F': 1, 'F12:G': 1,
    });
  });

  it('counts incidents of the own municipality by type and category, and assistance elsewhere separately', () => {
    const values = asMap(
      computeAnnualStatistics(
        input({
          incidents: [
            stats({ fireSize: 'small-b', rescued: 2, rescuedSmokeInhalation: 1 }),
            stats({ fireSize: 'medium', vehicleFire: true, dead: 1 }),
            stats({ ownMunicipality: false, fireSize: 'large' }),
            stats({ mainType: 'technical-assistance', technicalCategory: 'rescue-persons', rescued: 1, trafficAccident: true }),
            stats({ mainType: 'technical-assistance', technicalCategory: 'oil-trace', ownMunicipality: false }),
            stats({ mainType: 'false-alarm', falseAlarmType: 'fire-alarm-system' }),
            stats({ mainType: 'other' }),
          ],
          ownCasualties: [{ departmentType: 'operational', injured: true, killed: false }],
        }),
      ),
    );
    expect(values).toMatchObject({
      'F26:D': 1,
      'F28:D': 2, 'F30:D': 1, 'F31:D': 1, 'F33:D': 1, 'F34:D': 1,
      'F37:D': 1, 'F38:D': 1, 'F50:D': 1, 'F51:D': 1, 'F54:D': 1,
      'F55:D': 2, 'F57:D': 1, 'F58:D': 1, 'F59:D': 1, 'F60:D': 1,
    });
    expect(values['F32:D']).toBeUndefined();
    expect(values['F40:D']).toBeUndefined();
  });

  it('counts vehicles in service on the reference date', () => {
    const values = asMap(
      computeAnnualStatistics(
        input({
          vehicles: [vehicle('F70'), vehicle('F70'), vehicle('F65', { decommissionedOn: '2026-06-30' }), vehicle('F107', { commissionedOn: '2027-01-15' })],
        }),
      ),
    );
    expect(values).toMatchObject({ 'F70:D': 2 });
    expect(values['F65:D']).toBeUndefined();
    expect(values['F107:D']).toBeUndefined();
  });
});

describe('checkAnnualStatistics', () => {
  it('reports sums that do not add up', () => {
    const values: Record<string, number> = { 'F28:D': 3, 'F29:D': 1, 'F30:D': 1, 'F55:D': 1, 'F57:D': 2 };
    const failed = checkAnnualStatistics((key) => values[key] ?? 0).filter((c) => !c.ok);
    expect(failed.map((c) => c.code)).toEqual(['statistics.fireSizes', 'statistics.rescuedSmoke']);
  });
});
