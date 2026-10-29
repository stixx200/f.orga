/**
 * Compares two JSON values regardless of the order of object keys, e.g. a form with the stored settings: PostgreSQL
 * (`jsonb`) returns the keys of a saved object in an order of its own.
 */
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, i) => sameJson(value, b[i]));
  const left = Object.entries(a).filter(([, value]) => value !== undefined);
  const right = Object.entries(b).filter(([, value]) => value !== undefined);
  return left.length === right.length && left.every(([key, value]) => sameJson(value, (b as Record<string, unknown>)[key]));
}
