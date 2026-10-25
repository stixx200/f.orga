import { useQuery } from '@tanstack/react-query';
import type { CompensationSettings, FunctionHolder, Item, Run, RunDetail, YearTotal } from '@forga/compensation-contracts';
import type { CatalogEntry, Course, Department, PersonSummary } from '@forga/masterdata-contracts';
import { api, withQuery } from '@forga/web-sdk';

export const READ = 'compensation.read';
export const RUNS = 'compensation.runs';
export const MANUAL = 'compensation.items.manual';
export const SETTINGS = 'compensation.settings.manage';

export const keys = {
  all: ['compensation'] as const,
  runs: ['compensation', 'runs'] as const,
  run: (id: string) => ['compensation', 'runs', id] as const,
  settings: ['core', 'settings', 'compensation.general'] as const,
};

const LONG = 5 * 60_000;

export const useRuns = () => useQuery({ queryKey: keys.runs, queryFn: () => api<Run[]>('compensation/runs') });
export const useRun = (id: string) => useQuery({ queryKey: keys.run(id), queryFn: () => api<RunDetail>(`compensation/runs/${id}`) });
export const useOpenItems = () => useQuery({ queryKey: [...keys.all, 'items', 'open'], queryFn: () => api<Item[]>('compensation/items?open=true') });
export const usePersonItems = (personId: string, year: number) =>
  useQuery({ queryKey: [...keys.all, 'persons', personId, year], queryFn: () => api<Item[]>(withQuery(`compensation/persons/${personId}/items`, { year })) });
export const useHolders = () => useQuery({ queryKey: [...keys.all, 'functions'], queryFn: () => api<FunctionHolder[]>('compensation/functions') });
export const useYearTotals = (year: number) => useQuery({ queryKey: [...keys.all, 'year-totals', year], queryFn: () => api<YearTotal[]>(withQuery('compensation/year-totals', { year })) });
export const useCompensationSettings = () => useQuery({ queryKey: keys.settings, queryFn: () => api<CompensationSettings | null>('core/settings/compensation.general') });

export function useDepartments() {
  return useQuery({ queryKey: ['masterdata', 'departments'], queryFn: () => api<Department[]>('masterdata/departments'), staleTime: LONG });
}

/** Offices of the person files, to link function allowances. */
export function useOffices() {
  return useQuery({ queryKey: ['masterdata', 'catalog', 'office'], queryFn: () => api<CatalogEntry[]>('masterdata/catalog?kind=office'), staleTime: LONG });
}

/** Courses of the master data, for the course allowances. */
export function useCourses() {
  return useQuery({ queryKey: ['masterdata', 'courses'], queryFn: () => api<Course[]>('masterdata/courses'), staleTime: LONG });
}

export function usePersons() {
  return useQuery({ queryKey: ['masterdata', 'persons', 'summaries'], queryFn: () => api<PersonSummary[]>('masterdata/persons').catch((): PersonSummary[] => []), staleTime: LONG });
}

export function usePersonName() {
  const { data: persons = [] } = usePersons();
  return (id: string) => {
    const p = persons.find((x) => x.id === id);
    return p ? `${p.lastName}, ${p.firstName}` : '–';
  };
}
