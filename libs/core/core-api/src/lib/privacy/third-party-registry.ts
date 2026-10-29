import { BadRequestException, Injectable } from '@nestjs/common';
import type { Language, ThirdPartyErasureOutcome, ThirdPartyHit, ThirdPartyRef } from '@forga/core-contracts';
import type { DescribeContext, PersonDataSection } from '../access-report/person-description.js';

/** Hits per source at most; a search is narrowed by more letters. */
const MAX_HITS = 100;

/**
 * Where a module stores data of third parties (L14), e.g. persons involved in an incident or debtors of cost notices.
 * IDs are the module's own (e.g. of a party of a report); the core only passes them back.
 */
export interface ThirdPartySource {
  /** `<module>.<name>`, e.g. `incidents.involved-parties`. */
  key: string;
  module: string;
  /** Places whose name, address or licence plate contain the text (case-insensitive), newest first. */
  search(query: string, language: Language): Promise<Omit<ThirdPartyHit, 'source'>[]>;
  /**
   * Readable description of the chosen places for the access report, like `describePerson`: no IDs, no other persons
   * (members of the brigade are named by function).
   */
  describe(ids: readonly string[], ctx: DescribeContext): Promise<PersonDataSection[]>;
  /** Removes the data of the third party at the places, as far as nothing requires to keep it. */
  erase(ids: readonly string[]): Promise<Map<string, { outcome: ThirdPartyErasureOutcome; code: string | null }>>;
}

/** The sources of third-party data of the active modules. */
@Injectable()
export class ThirdPartyRegistry {
  readonly sources = new Map<string, ThirdPartySource>();

  register(source: ThirdPartySource): void {
    if (!source.key.startsWith(`${source.module}.`)) throw new Error(`Third-party source "${source.key}" must start with "${source.module}.".`);
    this.sources.set(source.key, source);
  }

  async search(query: string, language: Language): Promise<ThirdPartyHit[]> {
    const q = query.trim().slice(0, 100);
    if (q.length < 2) return [];
    const hits: ThirdPartyHit[] = [];
    for (const source of this.sources.values()) hits.push(...(await source.search(q, language)).slice(0, MAX_HITS).map((h) => ({ ...h, source: source.key })));
    return hits.toSorted((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  }

  /** The refs grouped by source; unknown sources `400 privacy.thirdPartySourceUnknown`. */
  bySource(refs: readonly ThirdPartyRef[]): Map<ThirdPartySource, string[]> {
    const groups = new Map<ThirdPartySource, string[]>();
    for (const ref of refs) {
      const source = this.sources.get(ref.source);
      if (!source) throw new BadRequestException({ code: 'privacy.thirdPartySourceUnknown' });
      groups.set(source, [...new Set([...(groups.get(source) ?? []), ref.id])]);
    }
    return groups;
  }

  async describe(refs: readonly ThirdPartyRef[], ctx: DescribeContext): Promise<PersonDataSection[]> {
    const sections: PersonDataSection[] = [];
    for (const [source, ids] of this.bySource(refs)) sections.push(...(await source.describe(ids, ctx)).filter((s) => s.blocks.length > 0));
    return sections;
  }
}
