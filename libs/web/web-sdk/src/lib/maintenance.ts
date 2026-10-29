import { useSyncExternalStore } from 'react';
import type { LocalizedText } from '@forga/core-contracts';

interface MaintenanceState {
  /** The server answered `503 maintenance` (a backup is being restored). */
  active: boolean;
  /** A page shows the progress itself (the restore wizard) instead of the maintenance page. */
  handledByPage: boolean;
  listeners: Set<() => void>;
}

// On `globalThis` like the i18n instance: a module frontend may evaluate its own copy of this package.
const shared = globalThis as typeof globalThis & { forgaMaintenance?: MaintenanceState };
const state = (shared.forgaMaintenance ??= { active: false, handledByPage: false, listeners: new Set() });

const emit = () => state.listeners.forEach((listener) => listener());

/** Called by the API client when the server answers `503 maintenance`. */
export function reportMaintenance(): void {
  if (state.active) return;
  state.active = true;
  emit();
}

/** While set, the shell keeps the current page (e.g. the restore wizard showing its progress). */
export function setMaintenanceHandledByPage(handled: boolean): void {
  state.handledByPage = handled;
  emit();
}

const subscribe = (listener: () => void) => {
  state.listeners.add(listener);
  return () => state.listeners.delete(listener);
};

/** Should the shell show the maintenance page? */
export function useMaintenance(): boolean {
  return useSyncExternalStore(subscribe, () => state.active && !state.handledByPage);
}

const NOTICE_KEY = 'forga.loginNotice';

/** A notice the login page shows once, e.g. „Wiederhergestellt aus der Sicherung vom …“. */
export function setLoginNotice(notice: LocalizedText): void {
  try {
    sessionStorage.setItem(NOTICE_KEY, JSON.stringify(notice));
  } catch {
    // Without storage there is no notice.
  }
}

/** Takes the notice for the login page (shown once). */
export function takeLoginNotice(): LocalizedText | null {
  try {
    const value = sessionStorage.getItem(NOTICE_KEY);
    sessionStorage.removeItem(NOTICE_KEY);
    return value ? (JSON.parse(value) as LocalizedText) : null;
  } catch {
    return null;
  }
}
