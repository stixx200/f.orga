import { type EntityClass, EntityManager, type FilterQuery, p } from '@mikro-orm/core';
import { v7 as uuidv7 } from 'uuid';
import type { ImportMappingTargetState, RememberedMapping } from '@forga/core-contracts';
import type { AuthenticatedUser } from '../security/authenticated-user.js';
import { searchWords } from '../data/search-words.js';
import type { ImportRegistry, MappingTarget, RememberedValues, UsedMapping } from './import-registry.js';
import { normalizeHeading } from './parse.js';

/**
 * Columns of a list of remembered mappings (`core.import_mapping` of the table import, `mp_feuer.mapping` of the
 * module MP-Feuer); unique per kind and normalized value.
 */
export const mappingProperties = () => ({
  id: p.uuid().primary().onCreate(() => uuidv7()),
  /** Lookup kind, e.g. `qualification`. */
  kind: p.string(),
  /** The value as in the first import. */
  value: p.string(),
  /** `normalizeHeading(value)`: what the imports compare. */
  normalized: p.string(),
  /** Key of the target entry or extra (e.g. `incidents:ignore`). */
  key: p.string(),
  /** Import profile of the first apply. */
  profile: p.string(),
  /** Display name of the user who chose the mapping. */
  createdBy: p.string().nullable(),
  createdAt: p.datetime(),
  /** Updated without history at every apply that used the mapping. */
  lastUsedAt: p.datetime(),
});

export interface MappingRecord {
  id: string;
  kind: string;
  value: string;
  normalized: string;
  key: string;
  profile: string;
  createdBy?: string | null;
  createdAt: Date;
  lastUsedAt: Date;
}

export interface MappingFilter {
  kind?: string;
  /** Words in the value or the name of the target. */
  q?: string;
  /** Only mappings whose target is inactive or deleted. */
  problems?: boolean;
}

/**
 * A list of remembered mappings: read before a run (`remembered`, only active targets), extended after an apply
 * (`remember`), listed with the state of the targets and deleted by the user.
 */
export class MappingStore {
  constructor(
    private readonly em: EntityManager,
    private readonly entity: EntityClass<MappingRecord>,
    private readonly registry: ImportRegistry,
  ) {}

  /** Mappings whose target may still be applied, for `ImportRunInput.remembered`. */
  async remembered(): Promise<RememberedValues> {
    const records = await this.em.fork().find(this.entity, {});
    const targets = await this.targets(records);
    const result = new Map<string, Map<string, string>>();
    for (const r of records) {
      if (targets.get(r.kind)?.get(r.key)?.state !== 'active') continue;
      const values = result.get(r.kind) ?? new Map<string, string>();
      values.set(r.normalized, r.key);
      result.set(r.kind, values);
    }
    return result;
  }

  /**
   * Keeps the mappings of an apply: a chosen mapping replaces an older one of the same value; a remembered one only
   * gets its last use.
   */
  async remember(used: readonly UsedMapping[], profile: string, user: AuthenticatedUser | null): Promise<void> {
    if (!used.length) return;
    const em = this.em.fork();
    const now = new Date();
    const records = await em.find(this.entity, { kind: { $in: [...new Set(used.map((u) => u.kind))] } } as FilterQuery<MappingRecord>);
    const byValue = new Map(records.map((r) => [`${r.kind}|${r.normalized}`, r]));
    const touched: string[] = [];
    for (const mapping of used) {
      const normalized = normalizeHeading(mapping.value);
      if (!normalized) continue;
      const existing = byValue.get(`${mapping.kind}|${normalized}`);
      if (existing && existing.key === mapping.key) {
        touched.push(existing.id);
        continue;
      }
      if (existing) {
        em.assign(existing, { key: mapping.key, value: mapping.value, profile, createdBy: user?.displayName ?? null, createdAt: now, lastUsedAt: now } as never);
        continue;
      }
      const created = em.create(this.entity, {
        kind: mapping.kind,
        value: mapping.value,
        normalized,
        key: mapping.key,
        profile,
        createdBy: user?.displayName ?? null,
        createdAt: now,
        lastUsedAt: now,
      } as never);
      byValue.set(`${mapping.kind}|${normalized}`, created);
    }
    await em.flush();
    if (touched.length) await em.nativeUpdate(this.entity, { id: { $in: touched } } as FilterQuery<MappingRecord>, { lastUsedAt: now } as never);
  }

  async list(filter: MappingFilter = {}): Promise<RememberedMapping[]> {
    const where: Record<string, unknown> = filter.kind ? { kind: filter.kind } : {};
    const records = await this.em.fork().find(this.entity, where as FilterQuery<MappingRecord>, { orderBy: { kind: 'asc', normalized: 'asc' } as never });
    const targets = await this.targets(records);
    const words = searchWords(filter.q ?? '').map((w) => w.toLowerCase());
    return records
      .map((r): RememberedMapping => {
        const target = targets.get(r.kind)?.get(r.key) ?? { name: null, state: 'deleted' as ImportMappingTargetState };
        return {
          id: r.id,
          kind: r.kind,
          kindName: this.registry.lookup(r.kind)?.name ?? null,
          value: r.value,
          key: r.key,
          targetName: target.name,
          targetState: target.state,
          profile: r.profile,
          profileName: this.registry.get(r.profile)?.name ?? null,
          createdBy: r.createdBy ?? null,
          createdAt: r.createdAt.toISOString(),
          lastUsedAt: r.lastUsedAt.toISOString(),
        };
      })
      .filter((m) => !filter.problems || m.targetState !== 'active')
      .filter((m) => words.every((w) => [m.value, m.key, m.targetName?.de, m.targetName?.en].some((t) => t?.toLowerCase().includes(w))));
  }

  /** Deletes one mapping; returns it, or `null` if there is none with the ID. */
  async remove(id: string): Promise<MappingRecord | null> {
    const em = this.em.fork();
    const record = await em.findOne(this.entity, { id } as FilterQuery<MappingRecord>);
    if (!record) return null;
    em.remove(record);
    await em.flush();
    return record;
  }

  /** The targets of the records by kind and key. */
  private async targets(records: readonly MappingRecord[]): Promise<Map<string, Map<string, MappingTarget>>> {
    const byKind = new Map<string, Set<string>>();
    for (const r of records) byKind.set(r.kind, (byKind.get(r.kind) ?? new Set()).add(r.key));
    const result = new Map<string, Map<string, MappingTarget>>();
    for (const [kind, keys] of byKind) result.set(kind, await this.registry.describeTargets(kind, [...keys]));
    return result;
  }
}
