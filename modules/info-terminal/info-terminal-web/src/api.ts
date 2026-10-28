import { useQuery } from '@tanstack/react-query';
import { InfoTerminalSettings, type Terminal, type TerminalLink } from '@forga/info-terminal-contracts';
import type { Department, Station } from '@forga/masterdata-contracts';
import { api, send, withQuery } from '@forga/web-sdk';

export { INFO_TERMINAL_MANAGE as MANAGE, INFO_TERMINAL_READ as READ, INFO_TERMINAL_SETTINGS_MANAGE as SETTINGS } from '@forga/info-terminal-contracts';

export const SETTINGS_KEY = ['core', 'settings', 'info-terminal.general'] as const;

export const keys = {
  terminals: ['info-terminal', 'terminals'] as const,
};

const LONG = 5 * 60_000;

export function useTerminals(includeRevoked = false) {
  return useQuery({
    queryKey: [...keys.terminals, includeRevoked],
    queryFn: () => api<Terminal[]>(withQuery('info-terminal/terminals', { includeRevoked: includeRevoked ? 'true' : undefined })),
  });
}

export function useSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: async () => InfoTerminalSettings.parse((await api<unknown>('core/settings/info-terminal.general')) ?? {}),
    staleTime: LONG,
  });
}

export function useDepartments() {
  return useQuery({ queryKey: ['masterdata', 'departments'], queryFn: () => api<Department[]>('masterdata/departments'), staleTime: LONG });
}

export function useStations() {
  return useQuery({ queryKey: ['masterdata', 'stations'], queryFn: () => api<Station[]>('masterdata/stations'), staleTime: LONG });
}

/** The link of a terminal (audited on the server as shown, copied or opened). */
export const fetchLink = (terminal: Pick<Terminal, 'id'>, purpose: 'show' | 'copy' | 'open') => send<TerminalLink>('POST', `info-terminal/terminals/${terminal.id}/link`, { purpose });

/** Opens the terminal in this browser; the own session stays apart (other cookie, other path). */
export async function openTerminal(terminal: Pick<Terminal, 'id'>): Promise<void> {
  const { url } = await fetchLink(terminal, 'open');
  window.location.assign(url);
}

/** Not seen for longer than the warning period of the settings. */
export function notSeenFor(terminal: Pick<Terminal, 'lastSeenAt' | 'createdAt'>, days: number, now = Date.now()): number | null {
  const seen = new Date(terminal.lastSeenAt ?? terminal.createdAt).getTime();
  const elapsed = Math.floor((now - seen) / 86_400_000);
  return elapsed > days ? elapsed : null;
}
