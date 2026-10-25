import { useQuery } from '@tanstack/react-query';
import type { CatalogEntry, Department, PersonSummary, Station, Vehicle } from '@forga/masterdata-contracts';
import type { AlarmKeyword, Incident, IncidentSettings, Report, ReportRevision } from '@forga/incidents-contracts';
import { api, withQuery } from '@forga/web-sdk';

export const READ = 'incidents.reports.read';
export const WRITE = 'incidents.reports.write';
export const RELEASE = 'incidents.reports.release';
export const COSTS = 'incidents.costs';
export const UNLOCK = 'incidents.reports.unlock';
/** Department-level pre-review: return reports and remind authors. */
export const REVIEW = 'incidents.reports.review';
export const SELF = 'incidents.self';

export const keys = {
  incidents: ['incidents', 'incidents'] as const,
  incident: (id: string) => ['incidents', 'incidents', id] as const,
  report: (id: string) => ['incidents', 'reports', id] as const,
  revisions: (id: string) => ['incidents', 'reports', id, 'revisions'] as const,
};

const LONG = 5 * 60_000;

export interface IncidentFilter {
  from?: string;
  to?: string;
  departmentId?: string;
  status?: string;
  mine?: boolean;
  withoutStatistics?: boolean;
}

export function useIncidents(filter: IncidentFilter = {}, enabled = true) {
  return useQuery({
    enabled,
    queryKey: [...keys.incidents, filter],
    queryFn: () =>
      api<Incident[]>(withQuery('incidents/incidents', { ...filter, mine: filter.mine ? 'true' : undefined, withoutStatistics: filter.withoutStatistics ? 'true' : undefined })),
  });
}

export function useIncident(id: string) {
  return useQuery({ queryKey: keys.incident(id), queryFn: () => api<Incident>(`incidents/incidents/${id}`) });
}

/**
 * The report. Not refetched on window focus: the editor keeps its own content and version, a refetch in the
 * background must not make the cached report look newer than what the editor saves.
 */
export function useReport(id: string) {
  return useQuery({ queryKey: keys.report(id), queryFn: () => api<Report>(`incidents/reports/${id}`), refetchOnWindowFocus: false });
}

/** IDs of the active modules (e.g. to link to the compensation module instead of duplicating it). */
export function useActiveModules() {
  return useQuery({
    queryKey: ['incidents', 'active-modules'],
    queryFn: async () => (await api<{ id: string }[]>('core/modules')).map((m) => m.id),
    staleTime: LONG,
  });
}

/**
 * Persons who may write the reports of the department (with an account); only they are offered as authors, others
 * would never see the report.
 */
export function useAuthors(departmentId: string | null | undefined) {
  return useQuery({
    queryKey: ['incidents', 'authors', departmentId],
    queryFn: () => api<string[]>(withQuery('incidents/authors', { departmentId: departmentId ?? undefined })),
    enabled: Boolean(departmentId),
    staleTime: LONG,
  });
}

export function useRevisions(id: string, enabled: boolean) {
  return useQuery({ queryKey: keys.revisions(id), queryFn: () => api<ReportRevision[]>(`incidents/reports/${id}/revisions`), enabled });
}

export function useKeywords() {
  return useQuery({ queryKey: ['incidents', 'keywords'], queryFn: () => api<AlarmKeyword[]>('incidents/keywords'), staleTime: LONG });
}

export function useSettings() {
  return useQuery({
    queryKey: ['core', 'settings', 'incidents.general'],
    queryFn: () => api<IncidentSettings>('core/settings/incidents.general'),
    staleTime: LONG,
  });
}

export function useDepartments() {
  return useQuery({ queryKey: ['masterdata', 'departments'], queryFn: () => api<Department[]>('masterdata/departments'), staleTime: LONG });
}

export function useVehicles() {
  return useQuery({ queryKey: ['masterdata', 'vehicles'], queryFn: () => api<Vehicle[]>('masterdata/vehicles'), staleTime: LONG });
}

export function useStations() {
  return useQuery({ queryKey: ['masterdata', 'stations'], queryFn: () => api<Station[]>('masterdata/stations'), staleTime: LONG });
}

/** Persons the user may see; for personnel names and the person search in reports. */
export function usePersons() {
  return useQuery({
    queryKey: ['masterdata', 'persons', 'summaries'],
    queryFn: () => api<PersonSummary[]>('masterdata/persons').catch((): PersonSummary[] => []),
    staleTime: LONG,
  });
}

export function useFunctions() {
  return useQuery({
    queryKey: ['masterdata', 'catalog', 'function'],
    queryFn: () => api<CatalogEntry[]>('masterdata/catalog?kind=function'),
    staleTime: LONG,
  });
}

export const personName = (p: Pick<PersonSummary, 'firstName' | 'lastName'>) => `${p.firstName} ${p.lastName}`;

/** Lookup helpers for names of departments, persons and vehicles by ID. */
export function useNames() {
  const { data: departments = [] } = useDepartments();
  const { data: persons = [] } = usePersons();
  const { data: vehicles = [] } = useVehicles();
  const { data: stations = [] } = useStations();
  return {
    department: (id: string | null | undefined) => departments.find((d) => d.id === id)?.shortName ?? '',
    departmentName: (id: string | null | undefined) => departments.find((d) => d.id === id)?.name ?? '',
    person: (id: string | null | undefined) => {
      const person = persons.find((p) => p.id === id);
      return person ? personName(person) : '';
    },
    vehicle: (id: string | null | undefined) => vehicles.find((v) => v.id === id)?.designation ?? '',
    station: (id: string | null | undefined) => stations.find((s) => s.id === id)?.name ?? '',
  };
}
