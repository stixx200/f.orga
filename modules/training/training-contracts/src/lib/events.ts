import type { RecordKind } from './session.js';

/**
 * Own forces injured in closed training sessions of a year (annual statistics F26).
 * Inject optionally: `@Optional() @Inject(TRAINING_CASUALTIES) casualties?: TrainingCasualties`.
 */
export const TRAINING_CASUALTIES = 'training.Casualties';

export interface TrainingCasualties {
  injured(year: number): Promise<{ personId: string; sessionId: string; departmentIds: string[] }[]>;
}

export const TRAINING_EVENTS = {
  sessionClosed: 'training.session.closed',
  /** A closed session was reopened: receivers withdraw what they derived from it until it is closed again. */
  sessionReopened: 'training.session.reopened',
} as const;

export interface SessionReopenedEvent {
  sessionId: string;
}

/** Published when a session is closed; respiratory protection takes the records, compensation the hours. */
export interface SessionClosedEvent {
  sessionId: string;
  type: string;
  title: string;
  startsAt: string;
  endsAt: string;
  departmentIds: string[];
  compensation: 'training' | 'fire-watch' | 'none';
  attendances: { personId: string; from: string; to: string; minutes: number; breathingApparatus: boolean; injured: boolean }[];
  records: { personId: string; kind: RecordKind; date: string; kilojoules: number | null; passed: boolean | null }[];
}
