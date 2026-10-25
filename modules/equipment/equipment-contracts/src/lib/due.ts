import type { Due, InspectionResult, InspectionType } from './equipment.js';

/** `date` plus months (ISO dates), clamped to the end of shorter months. */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

/** Last valid (not cancelled) inspection of an inspection type. */
export interface LastInspection {
  date: string;
  nextDueOn: string | null;
  result?: InspectionResult;
}

/** Dates an item never inspected is measured from. */
export interface ItemDates {
  purchasedOn: string | null;
  /** Day the item was recorded in f.orga. */
  createdOn: string;
}

/**
 * Due dates of the inspection types of an item:
 * - periodic: last inspection + interval (or the date set on the inspection); a failed inspection stays due from its date;
 *   never inspected: purchase date + interval, without purchase date due from the day the item was recorded
 * - after use, incident or washing: due when triggered after the last inspection, otherwise not due
 */
export function computeDues(
  inspections: InspectionType[],
  last: ReadonlyMap<string, LastInspection>,
  triggered: Readonly<Record<string, string>>,
  today: string,
  item: ItemDates = { purchasedOn: null, createdOn: today },
): Due[] {
  return inspections.map((type) => {
    const previous = last.get(type.key);
    const trigger = triggered[type.key];
    let dueOn: string | null;
    if (trigger && (!previous || trigger >= previous.date)) dueOn = trigger;
    else if (previous?.result === 'failed') dueOn = previous.date;
    else if (previous?.nextDueOn) dueOn = previous.nextDueOn;
    else if (type.intervalMonths) dueOn = previous ? addMonths(previous.date, type.intervalMonths) : item.purchasedOn ? addMonths(item.purchasedOn, type.intervalMonths) : item.createdOn;
    else dueOn = null;
    return { key: type.key, name: type.name, lastDate: previous?.date ?? null, dueOn, overdue: dueOn !== null && dueOn <= today };
  });
}

/** Inspection types with the interval overrides of an item. */
export function withIntervals(inspections: InspectionType[], overrides: Readonly<Record<string, number>>): InspectionType[] {
  return inspections.map((type) => (overrides[type.key] ? { ...type, intervalMonths: overrides[type.key] } : type));
}

/** An item of a category that locks on overdue inspections is blocked once a due date has passed. */
export function isBlocked(dues: Due[], lockWhenOverdue: boolean, today: string): boolean {
  return lockWhenOverdue && dues.some((d) => d.dueOn !== null && d.dueOn < today);
}
