import { useQuery } from '@tanstack/react-query';
import type { Department, PersonSummary } from '@forga/masterdata-contracts';
import type { FitnessRule, FitnessStatus, PersonRespiratoryProtection } from '@forga/respiratory-protection-contracts';
import { api, withQuery } from '@forga/web-sdk';

export const READ = 'respiratory-protection.read';
export const EVIDENCE = 'respiratory-protection.evidence';
export const EXAMINATIONS = 'respiratory-protection.examinations';
export const SETTINGS = 'respiratory-protection.settings.manage';

export const keys = {
  all: ['respiratory-protection'] as const,
  status: ['respiratory-protection', 'status'] as const,
  person: (id: string) => ['respiratory-protection', 'persons', id] as const,
  rule: ['core', 'settings', 'respiratory-protection.rule'] as const,
};

const LONG = 5 * 60_000;

export function useStatus(filter: { departmentId?: string } = {}) {
  return useQuery({ queryKey: [...keys.status, filter], queryFn: () => api<FitnessStatus[]>(withQuery('respiratory-protection/status', filter)) });
}

export function usePersonRespiratoryProtection(personId: string) {
  return useQuery({ queryKey: keys.person(personId), queryFn: () => api<PersonRespiratoryProtection>(`respiratory-protection/persons/${personId}`) });
}

export function useRule() {
  return useQuery({ queryKey: keys.rule, queryFn: () => api<FitnessRule | null>('core/settings/respiratory-protection.rule') });
}

export function useDepartments() {
  return useQuery({ queryKey: ['masterdata', 'departments'], queryFn: () => api<Department[]>('masterdata/departments'), staleTime: LONG });
}

export function usePersons() {
  return useQuery({
    queryKey: ['masterdata', 'persons', 'summaries'],
    queryFn: () => api<PersonSummary[]>('masterdata/persons').catch((): PersonSummary[] => []),
    staleTime: LONG,
  });
}
