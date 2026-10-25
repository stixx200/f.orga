import { useQuery } from '@tanstack/react-query';
import type { AddressBookEntry, Candidate, CostRecoverySettings, IncidentNotice, Notice } from '@forga/cost-recovery-contracts';
import { api, ApiError, apiUrl, useLocalized, withQuery } from '@forga/web-sdk';

export const READ = 'cost-recovery.read';
export const WRITE = 'cost-recovery.write';
export const ISSUE = 'cost-recovery.issue';
export const REFUND = 'cost-recovery.refund';
export const SETTINGS = 'cost-recovery.settings.manage';

export const keys = {
  all: ['cost-recovery'] as const,
  notice: (id: string) => ['cost-recovery', 'notices', id] as const,
  settings: ['core', 'settings', 'cost-recovery.general'] as const,
};

export type ListFilter = { status?: string; year?: number; q?: string; overdue?: 'true'; refund?: 'true' };

export const useCandidates = (filter: { from?: string; to?: string }) => useQuery({ queryKey: [...keys.all, 'candidates', filter], queryFn: () => api<Candidate[]>(withQuery('cost-recovery/candidates', filter)) });
export const useNotices = (filter: ListFilter) => useQuery({ queryKey: [...keys.all, 'notices', filter], queryFn: () => api<Notice[]>(withQuery('cost-recovery/notices', filter)) });
export const useNotice = (id: string) => useQuery({ queryKey: keys.notice(id), queryFn: () => api<Notice>(`cost-recovery/notices/${id}`) });
export const useIncidentNotices = (incidentId: string, enabled: boolean) =>
  useQuery({ queryKey: [...keys.all, 'incident', incidentId], queryFn: () => api<IncidentNotice[]>(`cost-recovery/incidents/${incidentId}/notices`), enabled });
export const useAddressBook = () => useQuery({ queryKey: [...keys.all, 'debtors'], queryFn: () => api<AddressBookEntry[]>('cost-recovery/debtors') });
export const useCostSettings = () => useQuery({ queryKey: keys.settings, queryFn: () => api<CostRecoverySettings | null>('core/settings/cost-recovery.general') });

export function useOffenseName() {
  const { data } = useCostSettings();
  const localized = useLocalized();
  return (key: string | null) => {
    const offense = data?.offenses.find((o) => o.key === key);
    return offense ? localized(offense.name) : (key ?? '–');
  };
}

/** Downloads a file from the API (also POST), so errors show as message instead of an error page. */
export async function download(method: 'GET' | 'POST', path: string, query: Record<string, string | number | undefined>): Promise<Response> {
  const response = await fetch(apiUrl(path, query), { method, credentials: 'include', headers: { 'x-forga': '1' } });
  if (!response.ok) throw new ApiError(response.status, await response.json().catch(() => undefined));
  const name = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ?? 'download';
  const link = document.createElement('a');
  link.href = URL.createObjectURL(await response.clone().blob());
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
  return response;
}
