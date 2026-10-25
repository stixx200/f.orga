import type { MemberPeriods } from '@forga/masterdata-contracts';
import type { Participation } from '@forga/training-contracts';

/** A session counting for the participation, with its attendance. */
export interface CountedSession {
  startsAt: Date;
  endsAt: Date;
  departmentIds: string[];
  attendance: { personId: string; status: 'present' | 'excused' | 'absent'; from: Date | null; to: Date | null }[];
}

/** Day of a time in Europe/Berlin (kept free of the server framework, so it is unit tested on its own). */
const berlinDate = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
const hours = (from: Date, to: Date) => Math.round(((to.getTime() - from.getTime()) / 3_600_000) * 10) / 10;

/**
 * Participation per person: the sessions that concern the person are those of the departments the person was a member
 * of on the day (only `departmentId`, when given), plus those the person is listed in (e.g. as a guest). The rate is
 * present divided by these sessions, not by all sessions of the brigade. `departmentId` of a row is the person's
 * primary department at the end of the period.
 */
export function participation(sessions: CountedSession[], members: readonly MemberPeriods[], options: { to: string; departmentId?: string }): Participation[] {
  const rows = new Map<string, Participation>();
  const row = (personId: string) => {
    let entry = rows.get(personId);
    if (!entry) {
      entry = { personId, departmentId: null, sessions: 0, present: 0, excused: 0, rate: 0, hours: 0 };
      rows.set(personId, entry);
    }
    return entry;
  };
  for (const session of sessions) {
    const date = berlinDate(session.startsAt);
    const departments = options.departmentId ? [options.departmentId] : session.departmentIds;
    const concerned = new Set(
      members
        .filter((m) => m.periods.some((p) => departments.includes(p.departmentId) && p.from <= date && (!p.to || p.to >= date)))
        .map((m) => m.id),
    );
    for (const a of session.attendance) concerned.add(a.personId);
    for (const personId of concerned) row(personId).sessions++;
    for (const a of session.attendance) {
      const entry = row(a.personId);
      if (a.status === 'present') {
        entry.present++;
        entry.hours += hours(a.from ?? session.startsAt, a.to ?? session.endsAt);
      }
      if (a.status === 'excused') entry.excused++;
    }
  }
  const byId = new Map(members.map((m) => [m.id, m]));
  return [...rows.values()].map((entry) => {
    const primary = byId
      .get(entry.personId)
      ?.periods.filter((p) => p.primary && p.from <= options.to)
      .toSorted((a, b) => b.from.localeCompare(a.from))[0];
    return { ...entry, departmentId: primary?.departmentId ?? null, hours: Math.round(entry.hours * 10) / 10, rate: entry.sessions ? Math.round((entry.present / entry.sessions) * 100) : 0 };
  });
}
