import { useQuery } from '@tanstack/react-query';
import type { AddressBookEntry, Candidate, CostRecoverySettings, Notice } from '@forga/cost-recovery-contracts';
import { api, useLocalized, withQuery } from '@forga/web-sdk';

export const READ = 'cost-recovery.read';
export const WRITE = 'cost-recovery.write';
export const ISSUE = 'cost-recovery.issue';
export const SETTINGS = 'cost-recovery.settings.manage';

export const keys = {
  all: ['cost-recovery'] as const,
  notice: (id: string) => ['cost-recovery', 'notices', id] as const,
  settings: ['core', 'settings', 'cost-recovery.general'] as const,
};

export const useCandidates = (filter: { from?: string; to?: string }) => useQuery({ queryKey: [...keys.all, 'candidates', filter], queryFn: () => api<Candidate[]>(withQuery('cost-recovery/candidates', filter)) });
export const useNotices = (filter: { status?: string; year?: number }) => useQuery({ queryKey: [...keys.all, 'notices', filter], queryFn: () => api<Notice[]>(withQuery('cost-recovery/notices', filter)) });
export const useNotice = (id: string) => useQuery({ queryKey: keys.notice(id), queryFn: () => api<Notice>(`cost-recovery/notices/${id}`) });
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
