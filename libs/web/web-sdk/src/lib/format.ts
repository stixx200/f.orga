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

/** ISO timestamp from a local date-time input interpreted in Europe/Berlin. */
export function fromLocalInput(local: string): string {
  const asUtc = new Date(`${local}:00Z`);
  const zoned = (zone: string) => new Date(asUtc.toLocaleString('en-US', { timeZone: zone })).getTime();
  return new Date(asUtc.getTime() - (zoned(ZONE) - zoned('UTC'))).toISOString();
}

/** `Freitag, 23. Oktober 2026` in Europe/Berlin. */
export function formatLongDate(value: Date | string, language: string): string {
  return new Date(value).toLocaleDateString(locale(language), { timeZone: ZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/** Calendar date (`YYYY-MM-DD`) in Europe/Berlin, e.g. for "today" defaults; `toISOString` would give the UTC date. */
export function localDate(date: Date = new Date()): string {
  return date.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
}
