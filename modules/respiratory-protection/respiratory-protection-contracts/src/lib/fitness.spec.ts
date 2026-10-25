import { FitnessRule } from './evidence.js';
import { addMonths, ageOn, evaluateFitness, examinationMonths, type FitnessEvidence, minimumKilojoules } from './fitness.js';

const rule = FitnessRule.parse({});
const wearer = { birthDate: '1990-05-01', qualifications: ['breathing-apparatus'] };
const today = '2026-10-23';
const e = (kind: FitnessEvidence['kind'], date: string, extra: Partial<FitnessEvidence> = {}): FitnessEvidence => ({ kind, date, validUntil: null, kilojoules: null, passed: null, ...extra });
const complete = [e('examination', '2025-02-01'), e('briefing', '2026-03-01'), e('stress-exercise', '2026-04-10', { kilojoules: 85, passed: true }), e('exercise', '2026-05-05')];

describe('evaluateFitness', () => {
  it('is grey without the qualification', () => {
    expect(evaluateFitness({ birthDate: null, qualifications: [] }, complete, rule, today).color).toBe('grey');
  });

  it('is green with all evidence and nothing due soon', () => {
    const result = evaluateFitness(wearer, complete, rule, today);
    expect(result.color).toBe('green');
    expect(result.nextDue).toBe('2027-03-01');
    expect(result.conditions.map((c) => c.key)).toEqual(['examination', 'briefing', 'stress-exercise', 'exercise']);
  });

  it('is yellow when evidence expires within the lead days', () => {
    expect(evaluateFitness(wearer, complete, rule, '2027-01-15').color).toBe('yellow');
  });

  it('is red when a condition is missing or expired', () => {
    const result = evaluateFitness(wearer, complete.filter((x) => x.kind !== 'briefing'), rule, today);
    expect(result.color).toBe('red');
    expect(result.conditions.find((c) => c.key === 'briefing')).toMatchObject({ met: false, lastDate: null });
    expect(evaluateFitness(wearer, complete, rule, '2027-06-01').color).toBe('red');
  });

  it('needs 80 kJ, from 50 years 60 kJ', () => {
    const weak = [...complete.filter((x) => x.kind !== 'stress-exercise'), e('stress-exercise', '2026-04-10', { kilojoules: 65, passed: true })];
    expect(evaluateFitness(wearer, weak, rule, today).color).toBe('red');
    const examined = [...weak.filter((x) => x.kind !== 'examination'), e('examination', '2026-02-01')];
    expect(evaluateFitness({ ...wearer, birthDate: '1970-01-01' }, examined, rule, today).color).toBe('green');
  });

  it('uses the ages and intervals of the rule', () => {
    // 52-year-old: by default over 50 (12 months, 60 kJ); with the limit at 55 the regular 36 months and 80 kJ apply.
    const older = { ...wearer, birthDate: '1974-01-01' };
    const evidence = [e('examination', '2025-02-01'), e('briefing', '2026-03-01'), e('stress-exercise', '2026-04-10', { kilojoules: 70, passed: true }), e('exercise', '2026-05-05')];
    expect(evaluateFitness(older, evidence, rule, today).conditions.find((c) => c.key === 'examination')).toMatchObject({ met: false, dueOn: '2026-02-01' });
    const later = FitnessRule.parse({ olderFromAge: 55 });
    const result = evaluateFitness(older, evidence, later, today);
    expect(result.conditions.find((c) => c.key === 'examination')).toMatchObject({ met: true, dueOn: '2028-02-01' });
    expect(result.conditions.find((c) => c.key === 'stress-exercise')?.met).toBe(false);
    expect(evaluateFitness({ ...wearer, birthDate: '2009-01-01' }, evidence, FitnessRule.parse({ minimumAge: 16 }), today).conditions.some((c) => c.key === 'minimum-age')).toBe(false);
  });

  it('counts a run of the breathing apparatus track as stress exercise', () => {
    const track = [...complete.filter((x) => x.kind !== 'stress-exercise'), e('training-track', '2026-04-10', { kilojoules: 90, passed: true })];
    expect(evaluateFitness(wearer, track, rule, today).color).toBe('green');
    // Without fixed work in the rule, the run counts when it was passed.
    const unset = [...complete.filter((x) => x.kind !== 'stress-exercise'), e('training-track', '2026-04-10', { passed: true })];
    expect(evaluateFitness(wearer, unset, rule, today).conditions.find((c) => c.key === 'stress-exercise')?.met).toBe(true);
    const failed = [...complete.filter((x) => x.kind !== 'stress-exercise'), e('training-track', '2026-04-10', { kilojoules: 90, passed: false })];
    expect(evaluateFitness(wearer, failed, rule, today).color).toBe('red');
  });

  it('lets a real incident replace the exercise unless switched off', () => {
    const withIncident = [...complete.filter((x) => x.kind !== 'exercise'), e('incident', '2026-08-01')];
    expect(evaluateFitness(wearer, withIncident, rule, today).color).toBe('green');
    expect(evaluateFitness(wearer, withIncident, { ...rule, incidentReplacesExercise: false }, today).color).toBe('red');
  });

  it('uses "valid until" of the certificate, else the interval by age', () => {
    const certified = [...complete.filter((x) => x.kind !== 'examination'), e('examination', '2025-02-01', { validUntil: '2026-06-30' })];
    expect(evaluateFitness(wearer, certified, rule, today).conditions[0]).toMatchObject({ met: false, dueOn: '2026-06-30' });
    const older = evaluateFitness({ ...wearer, birthDate: '1960-01-01' }, complete, rule, today);
    expect(older.conditions[0]).toMatchObject({ met: false, dueOn: '2026-02-01' });
    expect(evaluateFitness(wearer, complete, { ...rule, examinationInterval: 1 }, today).conditions[0].dueOn).toBe('2026-02-01');
  });

  it('ignores withdrawn evidence and supports the calendar-year window', () => {
    const withdrawn = complete.map((x) => (x.kind === 'exercise' ? { ...x, withdrawn: true } : x));
    expect(evaluateFitness(wearer, withdrawn, rule, today).color).toBe('red');
    expect(evaluateFitness(wearer, complete, { ...rule, window: 'calendar-year' }, today).conditions[1].dueOn).toBe('2027-12-31');
  });

  it('gives over 50-year-olds 24 months for devices up to 5 kg, else 12', () => {
    const older = { birthDate: '1960-01-01', qualifications: ['breathing-apparatus'] };
    const heavy = evaluateFitness(older, [e('examination', '2025-02-01')], rule, today).conditions.find((c) => c.key === 'examination');
    const light = evaluateFitness(older, [e('examination', '2025-02-01', { examinationGroup: 'up-to-5kg' })], rule, today).conditions.find((c) => c.key === 'examination');
    expect(heavy?.dueOn).toBe('2026-02-01');
    expect(light?.dueOn).toBe('2027-02-01');
  });

  it('is red under 18 until the 18th birthday', () => {
    const young = { birthDate: '2008-12-01', qualifications: ['breathing-apparatus'] };
    const result = evaluateFitness(young, complete, rule, today);
    expect(result.color).toBe('red');
    expect(result.conditions[0]).toEqual({ key: 'minimum-age', met: false, lastDate: null, dueOn: '2026-12-01' });
    expect(result.nextDue).toBe('2027-03-01');
    expect(evaluateFitness(young, complete, rule, '2026-12-01').conditions.some((c) => c.key === 'minimum-age')).toBe(false);
  });

  it('requires a chemical suit exercise only for chemical suit wearers', () => {
    const csa = { ...wearer, qualifications: ['breathing-apparatus', 'chemical-suit'] };
    expect(evaluateFitness(csa, complete, rule, today).color).toBe('red');
    expect(evaluateFitness(csa, [...complete, e('chemical-suit', '2026-09-01')], rule, today).color).toBe('green');
  });
});

describe('age at the date of the evidence', () => {
  it('uses the age at the examination and at the stress exercise, not today', () => {
    // Born 1976-06-01: 49 at the examination (2026-03-01), 50 today.
    const person = { birthDate: '1976-06-01', qualifications: ['breathing-apparatus'] };
    const evidence = [e('examination', '2026-03-01'), e('briefing', '2026-09-01'), e('stress-exercise', '2026-04-10', { kilojoules: 65, passed: true }), e('exercise', '2026-05-05')];
    const result = evaluateFitness(person, evidence, rule, today);
    expect(result.conditions.find((c) => c.key === 'examination')?.dueOn).toBe('2029-03-01');
    // 65 kJ at 49 were not enough.
    expect(result.conditions.find((c) => c.key === 'stress-exercise')?.met).toBe(false);
  });
});

describe('age boundary and examination result', () => {
  it('counts the configured age itself as older, for the interval and for the kJ minimum alike', () => {
    // Born 1976-03-01: exactly 50 at the examination and at the stress exercise.
    const person = { birthDate: '1976-03-01', qualifications: ['breathing-apparatus'] };
    expect(examinationMonths(rule, person.birthDate, '2026-03-01', null)).toBe(12);
    expect(examinationMonths(rule, person.birthDate, '2026-02-28', null)).toBe(36);
    expect(minimumKilojoules(rule, person.birthDate, '2026-03-01')).toBe(60);
    expect(minimumKilojoules(rule, person.birthDate, '2026-02-28')).toBe(80);
    const result = evaluateFitness(person, [e('examination', '2026-03-01'), e('stress-exercise', '2026-03-01', { kilojoules: 60, passed: true })], rule, today);
    expect(result.conditions.find((c) => c.key === 'examination')?.dueOn).toBe('2027-03-01');
    expect(result.conditions.find((c) => c.key === 'stress-exercise')?.met).toBe(true);
  });

  it('is red with the result "concerns", whatever the interval', () => {
    const concerns = [...complete.filter((x) => x.kind !== 'examination'), e('examination', '2026-02-01', { result: 'concerns' })];
    const result = evaluateFitness(wearer, concerns, rule, today);
    expect(result.color).toBe('red');
    expect(result.conditions.find((c) => c.key === 'examination')).toMatchObject({ met: false, concerns: true, lastDate: '2026-02-01' });
    // A later examination without concerns counts again.
    expect(evaluateFitness(wearer, [...concerns, e('examination', '2026-06-01', { result: 'no-concerns' })], rule, today).color).toBe('green');
  });
});

describe('date helpers', () => {
  it('adds months and computes ages', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(ageOn('1976-10-24', '2026-10-23')).toBe(49);
    expect(ageOn('1976-10-23', '2026-10-23')).toBe(50);
  });
});
