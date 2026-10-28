import { createContext, useContext } from 'react';
import type { KioskDepartment, KioskTerminal } from '@forga/info-terminal-contracts';

/** What the terminal shows; the kiosk navigates with state, not with the router of the shell. */
export type Screen =
  | { kind: 'overview' }
  | { kind: 'report'; reportId: string }
  | { kind: 'new-incident' }
  | { kind: 'session'; sessionId: string };

export interface KioskContextValue {
  terminal: KioskTerminal;
  department: KioskDepartment;
  go: (screen: Screen) => void;
  /** Back to the overview of the station's department (after idling or a confirmation). */
  reset: () => void;
  /** Server time (the clock of the device may be wrong). */
  now: () => Date;
  /** The device is not enabled any more (e.g. revoked while in use). */
  blocked: (code: string) => void;
}

export const KioskContext = createContext<KioskContextValue | null>(null);

export function useKiosk(): KioskContextValue {
  const value = useContext(KioskContext);
  if (!value) throw new Error('useKiosk outside of the kiosk');
  return value;
}
