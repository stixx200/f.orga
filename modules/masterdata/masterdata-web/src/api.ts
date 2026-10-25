import { useQuery } from '@tanstack/react-query';
import type { CatalogEntry, Department, MembershipSettings, Person, PersonSummary, Station, Vehicle } from '@forga/masterdata-contracts';
import { api, withQuery } from '@forga/web-sdk';

export const MANAGE = 'masterdata.organization.manage';
export const PERSONS_WRITE = 'masterdata.persons.write';

export const keys = {
  departments: ['masterdata', 'departments'] as const,
  stations: ['masterdata', 'stations'] as const,
  vehicles: ['masterdata', 'vehicles'] as const,
  persons: ['masterdata', 'persons'] as const,
};

export function useDepartments() {
  return useQuery({ queryKey: keys.departments, queryFn: () => api<Department[]>('masterdata/departments') });
}

/** Membership rules (probation, ages) from the settings. */
export function useMembershipRules() {
  return useQuery({
    queryKey: ['core', 'settings', 'masterdata.membership'],
    queryFn: () => api<MembershipSettings | null>('core/settings/masterdata.membership'),
  });
}

export { probationEnd } from '@forga/masterdata-contracts';

export function useStations() {
  return useQuery({ queryKey: keys.stations, queryFn: () => api<Station[]>('masterdata/stations') });
}

/** All vehicles including retired ones, so the organization shows the complete fleet. */
export function useVehicles() {
  return useQuery({ queryKey: [...keys.vehicles, 'all'], queryFn: () => api<Vehicle[]>('masterdata/vehicles?includeRetired=true') });
}

export function usePersons(departmentId?: string, filter: { status?: string; includeLeft?: boolean } = {}) {
  return useQuery({
    queryKey: [...keys.persons, 'summaries', departmentId ?? 'all', filter],
    queryFn: () => api<PersonSummary[]>(withQuery('masterdata/persons', { departmentId, status: filter.status, includeLeft: filter.includeLeft ? 'true' : undefined })),
  });
}

export function usePerson(id: string) {
  return useQuery({ queryKey: [...keys.persons, id], queryFn: () => loadPerson(id) });
}

/** Catalog entries of a kind as `key → localized name` lookup. */
export function useCatalogNames(kind: CatalogEntry['kind']) {
  const { data = [] } = useCatalog(kind);
  return (key: string | null | undefined, language: string) => {
    const entry = data.find((e) => e.key === key);
    return entry ? (language === 'en' ? entry.name.en : entry.name.de) : (key ?? '');
  };
}

export const WRITE = PERSONS_WRITE;
export const READ = 'masterdata.persons.read';
export const SENSITIVE = 'masterdata.persons.sensitive';

export function useCatalog(kind: CatalogEntry['kind']) {
  return useQuery({ queryKey: ['masterdata', 'catalog', kind], queryFn: () => api<CatalogEntry[]>(`masterdata/catalog?kind=${kind}`), staleTime: 5 * 60_000 });
}

export const loadPerson = (id: string) => api<Person>(`masterdata/persons/${id}`);

export const personName = (p: Pick<PersonSummary, 'firstName' | 'lastName'>) => `${p.firstName} ${p.lastName}`;

/** Today in Europe/Berlin as `YYYY-MM-DD`. */
export const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
