import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Finding, IncidentStatisticsInput, Report, ReportInput } from '@forga/incidents-contracts';
import { send } from '@forga/web-sdk';
import { notifyError } from '@forga/web-ui';
import { keys } from '../api';

/** The report content in the form `PUT /incidents/reports/:id` expects. */
export type Content = Required<Omit<ReportInput, 'statistics' | 'version'>> & { statistics: IncidentStatisticsInput | null };
export type Personnel = Content['personnel'][number];

const DEBOUNCE_MS = 800;

/** Personnel times equal to the report times are stored as `null`, so they follow later changes of the report times. */
export function toContent(report: Report): Content {
  const { times } = report;
  return {
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

export type SaveState = { status: 'idle' | 'pending' | 'saving' | 'saved' | 'failed'; savedAt: Date | null };

/**
 * Local copy of the report content with automatic saving: changes are sent after a short pause,
 * one request at a time; the response updates findings and compensation in the query cache.
 */
export function useReportEditor(report: Report) {
  const queryClient = useQueryClient();
  const [content, setContent] = useState<Content>(() => toContent(report));
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle', savedAt: null });
  const current = useRef(content);
  const pending = useRef<Content | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const running = useRef<Promise<void>>(Promise.resolve());

  /**
   * Sends pending changes. A failed save keeps the changes pending (the next change or flush retries them)
   * and rejects, so submitting stops instead of submitting an outdated report.
   */
  const flush = useCallback((): Promise<void> => {
    clearTimeout(timer.current);
    const run = running.current.then(async () => {
      const body = pending.current;
      if (!body) return;
      pending.current = null;
      setSaveState((s) => ({ ...s, status: 'saving' }));
      try {
        // The version of the last saved state: if someone else saved in between, the server refuses (conflict.stale).
        const version = queryClient.getQueryData<Report>(keys.report(report.id))?.version ?? report.version;
        const saved = await send<Report>('PUT', `incidents/reports/${report.id}`, { ...body, version });
        queryClient.setQueryData(keys.report(report.id), saved);
        setSaveState({ status: pending.current ? 'pending' : 'saved', savedAt: new Date() });
      } catch (error) {
        pending.current ??= body;
        setSaveState((s) => ({ ...s, status: 'failed' }));
        throw error;
      }
    });
    running.current = run.catch(() => undefined);
    return run;
  }, [queryClient, report.id, report.version]);

  const update = useCallback(
    (change: (content: Content) => Content) => {
      const next = change(current.current);
      current.current = next;
      pending.current = next;
      setContent(next);
      setSaveState((s) => ({ ...s, status: 'pending' }));
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush().catch(notifyError), DEBOUNCE_MS);
    },
    [flush],
  );

  /** Replaces the local content, e.g. after restoring a version. */
  const reset = useCallback((next: Report) => {
    clearTimeout(timer.current);
    pending.current = null;
    current.current = toContent(next);
    setContent(current.current);
  }, []);

  // Unsaved changes are sent when leaving the page.
  useEffect(() => () => void flush().catch(notifyError), [flush]);

  return { content, update, flush, reset, saveState };
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
