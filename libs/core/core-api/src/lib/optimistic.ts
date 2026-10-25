import { ConflictException } from '@nestjs/common';

/**
 * Optimistic locking for edits from the UI: the client sends the version it loaded; if the record changed
 * in between (another user saved), the edit is refused with `conflict.stale` instead of overwriting it.
 * Without a version (imports, API, older clients) the check is skipped.
 */
export function assertVersion(entity: { version: number }, expected: number | undefined | null): void {
  if (expected !== undefined && expected !== null && expected !== entity.version) {
    throw new ConflictException({ code: 'conflict.stale', current: entity.version, expected });
  }
}
