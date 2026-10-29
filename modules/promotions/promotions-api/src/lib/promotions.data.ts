import { Inject, Injectable } from '@nestjs/common';
import { EntityManager, wrap } from '@mikro-orm/core';
import { type DescribeContext, type ErasureArea, type ErasureAreaInput, HistoryEntry, type PersonDataSection } from '@forga/core-api';
import { ORGANIZATION, type Organization } from '@forga/masterdata-contracts';
import type { ListEntry, ListStatus } from '@forga/promotions-contracts';
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
    const exclusions = await em.find(ExclusionEntity, { personId: { $in: [...personIds] } });
    for (const exclusion of exclusions) exclusion.reason = '';
    await em.flush();
    // The history of the exclusions keeps the former reasons.
    if (exclusions.length) await em.nativeDelete(HistoryEntry, { entity: 'promotions.exclusion', entityId: { $in: exclusions.map((e) => e.id) } });
    await this.anonymizeEntries(personIds);
  }

  /**
   * Names and comments of the persons in promotion lists become "N." and empty, also in the history of the lists (it
   * keeps the entries as JSON); the entries of other persons stay.
   */
  private async anonymizeEntries(personIds: readonly string[]): Promise<void> {
    const em = this.em.fork();
    const ids = new Set(personIds);
    const anonymized = (e: ListEntry): ListEntry => (ids.has(e.personId) ? { ...e, firstName: ANONYMIZED_NAME, lastName: ANONYMIZED_NAME, comment: '' } : e);
    const changed: string[] = [];
    for (const list of await em.find(PromotionListEntity, {})) {
      if (!list.entries.some((e) => ids.has(e.personId))) continue;
      list.entries = list.entries.map(anonymized);
      changed.push(list.id);
    }
    await em.flush();
    if (!changed.length) return;
    const redact = (value: unknown): unknown => {
      const parsed = typeof value === 'string' && value.startsWith('[') ? (JSON.parse(value) as unknown) : value;
      if (!Array.isArray(parsed)) return value;
      const entries = (parsed as ListEntry[]).map((e) => (e && typeof e === 'object' ? anonymized(e) : e));
      return typeof value === 'string' ? JSON.stringify(entries) : entries;
    };
    for (const entry of await em.find(HistoryEntry, { entity: 'promotions.promotion_list', entityId: { $in: changed } })) {
      const entries = entry.changes['entries'];
      if (entries) entry.changes = { ...entry.changes, entries: { old: redact(entries.old), new: redact(entries.new) } as typeof entries };
    }
    await em.flush();
  }

  /** Erasure check: exclusions may be deleted; entries in promotion lists stay as record of the decision, anonymised. */
  async erasure(personId: string): Promise<ErasureAreaInput[]> {
    const em = this.em.fork();
    const areas: ErasureAreaInput[] = [];
    const exclusions = await em.count(ExclusionEntity, { personId });
    if (exclusions) {
      areas.push({
        key: 'promotions.exclusions',
        title: { de: 'Beförderungen', en: 'Promotions' },
        data: { de: `${exclusions} ${exclusions === 1 ? 'Ausschluss' : 'Ausschlüsse'} mit Grund`, en: `${exclusions} ${exclusions === 1 ? 'exclusion' : 'exclusions'} with reason` },
        count: exclusions,
        outcome: 'delete',
        keepUntil: null,
        reason: null,
      });
    }
    const lists = (await em.find(PromotionListEntity, {}, { fields: ['id', 'entries'] })).filter((l) => l.entries.some((e) => e.personId === personId)).length;
    if (lists) {
      areas.push({
        key: 'promotions.lists',
        title: { de: 'Beförderungen', en: 'Promotions' },
        data: { de: `Einträge in ${lists} ${lists === 1 ? 'Beförderungsliste' : 'Beförderungslisten'}`, en: `Entries in ${lists} promotion ${lists === 1 ? 'list' : 'lists'}` },
        count: lists,
        outcome: 'anonymize',
        keepUntil: null,
        reason: { de: 'Liste bleibt mit „N.“, ohne Kommentar; Dienstgrade stehen bei den Grunddaten', en: 'List stays with "N.", without comment; ranks are part of the basic data' },
      });
    }
    return areas;
  }

  async erase(personId: string, areas: readonly ErasureArea[]): Promise<void> {
    const keys = new Set(areas.map((a) => a.key));
    if (keys.has('promotions.exclusions')) {
      const em = this.em.fork();
      const exclusions = await em.find(ExclusionEntity, { personId }, { fields: ['id'] });
      if (exclusions.length) await em.nativeDelete(HistoryEntry, { entity: 'promotions.exclusion', entityId: { $in: exclusions.map((e) => e.id) } });
      await em.nativeDelete(ExclusionEntity, { personId });
    }
    if (keys.has('promotions.lists')) await this.anonymizeEntries([personId]);
  }
}
