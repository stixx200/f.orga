import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Finding, IncidentStatisticsInput, Report, ReportInput } from '@forga/incidents-contracts';
import { api, ApiError, send } from '@forga/web-sdk';
import { notifyError } from '@forga/web-ui';
import { keys } from '../api';

/** The report content in the form `PUT /incidents/reports/:id` expects. */
export type Content = Required<Omit<ReportInput, 'statistics' | 'version'>> & { statistics: IncidentStatisticsInput | null };
export type Personnel = Content['personnel'][number];

const DEBOUNCE_MS = 800;
/** Waiting times before a failed save is tried again in the background. */
const RETRY_MS = [5_000, 15_000, 30_000, 60_000];

/** Personnel times equal to the report times are stored as `null`, so they follow later changes of the report times. */
export function toContent(report: Report): Content {
  const { times } = report;
  return {
    endConfirmed: report.endConfirmed,
    authorPersonId: report.authorPersonId,
    times,
    situation: report.situation,
    actions: report.actions,
    cause: report.cause,
    incidentCommander: report.incidentCommander,
    statistics: report.statistics,
    weather: report.weather,
    equipment: report.equipment,
    personnel: report.personnel.map(({ id: _id, compensation: _c, from, to, ...p }) => ({
      ...p,
      from: from === times.alarmedAt ? null : from,
      to: to === times.returnedAt ? null : to,
    })),
    vehicles: report.vehicles.map(({ id: _id, ...v }) => v),
    involvedParties: report.involvedParties.map(({ id: _id, ...p }) => p),
    otherAgencies: report.otherAgencies.map(({ id: _id, ...a }) => a),
  };
}

export type SaveState = { status: 'idle' | 'pending' | 'saving' | 'saved' | 'failed' | 'conflict'; savedAt: Date | null };

/** Unsaved content kept in the browser, so a closed tab or a lost connection loses nothing. */
interface Buffered {
  content: Content;
  /** Version of the report the changes were made on. */
  version: number;
  at: string;
}

/** Errors of automatic saves are shown, except the conflict (it gets its own dialog). */
const notifySaveError = (error: unknown) => {
  if (!(error instanceof ApiError && error.code === 'conflict.stale')) notifyError(error);
};

const storageKey = (reportId: string) => `forga.incidents.report.${reportId}`;

/** Browser storage may be unavailable (private mode, blocked site data): then nothing is buffered. */
function readStorage<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: unknown): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Nothing to do: the save to the server still runs.
  }
}

/** Reasons for warnings typed on the check step; they survive a reload until the report is submitted. */
export function useStoredReasons(reportId: string) {
  const key = `forga.incidents.reasons.${reportId}`;
  const [reasons, setReasons] = useState<Record<string, string>>(() => readStorage<Record<string, string>>(key) ?? {});
  const set = useCallback(
    (findingKey: string, value: string) =>
      setReasons((current) => {
        const next = { ...current, [findingKey]: value };
        writeStorage(key, next);
        return next;
      }),
    [key],
  );
  const clear = useCallback(() => {
    writeStorage(key, null);
    setReasons({});
  }, [key]);
  return { reasons, setReason: set, clearReasons: clear };
}

/**
 * Local copy of the report content with automatic saving:
 * - changes are sent after a short pause, one request at a time; the response updates findings and compensation
 *   in the query cache,
 * - the version sent is the one of the last own save (never taken from a background refetch), so changes of
 *   others are not overwritten silently: the server refuses with `conflict.stale` and the user decides,
 * - unsaved changes are kept in the browser and offered again after a reload,
 * - leaving or hiding the page saves at once; failed saves are retried in the background.
 */
export function useReportEditor(report: Report) {
  const queryClient = useQueryClient();
  const key = storageKey(report.id);
  const [content, setContent] = useState<Content>(() => toContent(report));
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle', savedAt: null });
  // Unsaved content of an earlier visit, offered for restoring.
  const [restorable, setRestorable] = useState<Buffered | null>(() => {
    const stored = readStorage<Buffered>(key);
    return stored && JSON.stringify(stored.content) !== JSON.stringify(toContent(report)) ? stored : null;
  });
  const current = useRef(content);
  const version = useRef(report.version);
  const pending = useRef<Content | null>(null);
  const conflict = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const retry = useRef<{ timer?: ReturnType<typeof setTimeout>; attempt: number }>({ attempt: 0 });
  const running = useRef<Promise<void>>(Promise.resolve());
  // The latest `flush`, for the retries it schedules itself.
  const flushLater = useRef<() => Promise<void>>(() => Promise.resolve());

  const buffer = useCallback((next: Content | null) => {
    writeStorage(key, next ? ({ content: next, version: version.current, at: new Date().toISOString() } satisfies Buffered) : null);
  }, [key]);

  /**
   * Sends pending changes. A failed save keeps the changes pending, is retried in the background and rejects,
   * so submitting stops instead of submitting an outdated report.
   */
  const flush = useCallback((): Promise<void> => {
    clearTimeout(timer.current);
    const run = running.current.then(async () => {
      const body = pending.current;
      if (!body || conflict.current) return;
      pending.current = null;
      setSaveState((s) => ({ ...s, status: 'saving' }));
      try {
        const saved = await send<Report>('PUT', `incidents/reports/${report.id}`, { ...body, version: version.current });
        version.current = saved.version;
        queryClient.setQueryData(keys.report(report.id), saved);
        retry.current.attempt = 0;
        if (!pending.current) buffer(null);
        setSaveState({ status: pending.current ? 'pending' : 'saved', savedAt: new Date() });
      } catch (error) {
        pending.current ??= body;
        if (error instanceof ApiError && error.code === 'conflict.stale') {
          conflict.current = true;
          setSaveState((s) => ({ ...s, status: 'conflict' }));
        } else {
          setSaveState((s) => ({ ...s, status: 'failed' }));
          // Network or server problems: try again in the background, a little later each time.
          if (!(error instanceof ApiError) || error.status >= 500) {
            clearTimeout(retry.current.timer);
            const wait = RETRY_MS[Math.min(retry.current.attempt, RETRY_MS.length - 1)];
            retry.current.attempt += 1;
            retry.current.timer = setTimeout(() => void flushLater.current().catch(() => undefined), wait);
          }
        }
        throw error;
      }
    });
    running.current = run.catch(() => undefined);
    return run;
  }, [buffer, queryClient, report.id]);

  useEffect(() => {
    flushLater.current = flush;
  }, [flush]);

  const update = useCallback(
    (change: (content: Content) => Content) => {
      const next = change(current.current);
      current.current = next;
      pending.current = next;
      buffer(next);
      setContent(next);
      setSaveState((s) => ({ ...s, status: conflict.current ? 'conflict' : 'pending' }));
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush().catch(notifySaveError), DEBOUNCE_MS);
    },
    [buffer, flush],
  );

  /** Replaces the local content and version, e.g. after restoring a version or loading the server state. */
  const reset = useCallback((next: Report) => {
    clearTimeout(timer.current);
    pending.current = null;
    conflict.current = false;
    version.current = next.version;
    current.current = toContent(next);
    buffer(null);
    setContent(current.current);
    setSaveState((s) => ({ ...s, status: 'saved' }));
  }, [buffer]);

  /** Conflict: discard the own changes and continue with the state on the server. */
  const loadServer = useCallback(async () => {
    const fresh = await api<Report>(`incidents/reports/${report.id}`);
    queryClient.setQueryData(keys.report(report.id), fresh);
    reset(fresh);
  }, [queryClient, report.id, reset]);

  /** Conflict: save the own state over the newer one on the server. */
  const keepMine = useCallback(async () => {
    const fresh = await api<Report>(`incidents/reports/${report.id}`);
    version.current = fresh.version;
    conflict.current = false;
    pending.current = current.current;
    await flush();
  }, [flush, report.id]);

  /** Takes over the content buffered in the browser by an earlier visit. */
  const restoreLocal = useCallback(() => {
    if (restorable) update(() => restorable.content);
    setRestorable(null);
  }, [restorable, update]);
  const discardLocal = useCallback(() => {
    buffer(null);
    setRestorable(null);
  }, [buffer]);

  useEffect(() => {
    // Hiding the tab (switching apps on a phone) or leaving the page saves at once.
    const save = () => {
      if (pending.current) void flush().catch(() => undefined);
    };
    const hidden = () => document.visibilityState === 'hidden' && save();
    // Unsaved changes: the browser asks before leaving the page.
    const warn = (event: BeforeUnloadEvent) => {
      if (!pending.current) return;
      save();
      event.preventDefault();
    };
    const retries = retry.current;
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', save);
    window.addEventListener('beforeunload', warn);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pagehide', save);
      window.removeEventListener('beforeunload', warn);
      clearTimeout(retries.timer);
      // Leaving the editor within the app sends unsaved changes; they stay buffered if that fails.
      save();
    };
  }, [flush]);

  return { content, update, flush, reset, saveState, restorable, restoreLocal, discardLocal, loadServer, keepMine };
}

export type StepId = 'times' | 'personnel' | 'narrative' | 'statistics' | 'other' | 'check';
export const STEPS: StepId[] = ['times', 'personnel', 'narrative', 'statistics', 'other', 'check'];

/** The section of the editor where a finding can be fixed. */
export function stepOf(finding: Finding): StepId {
  switch (finding.rule) {
    case 'report-empty':
      return 'narrative';
    case 'statistics-missing':
    case 'statistics-not-allowed':
      return 'statistics';
    case 'times-invalid':
      return finding.subject ? 'personnel' : 'times';
    case 'duration-long':
    case 'primary-missing':
    case 'end-unconfirmed':
    case 'times-order':
    case 'incident-time-differs':
      return 'times';
    default:
      return 'personnel';
  }
}

/** Statistics as the server accepts them, or `null` while required answers are missing. */
export function completeStatistics(s: IncidentStatisticsInput | null): IncidentStatisticsInput | null {
  if (!s?.mainType) return null;
  if (s.mainType === 'fire' && !s.fireSize) return null;
  if (s.mainType === 'technical-assistance' && !s.technicalCategory) return null;
  if (s.mainType === 'false-alarm' && !s.falseAlarmType) return null;
  if ((s.rescuedSmokeInhalation ?? 0) > (s.rescued ?? 0)) return null;
  return s;
}
