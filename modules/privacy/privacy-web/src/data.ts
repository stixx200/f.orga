import { useQuery } from '@tanstack/react-query';
import { api } from '@forga/web-sdk';

export interface DepartmentOption {
  id: string;
  name: string;
}

/** Departments of the master data module (a requirement of this module). */
export function useDepartments() {
  return useQuery({
    queryKey: ['masterdata', 'departments'],
    queryFn: () => api<DepartmentOption[]>('masterdata/departments').catch((): DepartmentOption[] => []),
    staleTime: 5 * 60_000,
  });
}

export interface PersonOption {
  id: string;
  firstName: string;
  lastName: string;
  personnelNumber: string | null;
}

/** Persons of the master data module the user may see. */
export function usePersons() {
  return useQuery({
    queryKey: ['masterdata', 'persons', 'options'],
    queryFn: () => api<PersonOption[]>('masterdata/persons').catch((): PersonOption[] => []),
    staleTime: 5 * 60_000,
  });
}

export const personLabel = (p: PersonOption) => `${p.lastName}, ${p.firstName}${p.personnelNumber ? ` (${p.personnelNumber})` : ''}`;
