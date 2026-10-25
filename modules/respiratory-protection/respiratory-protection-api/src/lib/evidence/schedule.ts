/** Hour (Europe/Berlin) of the daily check of the traffic lights. */
export const REFRESH_HOUR = 4;

const berlinDate = (instant: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(instant);

/** `REFRESH_HOUR` on a calendar day in Europe/Berlin, including summer time. */
function refreshOn(date: string): Date {
  const asUtc = new Date(`${date}T${String(REFRESH_HOUR).padStart(2, '0')}:00:00Z`);
  const zoned = (zone: string) => new Date(asUtc.toLocaleString('en-US', { timeZone: zone })).getTime();
  return new Date(asUtc.getTime() - (zoned('Europe/Berlin') - zoned('UTC')));
}

/** Next daily check: today at `REFRESH_HOUR` (Europe/Berlin), or tomorrow if that has passed. */
export function nextRefresh(now: Date): Date {
  const today = refreshOn(berlinDate(now));
  if (today > now) return today;
  const tomorrow = new Date(`${berlinDate(now)}T12:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return refreshOn(tomorrow.toISOString().slice(0, 10));
}
