import { IncidentSettings } from '@forga/incidents-contracts';
import { type Assignment, evaluateRules, overlaps, type RuleInput } from './rules.js';

const settings = IncidentSettings.parse({});
const T = (time: string) => `2026-10-21T${time}:00+02:00`;

const person = (key: string, extra: Partial<Assignment> = {}): Assignment => ({
  key,
  personId: key,
  label: key,
  vehicleId: 'lf',
  standbyStationId: null,
  from: T('13:05'),
  to: T('15:50'),
  breathingApparatus: false,
  lossOfEarnings: false,
  duringWorkingHours: false,
  rateMissing: false,
  ...extra,
});

const base = (extra: Partial<RuleInput> = {}): RuleInput => ({
  primary: true,
  incidentHasPrimary: true,
  times: { alarmedAt: T('13:05'), returnedAt: T('15:50') },
  situation: 'Rauch aus Fenster',
  actions: 'Innenangriff',
  statistics: { ownMunicipality: true, mainType: 'fire', fireSize: 'small-b', technicalCategory: null, falseAlarmType: null, disasterPreAlarm: false, disasterOperation: false, rescued: 0, rescuedSmokeInhalation: 0, dead: 0, vehicleFire: false, trafficAccident: false, animalsRescued: 0 },
  departmentType: 'operational',
  keyword: { mainType: 'fire', requiresVehicle: true },
  personnel: [person('jonas')],
  sameIncident: [],
  otherIncidents: [],
  vehicleSeats: new Map([['lf', 9]]),
  qualifications: new Map([['jonas', ['breathing-apparatus']]]),
  ...extra,
});

const rules = (input: RuleInput, s = settings) => evaluateRules(input, s).map((f) => `${f.level}:${f.rule}${f.subject ? `:${f.subject}` : ''}`);

describe('evaluateRules', () => {
  it('accepts a complete report', () => {
    expect(rules(base())).toEqual([]);
  });

  it('requires a primary report, content and personnel', () => {
    expect(rules(base({ incidentHasPrimary: false, situation: '', actions: '', personnel: [] }))).toEqual([
      'error:primary-missing',
      'error:report-empty',
      'error:no-personnel',
    ]);
  });

  it('requires statistics on the primary report only, and none for uncounted keywords', () => {
    expect(rules(base({ statistics: null }))).toEqual(['error:statistics-missing']);
    expect(rules(base({ primary: false }))).toEqual(['error:statistics-not-allowed']);
    expect(rules(base({ keyword: { mainType: null, requiresVehicle: false } }))).toEqual(['error:statistics-not-allowed']);
    expect(rules(base({ keyword: { mainType: null, requiresVehicle: false }, statistics: null }))).toEqual([]);
  });

  it('requires a vehicle or standby, except for command units and keywords without vehicles', () => {
    const onFoot = [person('jonas', { vehicleId: null })];
    expect(rules(base({ personnel: onFoot }))).toEqual(['error:vehicle-missing:jonas']);
    expect(rules(base({ personnel: [person('jonas', { vehicleId: null, standbyStationId: 'station' })] }))).toEqual([]);
    expect(rules(base({ personnel: onFoot, departmentType: 'command' }))).toEqual([]);
    expect(rules(base({ personnel: onFoot, keyword: { mainType: 'fire', requiresVehicle: false } }))).toEqual([]);
  });

  it('reports overlaps within the incident as error and with other incidents as warning', () => {
    expect(
      rules(base({ sameIncident: [{ department: 'Ahornfeld', assignments: [{ personId: 'jonas', from: T('15:00'), to: T('16:00') }] }] })),
    ).toEqual(['error:personnel-overlap-incident:jonas']);
    // Back-to-back assignments are allowed.
    expect(
      rules(base({ sameIncident: [{ department: 'Ahornfeld', assignments: [{ personId: 'jonas', from: T('15:50'), to: T('17:00') }] }] })),
    ).toEqual([]);
    expect(rules(base({ otherIncidents: [{ dispatchNumber: '2026-1', personId: 'jonas', from: T('12:00'), to: T('13:30') }] }))).toEqual([
      'warning:personnel-overlap-other:jonas',
    ]);
    // Duty officer periods over 24 hours are ignored.
    expect(
      rules(base({ otherIncidents: [{ dispatchNumber: 'EvD', personId: 'jonas', from: '2026-10-20T00:00:00+02:00', to: '2026-10-23T00:00:00+02:00' }] })),
    ).toEqual([]);
  });

  it('checks times, crew size, working hours, rates and breathing apparatus qualification', () => {
    expect(rules(base({ times: { alarmedAt: T('15:00'), returnedAt: T('14:00') } }))).toEqual(['error:times-invalid']);
    expect(rules(base({ times: { alarmedAt: T('13:00'), returnedAt: '2026-10-22T14:00:00+02:00' } }))).toEqual(['warning:duration-long']);
    expect(rules(base({ vehicleSeats: new Map([['lf', 0]]) }))).toEqual([]);
    expect(rules(base({ personnel: [person('a'), person('b')], vehicleSeats: new Map([['lf', 1]]), qualifications: new Map() }))).toEqual([
      'warning:crew-exceeded:lf',
    ]);
    expect(rules(base({ personnel: [person('jonas', { duringWorkingHours: true, lossOfEarnings: true, rateMissing: true })] }))).toEqual([
      'error:working-hours-and-loss-of-earnings:jonas',
      'warning:rate-missing:jonas',
    ]);
    expect(rules(base({ personnel: [person('lena', { breathingApparatus: true })] }))).toEqual([
      'warning:breathing-without-qualification:lena',
    ]);
    // Wearers with a red traffic light of the respiratory protection module.
    const wearer = { personnel: [person('jonas', { breathingApparatus: true })], qualifications: new Map([['jonas', ['breathing-apparatus']]]) };
    expect(rules(base({ ...wearer, breathingFitness: new Map([['jonas', 'red' as const]]) }))).toEqual(['warning:breathing-not-fit:jonas']);
    expect(rules(base({ ...wearer, breathingFitness: new Map([['jonas', 'yellow' as const]]) }))).toEqual([]);
  });

  it('applies the rule settings', () => {
    const custom = IncidentSettings.parse({ rules: { 'report-empty': { enabled: false }, 'no-personnel': { level: 'warning' } } });
    expect(rules(base({ situation: '', actions: '', personnel: [] }), custom)).toEqual(['warning:no-personnel']);
  });
});

describe('overlaps', () => {
  it('treats touching intervals as not overlapping', () => {
    expect(overlaps({ from: T('10:00'), to: T('11:00') }, { from: T('11:00'), to: T('12:00') })).toBe(false);
    expect(overlaps({ from: T('10:00'), to: T('11:01') }, { from: T('11:00'), to: T('12:00') })).toBe(true);
  });
});
