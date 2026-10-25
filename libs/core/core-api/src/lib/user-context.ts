import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';

interface Context {
  userId: string | null;
  /** Set while an administrator acts as another user (impersonation). */
  impersonatorId: string | null;
}

const storage = new AsyncLocalStorage<Context>();

/** Holds the authenticated user for the duration of a request, e.g. for the history. */
export const UserContext = {
  run<T>(userId: string | null, callback: () => T): T {
    return storage.run({ userId, impersonatorId: null }, callback);
  },
  /** Sets the user in the running context (called by the auth guard). */
  set(userId: string | null, impersonatorId: string | null = null): void {
    const context = storage.getStore();
    if (!context) return;
    context.userId = userId;
    context.impersonatorId = impersonatorId;
  },
  userId(): string | null {
    return storage.getStore()?.userId ?? null;
  },
  impersonatorId(): string | null {
    return storage.getStore()?.impersonatorId ?? null;
  },
};

/** Opens a fresh context for every request so the guard can fill it later. */
export function userContextMiddleware(_req: Request, _res: Response, next: NextFunction): void {
  UserContext.run(null, next);
}
