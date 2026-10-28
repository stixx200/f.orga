import { useQuery } from '@tanstack/react-query';
import { type CatalogEntry, type Department, type PersonSummary, type Station, type Vehicle, vehicleLabel } from '@forga/masterdata-contracts';
import type { AlarmKeyword, Incident, IncidentSettings, IncidentUnit, Report, ReportRevision } from '@forga/incidents-contracts';
import { api, can, useLocalized, useSession, withQuery } from '@forga/web-sdk';

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

/** Who a report belongs to: a department, or a brigade-wide unit such as the duty officer (`unit`). */
export type ReportOwner = { departmentId: string | null; unit?: string | null };

/** Key of the owner for queries and maps, e.g. `unit:duty-officer`. */
export const ownerKey = (owner: ReportOwner) => owner.departmentId ?? `unit:${owner.unit ?? ''}`;

/**
 * Persons who may write the reports of the department or unit (with an account); only they are offered as authors,
 * others would never see the report. `null`: nothing to load (e.g. read-only).
 */
export function useAuthors(owner: ReportOwner | null) {
  return useQuery({
    queryKey: ['incidents', 'authors', owner ? ownerKey(owner) : null],
    queryFn: () => api<string[]>(withQuery('incidents/authors', owner?.departmentId ? { departmentId: owner.departmentId } : { unit: owner?.unit ?? undefined })),
    enabled: Boolean(owner && (owner.departmentId || owner.unit)),
    staleTime: LONG,
  });
}

/** Brigade-wide units writing their own reports (e.g. the duty officer), registered by other modules. */
export function useUnits() {
  return useQuery({ queryKey: ['incidents', 'units'], queryFn: () => api<IncidentUnit[]>('incidents/units'), staleTime: LONG });
}

/**
 * What the user may do with a report, as the server checks it: department reports by the department grants, reports
 * of units by the permissions the unit names; releasers everything.
 */
export function useReportAccess() {
  const session = useSession().data;
  const { data: units = [] } = useUnits();
  const releaser = session?.permissions[RELEASE] === 'brigade';
  const unitOf = (owner: ReportOwner) => units.find((u) => u.key === owner.unit);
  return {
    releaser,
    read: (owner: ReportOwner) => {
      if (releaser) return true;
      if (owner.departmentId) return can(session, READ, owner.departmentId);
      const unit = unitOf(owner);
      return session?.permissions[READ] === 'brigade' || Boolean(unit && [unit.readPermission, unit.writePermission, unit.reviewPermission].some((p) => can(session, p)));
    },
    write: (owner: ReportOwner) => {
      if (releaser) return true;
      if (owner.departmentId) return can(session, WRITE, owner.departmentId);
      const unit = unitOf(owner);
      return Boolean(unit && can(session, unit.writePermission));
    },
    review: (owner: ReportOwner) => {
      if (releaser) return true;
      if (owner.departmentId) return can(session, REVIEW, owner.departmentId);
      const unit = unitOf(owner);
      return Boolean(unit && can(session, unit.reviewPermission));
    },
    /** Pre-reviewer of any department or unit. */
    reviewsAny: releaser || can(session, REVIEW) || units.some((u) => can(session, u.reviewPermission)),
  };
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

/** Parallel operation: reports of the MP-Feuer import are changed in MP-Feuer while it leads (setting `externalLeading`). */
export function ledByMpFeuer(settings: IncidentSettings | undefined, report: { managedBy: string | null }): boolean {
  return settings?.externalLeading === 'mp-feuer' && report.managedBy === 'mp-feuer';
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
  const localized = useLocalized();
  const { data: units = [] } = useUnits();
  const { data: departments = [] } = useDepartments();
  const { data: persons = [] } = usePersons();
  const { data: vehicles = [] } = useVehicles();
  const { data: stations = [] } = useStations();
  return {
    department: (id: string | null | undefined) => departments.find((d) => d.id === id)?.shortName ?? '',
    departmentName: (id: string | null | undefined) => departments.find((d) => d.id === id)?.name ?? '',
    /** Short name of the owner of a report: the department, or the unit (e.g. "EvD"). */
    owner: (owner: ReportOwner) => {
      if (owner.departmentId) return departments.find((d) => d.id === owner.departmentId)?.shortName ?? '';
      const unit = units.find((u) => u.key === owner.unit);
      return unit ? localized(unit.shortLabel) : (owner.unit ?? '');
    },
    /** Full name of the owner of a report: the department, or the unit (e.g. "Einsatzleiter vom Dienst"). */
    ownerName: (owner: ReportOwner) => {
      if (owner.departmentId) return departments.find((d) => d.id === owner.departmentId)?.name ?? '';
      const unit = units.find((u) => u.key === owner.unit);
      return unit ? localized(unit.label) : (owner.unit ?? '');
    },
    /** Short name of a unit by its key (e.g. in findings, `unit:duty-officer`). */
    unit: (key: string) => {
      const unit = units.find((u) => u.key === key);
      return unit ? localized(unit.shortLabel) : key;
    },
    person: (id: string | null | undefined) => {
      const person = persons.find((p) => p.id === id);
      return person ? personName(person) : '';
    },
    /** Designation, call sign and department, since designations like "Anhänger" repeat. */
    vehicle: (id: string | null | undefined) => {
      const vehicle = vehicles.find((v) => v.id === id);
      return vehicle ? vehicleLabel(vehicle, departments.find((d) => d.id === vehicle.departmentId)?.shortName) : '';
    },
    station: (id: string | null | undefined) => stations.find((s) => s.id === id)?.name ?? '',
  };
}
