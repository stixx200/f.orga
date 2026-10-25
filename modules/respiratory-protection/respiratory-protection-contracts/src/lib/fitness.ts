import type { Condition, EvidenceKind, ExaminationGroup, ExaminationResult, FitnessColor, FitnessRule } from './evidence.js';

export const QUALIFICATION_BREATHING_APPARATUS = 'breathing-apparatus';
export const QUALIFICATION_CHEMICAL_SUIT = 'chemical-suit';

export interface FitnessPerson {
  birthDate: string | null;
  qualifications: string[];
}

export interface FitnessEvidence {
  kind: EvidenceKind;
  date: string;
  validUntil: string | null;
  kilojoules: number | null;
  passed: boolean | null;
  withdrawn?: boolean;
  examinationGroup?: ExaminationGroup | null;
  result?: ExaminationResult | null;
}

/** `date` plus months (ISO dates), clamped to the end of shorter months. */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function ageOn(birthDate: string | null, date: string): number | null {
  if (!birthDate) return null;
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [y, m, d] = date.split('-').map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

/** Older group: from the age `olderFromAge` on (inclusive), at the date of the evidence. */
export function isOlder(rule: Pick<FitnessRule, 'olderFromAge'>, birthDate: string | null, date: string): boolean {
  const age = ageOn(birthDate, date);
  return age !== null && age >= rule.olderFromAge;
}

/** Interval in months of an examination without "valid until": by age at the examination and device group, or fixed. */
export function examinationMonths(rule: FitnessRule, birthDate: string | null, date: string, group: ExaminationGroup | null | undefined): number {
  if (rule.examinationInterval !== 'by-age') return rule.examinationInterval * 12;
  if (!isOlder(rule, birthDate, date)) return rule.examinationMonths;
  return group === 'up-to-5kg' ? rule.examinationMonthsOlderLight : rule.examinationMonthsOlder;
}

/** Minimum work in kJ of a stress exercise at the age on `date`. */
export function minimumKilojoules(rule: FitnessRule, birthDate: string | null, date: string): number {
  return isOlder(rule, birthDate, date) ? rule.minKilojoulesFrom50 : rule.minKilojoules;
}

/**
 * Evaluates the fitness of a breathing apparatus wearer on `today` (FwDV 7 Nr. 6, Anlage 4):
 * qualification, valid examination, briefing, passed stress exercise and an exercise or a real incident under BA,
 * for chemical suit wearers also a chemical suit exercise, and a minimum age of 18. Red = a condition is not met,
 * yellow = something expires within the lead days, grey = no qualification.
 */
export function evaluateFitness(person: FitnessPerson, evidence: FitnessEvidence[], rule: FitnessRule, today: string): { color: FitnessColor; conditions: Condition[]; nextDue: string | null } {
  if (!person.qualifications.includes(QUALIFICATION_BREATHING_APPARATUS)) {
    return { color: 'grey', conditions: [{ key: 'qualification', met: false, lastDate: null, dueOn: null }], nextDue: null };
  }
  // Age at the date of the evidence: an examination at 49 keeps its 36 months, a stress exercise at 49 needs 80 kJ.
  const ageAt = (date: string) => ageOn(person.birthDate, date);
  const valid = evidence.filter((e) => !e.withdrawn && e.date <= today).toSorted((a, b) => b.date.localeCompare(a.date));
  const yearly = (date: string) => (rule.window === 'calendar-year' ? `${Number(date.slice(0, 4)) + 1}-12-31` : addMonths(date, 12));
  const latest = (kinds: EvidenceKind[], accept: (e: FitnessEvidence) => boolean = () => true) => valid.find((e) => kinds.includes(e.kind) && accept(e)) ?? null;
  const condition = (key: Condition['key'], found: FitnessEvidence | null, dueOn: (e: FitnessEvidence) => string): Condition => {
    const due = found ? dueOn(found) : null;
    return { key, met: due !== null && due >= today, lastDate: found?.date ?? null, dueOn: due };
  };

  const conditions: Condition[] = [];
  const ageToday = ageAt(today);
  if (ageToday !== null && ageToday < rule.minimumAge) {
    // `dueOn` is the 18th birthday: from then on the condition is met.
    conditions.push({ key: 'minimum-age', met: false, lastDate: null, dueOn: addMonths(person.birthDate!, rule.minimumAge * 12) });
  }
  if (rule.examination) {
    // By age (DGUV G 26, values in the rule): 36 months, from 50 years on 12 months, for devices up to 5 kg (G 26.2) 24 months.
    // The latest examination counts; with "concerns" the wearer is not fit from its date on.
    const found = latest(['examination']);
    if (found?.result === 'concerns') conditions.push({ key: 'examination', met: false, lastDate: found.date, dueOn: found.date, concerns: true });
    else conditions.push(condition('examination', found, (e) => e.validUntil ?? addMonths(e.date, examinationMonths(rule, person.birthDate, e.date, e.examinationGroup))));
  }
  if (rule.briefing) conditions.push(condition('briefing', latest(['briefing']), (e) => yearly(e.date)));
  if (rule.stressExercise) {
    const passed = (e: FitnessEvidence) => e.passed !== false && (e.kilojoules === null ? e.passed === true : e.kilojoules >= minimumKilojoules(rule, person.birthDate, e.date));
    conditions.push(condition('stress-exercise', latest(['stress-exercise', 'training-track'], passed), (e) => yearly(e.date)));
  }
  if (rule.exercise) conditions.push(condition('exercise', latest(rule.incidentReplacesExercise ? ['exercise', 'incident'] : ['exercise']), (e) => yearly(e.date)));
  if (rule.chemicalSuit && person.qualifications.includes(QUALIFICATION_CHEMICAL_SUIT)) {
    conditions.push(condition('chemical-suit', latest(['chemical-suit']), (e) => yearly(e.date)));
  }

  const dues = conditions.filter((c) => c.key !== 'minimum-age').map((c) => c.dueOn).filter((d): d is string => d !== null).toSorted();
  const nextDue = dues[0] ?? null;
  const color: FitnessColor = conditions.some((c) => !c.met) ? 'red' : nextDue !== null && nextDue <= addDays(today, rule.leadDays) ? 'yellow' : 'green';
  return { color, conditions, nextDue };
}
