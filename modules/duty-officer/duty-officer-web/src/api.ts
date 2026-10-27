import { useQuery } from '@tanstack/react-query';
import type { Session } from '@forga/core-contracts';
import { type DutyAssignment, DutyOfficerSettings, type IncidentDutyOfficer } from '@forga/duty-officer-contracts';
import type { PersonSummary } from '@forga/masterdata-contracts';
import { api, can, withQuery } from '@forga/web-sdk';

export { DUTY_OFFICER_MANAGE as MANAGE, DUTY_OFFICER_READ as READ, DUTY_OFFICER_ROSTER as ROSTER, DUTY_OFFICER_WRITE as WRITE } from '@forga/duty-officer-contracts';
export const SETTINGS = 'duty-officer.settings.manage';

export const SETTINGS_KEY = ['core', 'settings', 'duty-officer.general'] as const;

export const keys = {
  roster: ['duty-officer', 'roster'] as const,
  incident: (id: string) => ['duty-officer', 'incidents', id] as const,
};

const LONG = 5 * 60_000;

export function useRoster(year: string) {
  return useQuery({
    queryKey: [...keys.roster, year],
    queryFn: () => api<DutyAssignment[]>(withQuery('duty-officer/roster', { from: `${year}-01-01`, to: `${year}-12-31` })),
  });
}

export function useDutySettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: async () => DutyOfficerSettings.parse((await api<unknown>('core/settings/duty-officer.general')) ?? {}),
    staleTime: LONG,
  });
}

export function useIncidentDutyOfficer(incidentId: string, enabled: boolean) {
  return useQuery({ queryKey: keys.incident(incidentId), queryFn: () => api<IncidentDutyOfficer>(`duty-officer/incidents/${incidentId}`), enabled });
}

/** Persons the user may see; for names in the roster. */
export function usePersons() {
  return useQuery({
    queryKey: ['masterdata', 'persons', 'summaries'],
    queryFn: () => api<PersonSummary[]>('masterdata/persons').catch((): PersonSummary[] => []),
    staleTime: LONG,
  });
}

export const personName = (p: Pick<PersonSummary, 'firstName' | 'lastName'>) => `${p.firstName} ${p.lastName}`;

/** Does the user hold any of the permissions? */
export const canAny = (session: Session | null | undefined, ...permissions: string[]) => permissions.some((p) => can(session, p));
