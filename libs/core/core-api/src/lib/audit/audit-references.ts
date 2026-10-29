import { Injectable, Logger } from '@nestjs/common';
import type { AuditReference } from '@forga/core-contracts';
import type { AuthenticatedUser } from '../security/authenticated-user.js';

/** What a resolver knows about a record: its label, and the route if the viewer may open it. */
export type AuditReferenceTarget = Omit<AuditReference, 'kind'>;

/**
 * Resolves IDs of one kind in one call for all entries of a page. IDs missing from the result count as deleted.
 * `user` is the viewer; a resolver sets `to` only if the viewer may open the record.
 */
export type AuditReferenceResolver = (ids: readonly string[], user: AuthenticatedUser) => Promise<ReadonlyMap<string, AuditReferenceTarget>>;

export interface AuditReferenceKind {
  /** Detail keys holding IDs of this kind, also inside arrays and nested objects (e.g. `personId`). */
  keys: readonly string[];
  /**
   * Only for these actions (exact, or a prefix ending in `.`). A kind limited to actions wins over a general one with
   * the same key, e.g. `listId` of `promotions.` against `listId` of `lists.`.
   */
  actions?: readonly string[];
  /** Values are UUIDs (default); other values of the keys are left as they are. */
  uuid?: boolean;
  resolve: AuditReferenceResolver;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const matchesAction = (patterns: readonly string[], action: string) => patterns.some((p) => (p.endsWith('.') ? action.startsWith(p) : action === p));

/**
 * Core and modules register how IDs in the details of audit entries are shown: the audit log displays
 * „Nachname, Vorname“ instead of a person ID. Each module resolves the kinds it owns.
 */
@Injectable()
export class AuditReferenceRegistry {
  private readonly logger = new Logger(AuditReferenceRegistry.name);
  private readonly kinds = new Map<string, AuditReferenceKind>();

  /** `kind` is unique, e.g. `masterdata.person`. */
  register(kind: string, definition: AuditReferenceKind): void {
    if (this.kinds.has(kind)) throw new Error(`Audit reference "${kind}" is already registered.`);
    this.kinds.set(kind, definition);
  }

  /** The kind of a detail key in an entry with `action`, or `undefined`. */
  private kindOf(key: string, action: string): { kind: string; definition: AuditReferenceKind } | undefined {
    let general: { kind: string; definition: AuditReferenceKind } | undefined;
    for (const [kind, definition] of this.kinds) {
      if (!definition.keys.includes(key)) continue;
      if (!definition.actions) general ??= { kind, definition };
      else if (matchesAction(definition.actions, action)) return { kind, definition };
    }
    return general;
  }

  /**
   * References of all entries, keyed by ID per entry. One resolver call per kind for all entries together;
   * a failing resolver leaves its IDs unresolved.
   */
  async resolve(entries: readonly { action: string; details: Record<string, unknown> }[], user: AuthenticatedUser): Promise<Record<string, AuditReference>[]> {
    const found = entries.map(() => new Map<string, string>());
    const idsByKind = new Map<string, Set<string>>();
    const visit = (value: unknown, key: string | null, action: string, into: Map<string, string>): void => {
      if (Array.isArray(value)) for (const item of value) visit(item, key, action, into);
      else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) visit(v, k, action, into);
      else if (typeof value === 'string' && value && key) add(this.kindOf(key, action), value, into);
    };
    const add = (match: { kind: string; definition: AuditReferenceKind } | undefined, id: string, into: Map<string, string>): void => {
      if (!match || ((match.definition.uuid ?? true) && !UUID.test(id))) return;
      into.set(id, match.kind);
      idsByKind.set(match.kind, (idsByKind.get(match.kind) ?? new Set()).add(id));
    };
    entries.forEach(({ action, details }, index) => {
      visit(details ?? {}, null, action, found[index]);
      // Attachments name their owner by kind (`ownerType`, e.g. `training.session`) and ID.
      const { ownerType, ownerId } = details ?? {};
      if (typeof ownerType === 'string' && typeof ownerId === 'string' && this.kinds.has(ownerType)) {
        add({ kind: ownerType, definition: this.kinds.get(ownerType)! }, ownerId, found[index]);
      }
    });

    const resolved = new Map<string, ReadonlyMap<string, AuditReferenceTarget> | null>();
    await Promise.all(
      [...idsByKind].map(async ([kind, ids]) => {
        try {
          resolved.set(kind, await this.kinds.get(kind)!.resolve([...ids], user));
        } catch (error) {
          this.logger.warn(`Audit reference "${kind}" failed: ${error instanceof Error ? error.message : String(error)}`);
          resolved.set(kind, null);
        }
      }),
    );
    return found.map((ids) => {
      const references: Record<string, AuditReference> = {};
      for (const [id, kind] of ids) {
        const targets = resolved.get(kind);
        if (!targets) continue;
        references[id] = { kind, ...(targets.get(id) ?? { label: null }) };
      }
      return references;
    });
  }
}
