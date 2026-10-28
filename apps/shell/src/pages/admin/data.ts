import { useQuery } from '@tanstack/react-query';
import type { Role, User } from '@forga/core-contracts';
import { api } from '@forga/web-sdk';

export const USERS_KEY = ['core', 'users'] as const;
export const ROLES_KEY = ['core', 'roles'] as const;

export function useUsers(enabled = true) {
  return useQuery({ queryKey: USERS_KEY, queryFn: () => api<User[]>('core/users'), enabled });
}

export function useRoles() {
  return useQuery({ queryKey: ROLES_KEY, queryFn: () => api<Role[]>('core/roles') });
}

export interface DepartmentOption {
  id: string;
  name: string;
  /** E.g. `operational`, `youth`, `veterans`, `command`. */
  type?: string;
}

/** Departments of the master data module; empty while the module is not active. */
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

/** Persons of the master data module for linking a user; empty while the module is not active. */
export function usePersons() {
  return useQuery({
    queryKey: ['masterdata', 'persons', 'options'],
    queryFn: () => api<PersonOption[]>('masterdata/persons').catch((): PersonOption[] => []),
    staleTime: 5 * 60_000,
  });
}

export const personLabel = (p: PersonOption) => `${p.lastName}, ${p.firstName}${p.personnelNumber ? ` (${p.personnelNumber})` : ''}`;
