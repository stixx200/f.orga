import { useQuery } from '@tanstack/react-query';
import type { Session } from '@forga/core-contracts';
import { api } from './api';

export const SESSION_QUERY_KEY = ['core', 'session'] as const;

/** The logged-in user and the permissions; `null` while nobody is logged in. */
export function useSession() {
  return useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: async () => {
      try {
        return await api<Session>('core/session');
      } catch (error) {
        if ((error as { status?: number }).status === 401) return null;
        throw error;
      }
    },
    staleTime: 60_000,
  });
}

/** Checks a permission in the session, optionally for a department. */
export function can(session: Session | null | undefined, permission: string, departmentId?: string): boolean {
  const grant = session?.permissions[permission];
  if (!grant) return false;
  if (grant === 'brigade' || departmentId === undefined) return true;
  return grant.includes(departmentId);
}

/** Does the logged-in user have the permission (optionally for a department)? */
export function useCan(permission: string, departmentId?: string): boolean {
  const { data } = useSession();
  return can(data, permission, departmentId);
}
