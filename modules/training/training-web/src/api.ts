import { useQuery } from '@tanstack/react-query';
import type { Department, PersonSummary, Station } from '@forga/masterdata-contracts';
import type { Session, SessionType, TrainingSettings } from '@forga/training-contracts';
import { api, useLocalized, withQuery } from '@forga/web-sdk';

export const READ = 'training.read';
export const PLAN = 'training.plan';
export const ATTENDANCE = 'training.attendance';
export const CLOSE = 'training.close';
export const SETTINGS = 'training.settings.manage';

export const keys = {
  sessions: ['training', 'sessions'] as const,
  session: (id: string) => ['training', 'sessions', id] as const,
  types: ['training', 'types'] as const,
};

const LONG = 5 * 60_000;

export function useSessions(filter: { from?: string; to?: string; departmentId?: string; type?: string; category?: string }) {
  return useQuery({ queryKey: [...keys.sessions, filter], queryFn: () => api<Session[]>(withQuery('training/sessions', filter)) });
}

/** One session; `refetchInterval` (ms) keeps it current, e.g. for the QR check-ins coming in. */
export function useSession(id: string, refetchInterval?: number) {
  return useQuery({ queryKey: keys.session(id), queryFn: () => api<Session>(`training/sessions/${id}`), refetchInterval });
}

export function useTypes() {
  return useQuery({ queryKey: keys.types, queryFn: () => api<SessionType[]>('training/types'), staleTime: LONG });
}

export function useTrainingSettings() {
  return useQuery({ queryKey: ['core', 'settings', 'training.general'], queryFn: () => api<TrainingSettings | null>('core/settings/training.general') });
}

export function useDepartments() {
  return useQuery({ queryKey: ['masterdata', 'departments'], queryFn: () => api<Department[]>('masterdata/departments'), staleTime: LONG });
}

export function useStations() {
  return useQuery({ queryKey: ['masterdata', 'stations'], queryFn: () => api<Station[]>('masterdata/stations'), staleTime: LONG });
}

export function usePersons() {
  return useQuery({
    queryKey: ['masterdata', 'persons', 'summaries'],
    queryFn: () => api<PersonSummary[]>('masterdata/persons').catch((): PersonSummary[] => []),
    staleTime: LONG,
  });
}

export const personName = (p: Pick<PersonSummary, 'firstName' | 'lastName'>) => `${p.firstName} ${p.lastName}`;

export function useTypeName() {
  const { data: types = [] } = useTypes();
  const localized = useLocalized();
  return (key: string) => {
    const type = types.find((t) => t.key === key);
    return type ? localized(type.name) : key;
  };
}
