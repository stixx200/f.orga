import type { LocalizedText } from '@forga/core-contracts';
import type { RecordKind, SessionCategory, SessionCompensation } from './session.js';

/**
 * Own forces injured in closed training sessions of a year (annual statistics F26).
 * Inject optionally: `@Optional() @Inject(TRAINING_CASUALTIES) casualties?: TrainingCasualties`.
 */
export const TRAINING_CASUALTIES = 'training.Casualties';

export interface TrainingCasualties {
  injured(year: number): Promise<{ personId: string; sessionId: string; departmentIds: string[] }[]>;
}

/**
 * Departments and status of sessions, e.g. to check access to data other modules keep per session.
 * Inject optionally: `@Optional() @Inject(TRAINING_SESSIONS) sessions?: TrainingSessions`.
 */
export const TRAINING_SESSIONS = 'training.Sessions';

export interface SessionReference {
  sessionId: string;
  departmentIds: string[];
  status: 'planned' | 'held' | 'closed';
}

/** A session as the person may see it on a personal access link: title, time and attendance, no excuse note. */
export interface PersonalSession {
  startsAt: string;
  title: string;
  status: 'present' | 'excused' | 'absent';
}

/** One of the next sessions of the person's departments. */
export interface PersonalUpcoming {
  startsAt: string;
  endsAt: string;
  title: string;
  typeName: LocalizedText;
}

export interface TrainingSessions {
  /** The given sessions; unknown IDs are omitted. */
  sessions(sessionIds: readonly string[]): Promise<SessionReference[]>;
  /** Newest sessions the person is recorded on, at most 15. */
  recentForPerson(personId: string): Promise<PersonalSession[]>;
  /** The next sessions of these departments that have not ended, at most 10, soonest first. */
  upcomingForDepartments(departmentIds: readonly string[]): Promise<PersonalUpcoming[]>;
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
  category: SessionCategory;
  compensation: SessionCompensation;
  attendances: { personId: string; from: string; to: string; minutes: number; breathingApparatus: boolean; injured: boolean }[];
  records: { personId: string; kind: RecordKind; date: string; kilojoules: number | null; passed: boolean | null }[];
}
