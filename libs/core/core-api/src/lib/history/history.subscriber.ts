import {
  ChangeSetType,
  type ChangeSet,
  type EntityMetadata,
  type EventSubscriber,
  type FlushEventArgs,
} from '@mikro-orm/core';
import { type FieldChange, type HistoryAction, SECRET_SETTING_FIELDS } from '@forga/core-contracts';
import { UserContext } from '../user-context.js';
import { HistoryEntry } from './history.entity.js';

/** Technical fields that never appear in the history. Hidden properties (secrets) are skipped as well. */
const IGNORED = new Set(['version', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy']);

const ACTIONS: Partial<Record<ChangeSetType, HistoryAction>> = {
  [ChangeSetType.CREATE]: 'created',
  [ChangeSetType.UPDATE]: 'updated',
  [ChangeSetType.DELETE]: 'deleted',
};

export function historyName(meta: EntityMetadata): string {
  return meta.schema ? `${meta.schema}.${meta.tableName}` : meta.tableName;
}

/** Write-only fields of settings (e.g. the SMTP password) never reach the history. */
function withoutSecrets(meta: EntityMetadata, entity: object, field: string, value: unknown): unknown {
  if (meta.className !== 'Setting' || field !== 'value' || !value) return value;
  const secrets = SECRET_SETTING_FIELDS[(entity as { section?: string }).section ?? ''] ?? [];
  if (!secrets.length) return value;
  // JSON properties may arrive serialized in the change set payload.
  const object = (typeof value === 'string' ? JSON.parse(value) : value) as Record<string, unknown>;
  return Object.fromEntries(Object.entries(object).map(([key, v]) => [key, secrets.includes(key) && v ? '••••••' : v]));
}

function displayValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  return value ?? null;
}

/**
 * Writes an entry to `core.history` for every change of a historized entity,
 * in the same transaction as the change itself.
 */
export class HistorySubscriber implements EventSubscriber {
  /** Class name → name of the parent relation (or `null`). */
  constructor(private readonly historized: ReadonlyMap<string, string | null>) {}

  async onFlush({ em, uow }: FlushEventArgs): Promise<void> {
    const timestamp = new Date();
    const userId = UserContext.userId();
    const impersonatorId = UserContext.impersonatorId();

    for (const changeSet of uow.getChangeSets() as ChangeSet<object>[]) {
      const action = ACTIONS[changeSet.type];
      if (!action || !this.historized.has(changeSet.meta.className)) continue;
      const parent = this.parent(changeSet, this.historized.get(changeSet.meta.className) ?? null);

      const changes = this.changes(changeSet);
      if (action === 'updated' && Object.keys(changes).length === 0) continue;

      const entry = em.create(HistoryEntry, {
        entity: historyName(changeSet.meta),
        entityId: String(changeSet.getSerializedPrimaryKey()),
        parentEntity: parent?.entity ?? null,
        parentId: parent?.id ?? null,
        action,
        changes,
        userId,
        impersonatorId,
        timestamp,
      });
      uow.computeChangeSet(entry);
    }
  }

  private parent(changeSet: ChangeSet<object>, property: string | null): { entity: string; id: string } | null {
    if (!property) return null;
    const reference = (changeSet.entity as Record<string, unknown>)[property] as { id?: unknown } | null | undefined;
    const target = (changeSet.meta.properties[property as never] as { targetMeta?: EntityMetadata } | undefined)
      ?.targetMeta;
    if (!reference?.id || !target) return null;
    return { entity: historyName(target), id: String(reference.id) };
  }

  private changes(changeSet: ChangeSet<object>): Record<string, FieldChange> {
    if (changeSet.type === ChangeSetType.DELETE) return {};
    const original = (changeSet.originalEntity ?? {}) as Record<string, unknown>;
    const payload = changeSet.payload as Record<string, unknown>;
    const result: Record<string, FieldChange> = {};
    for (const [field, value] of Object.entries(payload)) {
      const property = changeSet.meta.properties[field as never] as { hidden?: boolean } | undefined;
      if (IGNORED.has(field) || property?.hidden || changeSet.meta.primaryKeys.includes(field as never)) continue;
      const old = changeSet.type === ChangeSetType.CREATE ? null : displayValue(withoutSecrets(changeSet.meta, changeSet.entity, field, original[field]));
      result[field] = { old, new: displayValue(withoutSecrets(changeSet.meta, changeSet.entity, field, value)) };
    }
    return result;
  }
}
