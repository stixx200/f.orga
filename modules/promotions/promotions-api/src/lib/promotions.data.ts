import { Inject, Injectable } from '@nestjs/common';
import { EntityManager, wrap } from '@mikro-orm/core';
import { type DescribeContext, HistoryEntry, type PersonDataSection } from '@forga/core-api';
import { ORGANIZATION, type Organization } from '@forga/masterdata-contracts';
import type { ListStatus } from '@forga/promotions-contracts';
import { ExclusionEntity, PromotionListEntity } from './promotions.entities.js';

/** Name of anonymised persons in stored list entries; reads the same in every language. */
const ANONYMIZED_NAME = 'N.';

/** Data access request and anonymisation for the promotions: exclusions (with reasons) and list entries of a person. */
@Injectable()
export class PromotionsData {
  constructor(
    private readonly em: EntityManager,
    @Inject(ORGANIZATION) private readonly organization: Organization,
  ) {}

  /**
   * Access report: exclusions with their reasons (internal assessments of the person) and the person's entries in
   * promotion lists with decision and comment. Other persons on the lists are not mentioned.
   */
  async describePerson(personId: string, ctx: DescribeContext): Promise<PersonDataSection[]> {
    const em = this.em.fork();
    const exclusions = await em.find(ExclusionEntity, { personId }, { orderBy: { from: 'desc' } });
    const lists = (await em.find(PromotionListEntity, {}, { orderBy: { referenceDate: 'desc' } })).filter((l) => l.entries.some((e) => e.personId === personId));
    if (!exclusions.length && !lists.length) return [];
    const ranks = new Map((await this.organization.catalog('rank')).map((r) => [r.key, ctx.text(r.name)]));
    const rank = (key: string | null | undefined) => (key ? (ranks.get(key) ?? ctx.t('Dienstgrad (nicht mehr im Katalog)', 'rank (no longer in the catalog)')) : '–');
    const statuses = { draft: ctx.t('in Vorbereitung', 'draft'), decided: ctx.t('beschlossen', 'decided'), executed: ctx.t('vollzogen', 'executed') };
    const decisions = { promote: ctx.t('befördern', 'promote'), defer: ctx.t('zurückstellen', 'defer'), reject: ctx.t('nicht befördern', 'do not promote') };
    const states = {
      fulfilled: ctx.t('Voraussetzungen erfüllt', 'conditions met'),
      preview: ctx.t('Voraussetzungen bald erfüllt', 'conditions met soon'),
      missing: ctx.t('Voraussetzungen fehlen', 'conditions missing'),
      excluded: ctx.t('ausgeschlossen', 'excluded'),
      manual: ctx.t('außerhalb der Regeln aufgenommen', 'added outside the rules'),
    };
    const blocks: PersonDataSection['blocks'] = [];
    if (exclusions.length) {
      blocks.push({
        kind: 'table',
        title: ctx.t('Ausschlüsse von Beförderungen', 'Exclusions from promotions'),
        columns: [ctx.t('Von', 'From'), ctx.t('Bis', 'Until'), ctx.t('Gilt für', 'Applies to'), ctx.t('Grund', 'Reason')],
        rows: exclusions.map((e) => [ctx.date(e.from), e.until ? ctx.date(e.until) : ctx.t('bis zur Aufhebung', 'until lifted'), e.targetRank ? rank(e.targetRank) : ctx.t('alle Beförderungen', 'all promotions'), ctx.value(e.reason)]),
      });
    }
    if (lists.length) {
      blocks.push({
        kind: 'table',
        title: ctx.t('Einträge in Beförderungslisten', 'Entries in promotion lists'),
        columns: [ctx.t('Liste', 'List'), ctx.t('Stichtag', 'Reference date'), ctx.t('Stand der Liste', 'List status'), ctx.t('Dienstgrad', 'Rank'), ctx.t('Beförderung zum', 'Promotion to'), ctx.t('Entscheidung', 'Decision'), ctx.t('Bemerkung', 'Comment')],
        rows: lists.flatMap((l) =>
          l.entries
            .filter((e) => e.personId === personId)
            .map((e) => [l.title, ctx.date(l.referenceDate), statuses[l.status as ListStatus], rank(e.rank), rank(e.targetRank), `${decisions[e.decision]} (${states[e.state]})`, ctx.value(e.comment)]),
        ),
      });
    }
    return [
      {
        key: 'promotions',
        title: ctx.t('Beförderungen', 'Promotions'),
        activity: 'promotions.promotions',
        categories: [ctx.t('Beförderungen und Ausschlüsse mit Gründen', 'Promotions and exclusions with reasons')],
        blocks,
        // Only the exclusions are records of the person; a list holds the entries of many persons.
        records: [{ entity: 'promotions.exclusion', ids: exclusions.map((e) => e.id), label: ctx.t('Ausschluss', 'Exclusion') }],
      },
    ];
  }

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
