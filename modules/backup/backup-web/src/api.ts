import { useQuery } from '@tanstack/react-query';
import type { BackupEntry, BackupOverview, BackupSettingsView } from '@forga/backup-contracts';
import { api, ApiError } from '@forga/web-sdk';

export { BACKUP_MANAGE as MANAGE } from '@forga/backup-contracts';

export const keys = {
  status: ['backup', 'status'] as const,
  backups: ['backup', 'backups'] as const,
  settings: ['backup', 'settings'] as const,
};

/** All queries of the module, refreshed after every action. */
export const ALL = [keys.status, keys.backups, keys.settings] as const;

export function useOverview() {
  return useQuery({
    queryKey: keys.status,
    queryFn: () => api<BackupOverview>('backup/status'),
    refetchInterval: (query) => (query.state.data?.running ? 3000 : false),
  });
}

export function useBackups() {
  return useQuery({
    queryKey: keys.backups,
    queryFn: () => api<BackupEntry[]>('backup/backups'),
    refetchInterval: (query) => (query.state.data?.some((b) => b.status === 'running') ? 3000 : false),
  });
}

export function useSettings() {
  return useQuery({ queryKey: keys.settings, queryFn: () => api<BackupSettingsView>('backup/settings') });
}

export function useBackup(id: string) {
  return useQuery({ queryKey: [...keys.backups, id], queryFn: () => api<BackupEntry>(`backup/backups/${id}`) });
}

/** Uploads a backup file as it is (no form), into the target folder. */
export async function uploadBackup(file: File): Promise<BackupEntry> {
  const response = await fetch(`/api/backup/backups/upload?name=${encodeURIComponent(file.name)}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'x-forga': '1', 'Content-Type': 'application/octet-stream' },
    body: file,
  });
  const body = await response.json().catch(() => undefined);
  if (!response.ok) throw new ApiError(response.status, body as ApiError['body']);
  return body as BackupEntry;
}

/** Readable size, e.g. `48 MB`. */
export function formatBytes(bytes: number | null | undefined, language: string): string {
  if (bytes === null || bytes === undefined) return '–';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  return `${new Intl.NumberFormat(language, { maximumFractionDigits: value < 10 && unit > 0 ? 1 : 0 }).format(value)} ${units[unit]}`;
}

/** Duration, e.g. `1 min 12 s`. */
export function formatDuration(ms: number | null): string {
  if (ms === null) return '';
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}
