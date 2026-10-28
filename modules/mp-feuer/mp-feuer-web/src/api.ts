import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ActiveModule, RememberedMapping } from '@forga/core-contracts';
import type { Department } from '@forga/masterdata-contracts';
import { type MpFeuerExportInfo, type MpFeuerRemembered, type MpFeuerRun, RUNNING, type RunReport, type RunSelection, type RunSummary } from '@forga/mp-feuer-contracts';
import { api, send } from '@forga/web-sdk';

export { MP_FEUER_READ as READ, MP_FEUER_TRANSFER as TRANSFER } from '@forga/mp-feuer-contracts';

export const keys = {
  runs: ['mp-feuer', 'runs'] as const,
  run: (id: string) => ['mp-feuer', 'runs', id] as const,
  report: (id: string) => ['mp-feuer', 'runs', id, 'report'] as const,
  mappings: ['remembered-mappings', 'mp-feuer/mappings'] as const,
  remembered: ['mp-feuer', 'remembered'] as const,
};

const LONG = 5 * 60_000;
/** The UI asks for the progress of a working run every 2 seconds. */
export const POLL_MS = 2000;

export const isRunning = (run: Pick<MpFeuerRun, 'status'> | Pick<RunSummary, 'status'> | undefined) => !!run && RUNNING.includes(run.status);

export function useRun(id: string | undefined) {
  return useQuery({
    queryKey: keys.run(id ?? ''),
    queryFn: () => api<MpFeuerRun>(`mp-feuer/runs/${id}`),
    enabled: !!id,
    refetchInterval: (query) => (isRunning(query.state.data) ? POLL_MS : false),
  });
}

export function useRuns() {
  return useQuery({
    queryKey: keys.runs,
    queryFn: () => api<RunSummary[]>('mp-feuer/runs'),
    refetchInterval: (query) => (query.state.data?.some(isRunning) ? POLL_MS : false),
  });
}

export function useReport(id: string, enabled = true) {
  return useQuery({ queryKey: keys.report(id), queryFn: () => api<RunReport>(`mp-feuer/runs/${id}/report`), enabled });
}

export function useMappings() {
  return useQuery({ queryKey: keys.mappings, queryFn: () => api<RememberedMapping[]>('mp-feuer/mappings') });
}

export function useRemembered() {
  return useQuery({ queryKey: keys.remembered, queryFn: () => api<MpFeuerRemembered>('mp-feuer/remembered') });
}

export function useExports() {
  return useQuery({ queryKey: ['mp-feuer', 'exports'], queryFn: () => api<MpFeuerExportInfo[]>('mp-feuer/exports'), staleTime: LONG });
}

export function useDepartments() {
  return useQuery({ queryKey: ['masterdata', 'departments'], queryFn: () => api<Department[]>('masterdata/departments'), staleTime: LONG });
}

/** Parallel operation of the incidents module: who keeps the incident reports, and releases announced from when. */
export function useIncidentOperation() {
  const { data: modules = [] } = useQuery({ queryKey: ['mp-feuer', 'active-modules'], queryFn: () => api<ActiveModule[]>('core/modules'), staleTime: LONG });
  const incidents = modules.some((m) => m.id === 'incidents');
  return useQuery({
    queryKey: ['core', 'settings', 'incidents.general'],
    queryFn: async () => (await api<{ externalLeading?: string | null; externalEventsFrom?: string | null } | null>('core/settings/incidents.general')) ?? {},
    enabled: incidents,
    staleTime: LONG,
  });
}

/** Saves a part of the selection and keeps the answer as the current state of the run. */
export function useSelect(id: string) {
  const client = useQueryClient();
  return async (selection: RunSelection) => {
    const run = await send<MpFeuerRun>('PUT', `mp-feuer/runs/${id}`, selection);
    client.setQueryData(keys.run(id), run);
    return run;
  };
}
