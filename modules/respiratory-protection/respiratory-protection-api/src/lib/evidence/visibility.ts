import type { PersonSnapshot } from '@forga/masterdata-contracts';
import { type FitnessStatus, QUALIFICATION_BREATHING_APPARATUS, WEARER_STATUSES } from '@forga/respiratory-protection-contracts';

/**
 * Without the examinations permission: an examination with concerns only shows as not met, like a missing one (no date),
 * and the next due date leaves it out.
 */
export function redact(status: FitnessStatus): FitnessStatus {
  const conditions = status.conditions.map((c) => (c.concerns ? { key: c.key, met: false, lastDate: null, dueOn: null } : c));
  const dues = conditions.filter((c) => c.key !== 'minimum-age').map((c) => c.dueOn).filter((d): d is string => d !== null).toSorted();
  return { ...status, conditions, nextDue: dues[0] ?? null };
}

/** Whether the person counts as breathing apparatus wearer: qualification and a status of `WEARER_STATUSES` (not veterans, passive, youth). */
export const isWearer = (p: Pick<PersonSnapshot, 'status' | 'qualifications'>): boolean =>
  WEARER_STATUSES.includes(p.status) && p.qualifications.includes(QUALIFICATION_BREATHING_APPARATUS);
