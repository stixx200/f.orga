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
  keyword: { mainType: 'fire', requiresVehicle: true },
  personnel: [person('jonas')],
  sameIncident: [],
  otherIncidents: [],
  vehicles: new Map([['lf', { seats: 9, designation: 'LF 20' }]]),
  qualifications: new Map([['jonas', ['breathing-apparatus']]]),
  ...extra,
});

const facts = (extra: object = {}) => new Map([['jonas', { status: 'active', departmentIds: ['musterstadt'], birthDate: '1990-05-01', ...extra }]]);

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

  it('requires a vehicle or standby, except for keywords without vehicles', () => {
    const onFoot = [person('jonas', { vehicleId: null })];
    expect(rules(base({ personnel: onFoot }))).toEqual(['error:vehicle-missing:jonas']);
    expect(rules(base({ personnel: [person('jonas', { vehicleId: null, standbyStationId: 'station' })] }))).toEqual([]);
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
    const long = { times: { alarmedAt: T('13:00'), returnedAt: '2026-10-22T14:00:00+02:00' } };
    expect(rules(base(long))).toEqual(['warning:duration-long']);
    // The text uses the configured hours.
    const custom = IncidentSettings.parse({ longDurationHours: 12 });
    expect(evaluateRules(base({ times: { alarmedAt: T('00:00'), returnedAt: T('13:00') }, personnel: [person('jonas', { from: T('00:00'), to: T('13:00') })] }), custom).map((f) => [f.rule, f.params['hours']])).toEqual([
      ['duration-long', 12],
      ['personnel-duration-long', 12],
    ]);
    expect(rules(base({ vehicles: new Map([['lf', { seats: 0, designation: 'LF 20' }]]) }))).toEqual([]);
    const crowded = evaluateRules(base({ personnel: [person('a'), person('b')], vehicles: new Map([['lf', { seats: 1, designation: 'LF 20' }]]), qualifications: new Map() }), settings);
    expect(crowded.map((f) => `${f.level}:${f.rule}:${f.subject}`)).toEqual(['warning:crew-exceeded:lf']);
    // The text names the vehicle.
    expect(crowded[0].params).toEqual({ count: 2, seats: 1, vehicle: 'LF 20' });
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

  it('checks the order of the report times, the confirmed end and the alarm time of the incident', () => {
    expect(rules(base({ times: { alarmedAt: T('13:05'), departedAt: T('13:10'), arrivedAt: T('13:00'), returnedAt: T('15:50') } }))).toEqual(['warning:times-order']);
    expect(evaluateRules(base({ times: { alarmedAt: T('13:05'), endedAt: T('16:00'), returnedAt: T('15:50') } }), settings)[0]).toMatchObject({
      rule: 'times-order',
      params: { first: 'endedAt', second: 'returnedAt' },
    });
    expect(rules(base({ times: { alarmedAt: T('13:05'), departedAt: T('13:08'), arrivedAt: T('13:15'), endedAt: T('15:00'), returnedAt: T('15:50') } }))).toEqual([]);
    expect(rules(base({ endConfirmed: false }))).toEqual(['error:end-unconfirmed']);
    // Primary report: same alarm as the incident; departments alerted later start later, but never earlier.
    expect(rules(base({ incidentAlarmedAt: T('13:00') }))).toEqual(['warning:incident-time-differs']);
    expect(rules(base({ incidentAlarmedAt: T('13:05') }))).toEqual([]);
    expect(rules(base({ primary: false, statistics: null, incidentAlarmedAt: T('13:00') }))).toEqual([]);
    expect(rules(base({ primary: false, statistics: null, incidentAlarmedAt: T('13:10') }))).toEqual(['warning:incident-time-differs']);
  });

  it('checks the times of each person against the report and the configured long duration', () => {
    expect(rules(base({ personnel: [person('jonas', { from: T('12:00'), to: T('14:00') })] }))).toEqual(['warning:personnel-times-outside:jonas']);
    expect(rules(base({ personnel: [person('jonas', { from: T('13:30'), to: T('16:00') })] }))).toEqual(['warning:personnel-times-outside:jonas']);
    expect(rules(base({ personnel: [person('jonas', { from: T('13:30'), to: T('15:00') })] }))).toEqual([]);
    const day = { times: { alarmedAt: '2026-10-20T08:00:00+02:00', returnedAt: T('15:50') } };
    expect(rules(base({ ...day, personnel: [person('jonas', { from: '2026-10-20T08:00:00+02:00', to: T('15:50') })] }))).toEqual([
      'warning:duration-long',
      'warning:personnel-duration-long:jonas',
    ]);
    // A long assignment of the person itself is still compared with other incidents.
    expect(
      rules(base({ ...day, personnel: [person('jonas', { from: '2026-10-20T08:00:00+02:00', to: T('15:50') })], otherIncidents: [{ dispatchNumber: '2026-9', personId: 'jonas', from: T('09:00'), to: T('10:00') }] })),
    ).toEqual(['warning:duration-long', 'warning:personnel-duration-long:jonas', 'warning:personnel-overlap-other:jonas']);
  });

  it('checks the own times of vehicles against the report and the times of their crew against the vehicle', () => {
    const later = { vehicleTimes: [{ vehicleId: 'lf', alarmedAt: T('14:00'), departedAt: T('14:05'), returnedAt: null }] };
    // The crew follows the alarm of the vehicle (the effective times come from the service).
    expect(rules(base({ ...later, personnel: [person('jonas', { from: T('14:00') })] }))).toEqual([]);
    // Own times of a person outside the vehicle's times: warning naming the vehicle.
    const early = evaluateRules(base({ ...later, personnel: [person('jonas', { from: T('13:30') })] }), settings);
    expect(early.map((f) => `${f.level}:${f.rule}:${f.subject}`)).toEqual(['warning:personnel-times-outside:jonas']);
    expect(early[0].params).toEqual({ person: 'jonas', vehicle: 'LF 20' });
    // Persons on standby are compared with the report, not with a vehicle.
    expect(rules(base({ ...later, personnel: [person('jonas', { vehicleId: null, standbyStationId: 'station', from: T('13:30') })] }))).toEqual([]);
    // A departure alone does not change the crew's times.
    expect(rules(base({ vehicleTimes: [{ vehicleId: 'lf', alarmedAt: null, departedAt: T('13:10'), returnedAt: null }] }))).toEqual([]);
    // Vehicle alarm or return outside the report (warning).
    expect(rules(base({ vehicleTimes: [{ vehicleId: 'lf', alarmedAt: T('13:00'), returnedAt: null }], personnel: [person('jonas', { from: T('13:00') })] }))).toEqual([
      'warning:vehicle-times-outside:lf',
    ]);
    expect(rules(base({ vehicleTimes: [{ vehicleId: 'lf', alarmedAt: null, returnedAt: T('16:30') }], personnel: [] }))).toEqual([
      'error:no-personnel',
      'warning:vehicle-times-outside:lf',
    ]);
    // Alarm, departure and return in the wrong order (error).
    const invalid = evaluateRules(base({ vehicleTimes: [{ vehicleId: 'lf', alarmedAt: T('15:00'), returnedAt: T('14:00') }], personnel: [] }), settings);
    expect(invalid.map((f) => `${f.level}:${f.rule}`)).toEqual(['error:no-personnel', 'error:vehicle-times-invalid']);
    expect(invalid[1].params).toEqual({ vehicle: 'LF 20' });
    expect(rules(base({ vehicleTimes: [{ vehicleId: 'lf', alarmedAt: T('14:00'), departedAt: T('13:50'), returnedAt: null }], personnel: [] }))).toEqual(['error:no-personnel', 'error:vehicle-times-invalid:lf']);
    expect(rules(base({ vehicleTimes: [{ vehicleId: 'lf', alarmedAt: null, departedAt: T('15:55'), returnedAt: T('15:00') }], personnel: [] }))).toEqual(['error:no-personnel', 'error:vehicle-times-invalid:lf']);
    // Vehicles without own times are not checked.
    expect(rules(base({ vehicleTimes: [{ vehicleId: 'lf', alarmedAt: null, departedAt: null, returnedAt: null }] }))).toEqual([]);
  });

  it('checks status, membership and age of persons on the incident date', () => {
    const own = { departmentId: 'musterstadt', minimumAge: 18 };
    expect(rules(base({ ...own, persons: facts() }))).toEqual([]);
    for (const status of ['youth', 'veterans', 'passive', 'left']) {
      expect(rules(base({ ...own, persons: facts({ status }) }))).toEqual(['warning:person-not-operational:jonas']);
    }
    expect(rules(base({ ...own, persons: facts({ departmentIds: ['ahornfeld'] }) }))).toEqual(['warning:person-not-member:jonas']);
    // 18th birthday on the day after the incident.
    expect(rules(base({ ...own, persons: facts({ birthDate: '2008-10-22' }) }))).toEqual(['warning:person-too-young:jonas']);
    expect(rules(base({ ...own, persons: facts({ birthDate: '2008-10-21' }) }))).toEqual([]);
    // Guests are not checked.
    expect(rules(base({ ...own, persons: facts(), personnel: [person('guest:Gast', { personId: null })] }))).toEqual([]);
  });

  it('takes the persons of a brigade-wide unit (e.g. the duty officer) from every department, with a vehicle only if the unit needs one', () => {
    const unit = { primary: false, statistics: null, departmentId: undefined, persons: facts({ departmentIds: ['ahornfeld'] }) };
    expect(rules(base({ ...unit, unit: { vehicleRequired: false }, personnel: [person('jonas', { vehicleId: null })] }))).toEqual([]);
    expect(rules(base({ ...unit, unit: { vehicleRequired: true }, personnel: [person('jonas', { vehicleId: null })] }))).toEqual(['error:vehicle-missing:jonas']);
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
