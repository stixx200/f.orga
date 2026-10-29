import { useQuery } from '@tanstack/react-query';
import type { ForgaStage, Session, SetupState } from '@forga/core-contracts';
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

/** Is the session confirmed with the second factor (step-up) right now? */
export function isElevated(session: Session | null | undefined, now = Date.now()): boolean {
  return Boolean(session?.elevatedUntil && Date.parse(session.elevatedUntil) > now);
}

/**
 * Like `can`, but a permission with step-up counts only while the session is confirmed: for showing sensitive fields
 * the server leaves out until then. Pages and buttons use `can`; the server asks for the second factor when needed.
 */
export function unlocked(session: Session | null | undefined, permission: string, departmentId?: string): boolean {
  if (!can(session, permission, departmentId)) return false;
  return !session?.stepUpPermissions.includes(permission) || isElevated(session);
}

/** Does the logged-in user have the permission (optionally for a department)? */
export function useCan(permission: string, departmentId?: string): boolean {
  const { data } = useSession();
  return can(data, permission, departmentId);
}

export const SETUP_QUERY_KEY = ['core', 'setup'] as const;

/** Public state of the installation: setup needed, brigade name, sign-in with OIDC and the stage. */
export function useSetupState() {
  return useQuery({ queryKey: SETUP_QUERY_KEY, queryFn: () => api<SetupState>('core/setup') });
}

/** Stage of the installation (`FORGA_STAGE`); `undefined` while loading. */
export function useStage(): ForgaStage | undefined {
  return useSetupState().data?.stage;
}
