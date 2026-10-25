import { Injectable } from '@nestjs/common';
import { EntityManager, wrap } from '@mikro-orm/core';
import { HistoryEntry } from '@forga/core-api';
import { ExclusionEntity, PromotionListEntity } from './promotions.entities.js';

/** Name of anonymised persons in stored list entries; reads the same in every language. */
const ANONYMIZED_NAME = 'N.';

/** Data access request and anonymisation for the promotions: exclusions (with reasons) and list entries of a person. */
@Injectable()
export class PromotionsData {
  constructor(private readonly em: EntityManager) {}

  async exportPerson(personId: string): Promise<Record<string, unknown>> {
    const em = this.em.fork();
    const exclusions = await em.find(ExclusionEntity, { personId }, { orderBy: { from: 'asc' } });
    const lists = (await em.find(PromotionListEntity, {}, { orderBy: { referenceDate: 'asc' } })).filter((l) => l.entries.some((e) => e.personId === personId));
    return {
      exclusions: exclusions.map((e) => wrap(e).toObject()),
      listEntries: lists.flatMap((l) =>
        l.entries
          .filter((e) => e.personId === personId)
          .map((entry) => ({ listId: l.id, title: l.title, referenceDate: l.referenceDate, effectiveDate: l.effectiveDate, status: l.status, entry })),
      ),
    };
  }

  /** Reasons of exclusions and comments on list entries are free text about the person: they are emptied, names replaced. */
  async anonymize(personIds: readonly string[]): Promise<void> {
    const em = this.em.fork();
    const ids = new Set(personIds);
    const exclusions = await em.find(ExclusionEntity, { personId: { $in: [...ids] } });
    for (const exclusion of exclusions) exclusion.reason = '';
    for (const list of await em.find(PromotionListEntity, {})) {
      if (!list.entries.some((e) => ids.has(e.personId))) continue;
      list.entries = list.entries.map((e) => (ids.has(e.personId) ? { ...e, firstName: ANONYMIZED_NAME, lastName: ANONYMIZED_NAME, comment: '' } : e));
    }
    await em.flush();
    // The history of the exclusions keeps the former reasons.
    if (exclusions.length) await em.nativeDelete(HistoryEntry, { entity: 'promotions.exclusion', entityId: { $in: exclusions.map((e) => e.id) } });
  }
}
