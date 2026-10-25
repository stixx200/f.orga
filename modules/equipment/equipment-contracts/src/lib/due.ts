import type { Due, InspectionType } from './equipment.js';

/** `date` plus months (ISO dates), clamped to the end of shorter months. */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

/**
 * Due dates of the inspection types of an item:
 * - periodic: last inspection + interval (or the date set on the inspection); never inspected = due today
 * - after use, incident or washing: due when triggered after the last inspection, otherwise not due
 */
export function computeDues(
  inspections: InspectionType[],
  last: ReadonlyMap<string, { date: string; nextDueOn: string | null }>,
  triggered: Readonly<Record<string, string>>,
  today: string,
): Due[] {
  return inspections.map((type) => {
    const previous = last.get(type.key);
    const trigger = triggered[type.key];
    let dueOn: string | null;
    if (trigger && (!previous || trigger >= previous.date)) dueOn = trigger;
    else if (previous?.nextDueOn) dueOn = previous.nextDueOn;
    else if (type.intervalMonths) dueOn = previous ? addMonths(previous.date, type.intervalMonths) : today;
    else dueOn = null;
    return { key: type.key, name: type.name, lastDate: previous?.date ?? null, dueOn, overdue: dueOn !== null && dueOn <= today };
  });
}
