import { useQuery } from '@tanstack/react-query';
import { type CatalogEntry, type Department, type DepartmentGroup, type MembershipSettings, type OptionalPersonField, type Person, PersonFieldSettings, type PersonSummary, type Station, type Vehicle } from '@forga/masterdata-contracts';
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

export const PERSON_FIELDS_KEY = ['core', 'settings', 'masterdata.personFields'] as const;

/** Fields of the person file switched off in the settings (L10): forms leave them out. */
export function useDisabledFields(): Set<OptionalPersonField> {
  const { data } = useQuery({
    queryKey: PERSON_FIELDS_KEY,
    queryFn: () => api<unknown>('core/settings/masterdata.personFields'),
    select: (value) => new Set(PersonFieldSettings.parse(value ?? {}).disabled),
    staleTime: 60_000,
  });
  return data ?? new Set();
}

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

/** Full years between birth date and reference date (`YYYY-MM-DD`). */
export function ageOn(birthDate: string, date: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [y, m, d] = date.split('-').map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

/** Groups of the departments the user may see (`DepartmentGroup`). */
export function useGroups() {
  return useQuery({ queryKey: ['masterdata', 'groups'], queryFn: () => api<DepartmentGroup[]>('masterdata/groups') });
}

/** Groups the user leads ("Meine Gruppe"). */
export function useMyGroups() {
  return useQuery({ queryKey: ['masterdata', 'groups', 'mine'], queryFn: () => api<DepartmentGroup[]>('masterdata/groups/mine') });
}
