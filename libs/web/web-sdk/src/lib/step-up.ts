/**
 * Step-up: sensitive data and the administration need a session confirmed with the second factor. The API client asks
 * the shell (which shows the dialog) when the server answers `403 auth.stepUpRequired` and repeats the request after
 * the confirmation.
 */

/** Shows the dialog; resolves `true` once the session is confirmed, `false` if the user cancels. */
export type StepUpHandler = (request: { enrolled: boolean }) => Promise<boolean>;

interface StepUpState {
  handler: StepUpHandler | null;
  pending: Promise<boolean> | null;
}

// On `globalThis` like the i18n instance: a module frontend may evaluate its own copy of this package.
const shared = globalThis as typeof globalThis & { forgaStepUp?: StepUpState };
const state = (shared.forgaStepUp ??= { handler: null, pending: null });

/** Called by the shell with the function that shows the step-up dialog. */
export function registerStepUpHandler(handler: StepUpHandler | null): void {
  state.handler = handler;
}

/**
 * Asks for the second factor (one dialog for all requests waiting at the same time). Resolves `true` once the session
 * is confirmed. Without a registered handler (e.g. outside the shell) `false`.
 *
 * After a successful confirmation the coalescing promise stays open briefly so late `403` responses from requests that
 * were already in flight share the same result instead of opening a second dialog.
 */
export function requestStepUp(request: { enrolled: boolean } = { enrolled: true }): Promise<boolean> {
  if (!state.handler) return Promise.resolve(false);
  if (state.pending) return state.pending;
  state.pending = (async () => {
    const ok = await state.handler!(request);
    if (ok) await new Promise<void>((resolve) => window.setTimeout(resolve, 1200));
    return ok;
  })().finally(() => {
    state.pending = null;
  });
  return state.pending;
}

/** Paths whose `auth.stepUpRequired` is not intercepted: the step-up itself and setting up the factor. */
export const isStepUpPath = (path: string) => /^\/?(api\/)?core\/(step-up|mfa)(\/|$|\?)/.test(path);
