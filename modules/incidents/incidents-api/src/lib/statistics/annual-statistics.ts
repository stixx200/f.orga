import type { StatisticsCheck, StatisticsColumn, StatisticsSource } from '@forga/incidents-contracts';
import type { IncidentStatistics } from '@forga/incidents-contracts';
import type { Department, PersonSnapshot, Vehicle } from '@forga/masterdata-contracts';

export interface ComputedValue {
  question: string;
  column: StatisticsColumn;
  source: StatisticsSource;
  value: number;
}

/** Input for the computation: everything as of the reference date or within the year. */
export interface StatisticsInput {
  referenceDate: string;
  departments: Department[];
  stationCount: number;
  permanentlyStaffedStations: number;
  members: PersonSnapshot[];
  vehicles: Vehicle[];
  /** Statistics of the incidents of the year (each incident once). */
  incidents: IncidentStatistics[];
  /** Own personnel injured or killed in any report of the year, with the type of the report's department. */
  ownCasualties: { departmentType: string; injured: boolean; killed: boolean }[];
  /** Own forces injured in training sessions (training module), with the type of the session's first department. */
  trainingCasualties?: { departmentType: string }[];
}

/** Department type → column of the template. */
const COLUMN_OF: Record<string, StatisticsColumn | undefined> = {
  operational: 'D',
  'special-service': 'D',
  command: 'D',
  youth: 'F',
  children: 'F',
  veterans: 'G',
  music: 'H',
};

const SPECIAL_TASK_QUESTIONS: Record<string, string> = {
  'ambulance-service': 'F3',
  'emergency-doctor-vehicle': 'F4',
  'radiation-protection': 'F5',
  'hazardous-materials': 'F6',
  'height-rescue': 'F7',
  diving: 'F8',
  'command-unit': 'F9',
};

const TECHNICAL_QUESTIONS: Record<string, string> = {
  'rescue-persons': 'F38',
  'hazardous-materials': 'F39',
  'oil-trace': 'F40',
  'animal-rescue': 'F41',
  insects: 'F42',
  'flood-weather': 'F43',
  storm: 'F44',
  other: 'F45',
};

const FIRE_SIZE_QUESTIONS: Record<string, string> = { 'small-a': 'F29', 'small-b': 'F30', medium: 'F31', large: 'F32' };
const FALSE_ALARM_QUESTIONS: Record<string, string> = { 'good-faith': 'F52', malicious: 'F53', 'fire-alarm-system': 'F54' };

/** Computes the values of the state template F1–F120 (F121–F129, radio equipment, are entered manually). */
export function computeAnnualStatistics(input: StatisticsInput): ComputedValue[] {
  const values = new Map<string, ComputedValue>();
  const add = (question: string, column: StatisticsColumn, source: StatisticsSource, amount = 1) => {
    const key = `${question}:${column}`;
    const current = values.get(key) ?? { question, column, source, value: 0 };
    current.value += amount;
    values.set(key, current);
  };

  // Page 1: organisation.
  const typeOf = new Map(input.departments.map((d) => [d.id, d.type]));
  for (const department of input.departments) {
    const column = COLUMN_OF[department.type];
    if (!column || !department.statisticsRelevant) continue;
    if (department.type === 'operational') add('F2', 'D', 'masterdata');
    if (['youth', 'veterans', 'music'].includes(department.type)) add('F2', column, 'masterdata');
    for (const task of department.specialTasks) add(SPECIAL_TASK_QUESTIONS[task], 'D', 'masterdata');
  }
  add('F10', 'D', 'masterdata', input.stationCount);
  add('F11', 'D', 'masterdata', input.permanentlyStaffedStations);

  // Page 2: members as of the reference date; operational members once even with several memberships.
  for (const person of input.members) {
    const types = person.departmentIds.map((id) => typeOf.get(id)).filter(Boolean) as string[];
    const operational = types.some((t) => ['operational', 'special-service', 'command'].includes(t)) && ['active', 'probation'].includes(person.status);
    if (operational) {
      add('F13', 'D', 'masterdata');
      const career = { 'career-higher': 'F15', 'career-elevated': 'F16', 'career-intermediate': 'F17', 'fire-service-employee': 'F18' } as Record<string, string>;
      if (career[person.employment]) {
        add('F14', 'D', 'masterdata');
        add(career[person.employment], 'D', 'masterdata');
      }
      if (person.gender === 'female') add('F19', 'D', 'masterdata');
      if (person.qualifications.includes('breathing-apparatus')) add('F20', 'D', 'masterdata');
      if (person.driverLicenseClasses.some((c) => ['C', 'CE'].includes(c.toUpperCase()))) add('F21', 'D', 'masterdata');
      if (person.qualifications.includes('group-leader')) add('F22', 'D', 'masterdata');
      if (person.qualifications.includes('platoon-leader')) add('F23', 'D', 'masterdata');
      if (person.musician) add('F24', 'D', 'masterdata');
    }
    if (person.employment === 'administration-employee') add('F25', 'D', 'masterdata');
    for (const column of new Set(types.map((t) => COLUMN_OF[t]).filter((c) => c && c !== 'D') as StatisticsColumn[])) {
      add('F12', column, 'masterdata');
      if (person.gender === 'female') add('F19', column, 'masterdata');
    }
  }

  // Page 3: own personnel injured or killed on duty.
  for (const casualty of input.ownCasualties) {
    const column = COLUMN_OF[casualty.departmentType] ?? 'D';
    if (casualty.injured) add('F26', column, 'incidents');
    if (casualty.killed) add('F27', column, 'incidents');
  }
  for (const casualty of input.trainingCasualties ?? []) add('F26', COLUMN_OF[casualty.departmentType] ?? 'D', 'training');

  // Pages 4–7: incidents, each once with its statistics. Pages 5–7 count the own municipality only.
  for (const s of input.incidents) {
    const own = s.ownMunicipality;
    if (s.mainType === 'fire') {
      if (own) {
        add('F28', 'D', 'incidents');
        if (s.fireSize) add(FIRE_SIZE_QUESTIONS[s.fireSize], 'D', 'incidents');
      } else add('F33', 'D', 'incidents');
    }
    if (s.mainType === 'technical-assistance' && !own) add('F34', 'D', 'incidents');
    if (!own) continue;
    if (s.disasterPreAlarm) add('F35', 'D', 'incidents');
    if (s.disasterOperation) add('F36', 'D', 'incidents');
    if (s.mainType === 'technical-assistance') {
      add('F37', 'D', 'incidents');
      if (s.technicalCategory) add(TECHNICAL_QUESTIONS[s.technicalCategory], 'D', 'incidents');
    }
    if (s.mainType === 'other') add('F50', 'D', 'incidents');
    if (s.mainType === 'false-alarm') {
      add('F51', 'D', 'incidents');
      if (s.falseAlarmType) add(FALSE_ALARM_QUESTIONS[s.falseAlarmType], 'D', 'incidents');
    }
    if (s.mainType === 'fire') {
      add('F55', 'D', 'incidents', s.rescued);
      if (s.vehicleFire) add('F56', 'D', 'incidents', s.rescued);
      add('F57', 'D', 'incidents', s.rescuedSmokeInhalation);
      add('F59', 'D', 'incidents', s.dead);
      if (s.vehicleFire) add('F60', 'D', 'incidents', s.dead);
    }
    if (s.mainType === 'technical-assistance') {
      add('F58', 'D', 'incidents', s.rescued);
      add('F61', 'D', 'incidents', s.dead);
      if (s.trafficAccident) add('F62', 'D', 'incidents', s.dead);
    }
  }

  // Pages 8–13: vehicles in service on the reference date, by their statistics category.
  for (const vehicle of input.vehicles) {
    const commissioned = !vehicle.commissionedOn || vehicle.commissionedOn <= input.referenceDate;
    const decommissioned = vehicle.decommissionedOn && vehicle.decommissionedOn <= input.referenceDate;
    if (commissioned && !decommissioned && vehicle.status !== 'retired') add(vehicle.statisticsCategory, 'D', 'masterdata');
  }

  return [...values.values()].filter((v) => v.value > 0);
}

/** Sum and subset checks of the template; a failed check does not block the export. */
export function checkAnnualStatistics(value: (key: string) => number): StatisticsCheck[] {
  const sum = (...keys: string[]) => keys.reduce((s, k) => s + value(`${k}:D`), 0);
  const equal = (code: string, total: string, parts: string[]) => ({
    code,
    ok: value(`${total}:D`) === sum(...parts),
    params: { total: value(`${total}:D`), parts: sum(...parts) },
  });
  const atMost = (code: string, part: string, total: string) => ({
    code,
    ok: value(`${part}:D`) <= value(`${total}:D`),
    params: { part: value(`${part}:D`), total: value(`${total}:D`) },
  });
  return [
    equal('statistics.fireSizes', 'F28', ['F29', 'F30', 'F31', 'F32']),
    equal('statistics.technicalCategories', 'F37', ['F38', 'F39', 'F40', 'F41', 'F42', 'F43', 'F44', 'F45']),
    equal('statistics.falseAlarms', 'F51', ['F52', 'F53', 'F54']),
    equal('statistics.careerStaff', 'F14', ['F15', 'F16', 'F17', 'F18']),
    atMost('statistics.careerOfMembers', 'F14', 'F13'),
    atMost('statistics.rescuedVehicleFires', 'F56', 'F55'),
    atMost('statistics.rescuedSmoke', 'F57', 'F55'),
    atMost('statistics.deadVehicleFires', 'F60', 'F59'),
    atMost('statistics.deadTrafficAccidents', 'F62', 'F61'),
  ];
}
