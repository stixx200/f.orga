const locale = (language: string) => (language === 'de' ? 'de-DE' : 'en-GB');
const ZONE = 'Europe/Berlin';

/** `21.10.2026` / `21/10/2026` from an ISO date or date-time. */
export function formatDate(value: string | null | undefined, language: string): string {
  if (!value) return '–';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
  return date.toLocaleDateString(locale(language), { timeZone: ZONE, day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** `21.10.2026, 13:05` in Europe/Berlin. */
export function formatDateTime(value: string | null | undefined, language: string): string {
  if (!value) return '–';
  return new Date(value).toLocaleString(locale(language), { timeZone: ZONE, dateStyle: 'medium', timeStyle: 'short' });
}

/** `13:05` in Europe/Berlin. */
export function formatTime(value: string | null | undefined, language: string): string {
  if (!value) return '–';
  return new Date(value).toLocaleTimeString(locale(language), { timeZone: ZONE, hour: '2-digit', minute: '2-digit' });
}

export function formatMoney(value: number, language: string): string {
  return value.toLocaleString(locale(language), { style: 'currency', currency: 'EUR' });
}

/** Local date-time for `<input type="datetime-local">` (Europe/Berlin) from an ISO timestamp. */
export function toLocalInput(value: string | null | undefined): string {
  if (!value) return '';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(value))
      .map((p) => [p.type, p.value]),
  );
  return `${parts['year']}-${parts['month']}-${parts['day']}T${parts['hour']}:${parts['minute']}`;
}

/** Offset of Europe/Berlin from UTC in milliseconds at the instant `time`. */
function offsetAt(time: number): number {
  return Date.parse(`${toLocalInput(new Date(time).toISOString())}:00Z`) - time;
}

const HALF_DAY_MS = 12 * 60 * 60_000;

/**
 * ISO timestamp from a local date-time input interpreted in Europe/Berlin. The offset is the one valid at the intended
 * local time, also in the nights of the clock changes: a time that occurs twice (end of summer time) is the earlier
 * one, a time that does not exist (start of summer time) moves forward by the gap.
 */
export function fromLocalInput(local: string): string {
  const wall = Date.parse(`${local}:00Z`);
  // The offsets before and after a possible change; at most one change lies within a day.
  const offsets = [...new Set([offsetAt(wall - HALF_DAY_MS), offsetAt(wall + HALF_DAY_MS)])];
  const matching = offsets.map((offset) => wall - offset).filter((time) => toLocalInput(new Date(time).toISOString()) === local);
  return new Date(matching.length ? Math.min(...matching) : wall - offsets[0]).toISOString();
}

/** `Freitag, 23. Oktober 2026` in Europe/Berlin. */
export function formatLongDate(value: Date | string, language: string): string {
  return new Date(value).toLocaleDateString(locale(language), { timeZone: ZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/** Calendar date (`YYYY-MM-DD`) in Europe/Berlin, e.g. for "today" defaults; `toISOString` would give the UTC date. */
export function localDate(date: Date = new Date()): string {
  return date.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
}

/**
 * Parses a date typed into a date field (shown as `DD.MM.YYYY`): `21.10.2026`, `1.3.26`, `21/10/2026` or
 * `2026-10-21`. Returns `YYYY-MM-DD`, or `null` for anything else (no guessing of the month/day order).
 */
export function parseDateInput(text: string): string | null {
  const value = text.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  const local = /^(\d{1,2})[./](\d{1,2})[./](\d{2}|\d{4})$/.exec(value);
  const [year, month, day] = iso ? [Number(iso[1]), Number(iso[2]), Number(iso[3])] : local ? [Number(local[3].length === 2 ? `20${local[3]}` : local[3]), Number(local[2]), Number(local[1])] : [];
  if (!year || !month || !day) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
