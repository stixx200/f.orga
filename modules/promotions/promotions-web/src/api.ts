import { useQuery } from '@tanstack/react-query';
import type { CatalogEntry, Department, PersonSummary } from '@forga/masterdata-contracts';
import type { Candidate, Exclusion, PersonPromotion, PromotionList, PromotionListSummary, PromotionSettings } from '@forga/promotions-contracts';
import { api, useLocalized, withQuery } from '@forga/web-sdk';

export const READ = 'promotions.read';
export const PROPOSE = 'promotions.propose';
export const DECIDE = 'promotions.decide';
export const EXCLUDE = 'promotions.exclude';
export const SETTINGS = 'promotions.settings.manage';

export const keys = {
  all: ['promotions'] as const,
  list: (id: string) => ['promotions', 'lists', id] as const,
  settings: ['core', 'settings', 'promotions.general'] as const,
};

const LONG = 5 * 60_000;

export const useCandidates = (on: string) => useQuery({ queryKey: [...keys.all, 'candidates', on], queryFn: () => api<Candidate[]>(withQuery('promotions/candidates', { on })) });
export const useLists = () => useQuery({ queryKey: [...keys.all, 'lists'], queryFn: () => api<PromotionListSummary[]>('promotions/lists') });
export const useList = (id: string) => useQuery({ queryKey: keys.list(id), queryFn: () => api<PromotionList>(`promotions/lists/${id}`) });
export const useExclusions = () => useQuery({ queryKey: [...keys.all, 'exclusions'], queryFn: () => api<Exclusion[]>('promotions/exclusions') });
export const usePersonPromotion = (personId: string) => useQuery({ queryKey: [...keys.all, 'persons', personId], queryFn: () => api<PersonPromotion>(`promotions/persons/${personId}`) });
export const usePromotionSettings = () => useQuery({ queryKey: keys.settings, queryFn: () => api<PromotionSettings | null>('core/settings/promotions.general') });
export const useCatalog = (kind: 'rank' | 'qualification' | 'office') => useQuery({ queryKey: ['masterdata', 'catalog', kind], queryFn: () => api<CatalogEntry[]>(`masterdata/catalog?kind=${kind}`), staleTime: LONG });
export const useDepartments = () => useQuery({ queryKey: ['masterdata', 'departments'], queryFn: () => api<Department[]>('masterdata/departments'), staleTime: LONG });
export const usePersons = () =>
  useQuery({ queryKey: ['masterdata', 'persons', 'summaries'], queryFn: () => api<PersonSummary[]>('masterdata/persons').catch((): PersonSummary[] => []), staleTime: LONG });

/** Name of a catalog entry; ranks by abbreviation if `short`. */
export function useCatalogName(kind: 'rank' | 'qualification' | 'office') {
  const { data = [] } = useCatalog(kind);
  const localized = useLocalized();
  return (key: string | null, short = false) => {
    if (!key) return '–';
    const entry = data.find((x) => x.key === key);
    if (!entry) return key;
    const abbreviation = entry.attributes['abbreviation'];
    return short && typeof abbreviation === 'string' && abbreviation ? abbreviation : localized(entry.name);
  };
}

export function useDepartmentName() {
  const { data = [] } = useDepartments();
  return (id: string | null) => data.find((d) => d.id === id)?.shortName || data.find((d) => d.id === id)?.name || '';
}
