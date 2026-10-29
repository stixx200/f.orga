import { Injectable } from '@nestjs/common';
import { EntityManager, wrap } from '@mikro-orm/core';
import { type ErasureArea, type ErasureAreaInput, type ErasureContext, HistoryEntry, type RetentionCandidate, type RetentionExportRecord, type RetentionQuery, RetentionRegistry } from '@forga/core-api';
import type { ItemSource } from '@forga/compensation-contracts';
import { FunctionHolderEntity, ItemEntity, RunEntity } from '../compensation.entities.js';

/** Name of anonymised persons in payouts; reads the same in every language. */
const ANONYMIZED_NAME = 'N. N.';

/**
 * Retention of the payout runs with their items (booking records: periods of the budget law, to be agreed with the
 * treasury). Incidents and sessions with amounts of a kept run are not deleted.
 */
@Injectable()
export class CompensationRetention {
  constructor(private readonly em: EntityManager) {}

  register(registry: RetentionRegistry): void {
    registry.registerCategory({
      key: 'compensation.runs',
      module: 'compensation',
      name: { de: 'Auszahlungsläufe der Entschädigung', en: 'Compensation payout runs' },
      description: { de: 'mit Posten; haushaltsrechtliche Fristen, mit der Kämmerei abstimmen', en: 'with items; periods of the budget law, to be agreed with the treasury' },
      event: { de: 'Auszahlung', en: 'Payout' },
      actions: ['offer-archive', 'delete', 'none'],
      financial: true,
      candidates: (query) => this.candidates(query),
      export: (ids) => this.export(ids),
      execute: (ids) => this.delete(ids),
    });
    const keeps = (source: ItemSource, ids: (r: { id: string; children: string[] }) => string[]) => ({
      blockedBy: async (records: readonly { id: string; children: string[] }[], action: string) => {
        const blocked = new Map<string, string>();
        if (action !== 'delete') return blocked;
        const owner = new Map(records.flatMap((r) => ids(r).map((id) => [id, r.id] as const)));
        if (!owner.size) return blocked;
        const items = await this.em.fork().find(ItemEntity, { source, sourceId: { $in: [...owner.keys()] } }, { fields: ['id', 'sourceId'] });
        for (const item of items) blocked.set(owner.get(item.sourceId!)!, 'retention.payoutKept');
        return blocked;
      },
    });
    // Items refer to the reports of an incident and to sessions.
    registry.registerDependent('incidents.incidents', 'compensation', keeps('incident', (r) => r.children));
    registry.registerDependent('training.sessions', 'compensation', keeps('training', (r) => [r.id]));
  }

  private async candidates(query: RetentionQuery): Promise<RetentionCandidate[]> {
    const runs = await this.em.fork().find(RunEntity, { paidAt: { $ne: null, $lt: query.cutoff } }, { orderBy: { number: 'asc' } });
    return runs.map((r) => ({ id: r.id, label: `${r.number} · ${r.from} – ${r.to}`, neutralLabel: r.number, eventDate: r.paidAt!.toISOString().slice(0, 10) }));
  }

  private async export(ids: readonly string[]): Promise<RetentionExportRecord[]> {
    const em = this.em.fork();
    const runs = await em.find(RunEntity, { id: { $in: [...ids] } }, { populate: ['items'] });
    return runs.map((r) => {
      const items = r.items.getItems();
      return {
        id: r.id,
        title: r.number,
        fields: [
          { label: { de: 'Lauf', en: 'Run' }, value: r.number },
          { label: { de: 'Zeitraum', en: 'Period' }, value: `${r.from} – ${r.to}` },
          { label: { de: 'Ausgezahlt', en: 'Paid out' }, value: r.paidAt?.toISOString().slice(0, 10) ?? '' },
          { label: { de: 'Posten', en: 'Items' }, value: String(items.length) },
          { label: { de: 'Summe', en: 'Total' }, value: items.reduce((sum, i) => sum + (i.amount ?? 0), 0).toFixed(2) },
        ],
        data: { run: { ...wrap(r).toObject(), items: undefined }, items: items.map((i) => ({ ...wrap(i).toObject(), run: r.id })) },
        attachments: [],
      };
    });
  }

  private async delete(ids: readonly string[]): Promise<number> {
    const em = this.em.fork();
    const items = await em.find(ItemEntity, { run: { $in: [...ids] } }, { fields: ['id'] });
    await em.nativeDelete(HistoryEntry, {
      $or: [{ entity: 'compensation.run', entityId: { $in: [...ids] } }, ...(items.length ? [{ entity: 'compensation.item', entityId: { $in: items.map((i) => i.id) } }] : [])],
    });
    await em.nativeDelete(ItemEntity, { run: { $in: [...ids] } });
    return em.nativeDelete(RunEntity, { id: { $in: [...ids] } });
  }

  /**
   * Anonymised persons: payouts made without bank account name them; the name becomes "N. N." (amounts and the person
   * reference stay as booking records), and so do the confirmed names without IBAN.
   */
  async anonymize(personIds: readonly string[]): Promise<void> {
    const em = this.em.fork();
    const ids = new Set(personIds);
    const runs = await em.find(RunEntity, { status: { $ne: 'draft' } });
    const changed: string[] = [];
    for (const run of runs) {
      const payouts = run.manualPayouts ?? [];
      const names = new Set(payouts.filter((p) => p.personIds.some((id) => ids.has(id))).map((p) => p.name));
      if (!names.size) continue;
      run.manualPayouts = payouts.map((p) => (p.personIds.some((id) => ids.has(id)) ? { ...p, name: ANONYMIZED_NAME } : p));
      run.withoutIban = (run.withoutIban ?? []).map((name) => (names.has(name) ? ANONYMIZED_NAME : name));
      changed.push(run.id);
    }
    if (!changed.length) return;
    await em.flush();
    // The history of these runs holds the former names.
    await em.nativeDelete(HistoryEntry, { entity: 'compensation.run', entityId: { $in: changed } });
  }

  /**
   * Erasure check: items of payout runs are booking records and stay until the period of the payout runs ends (runs not
   * yet paid out without end); open items and functions with allowance may be deleted.
   */
  async erasure(personId: string, ctx: ErasureContext): Promise<ErasureAreaInput[]> {
    const em = this.em.fork();
    const areas: ErasureAreaInput[] = [];
    const title = { de: 'Entschädigung', en: 'Compensation' };
    const items = await em.find(ItemEntity, { personId }, { populate: ['run'] });
    const inRuns = items.filter((i) => i.run);
    if (inRuns.length) {
      const runs = [...new Map(inRuns.map((i) => [i.run!.id, i.run!])).values()];
      const unpaid = runs.some((r) => !r.paidAt);
      const latest = runs.map((r) => r.paidAt?.toISOString().slice(0, 10) ?? '').toSorted().at(-1)!;
      const hold = unpaid ? { until: null, reason: { de: 'Auszahlungslauf noch nicht ausgezahlt', en: 'Payout run not paid out yet' } } : ctx.retain('compensation.runs', latest);
      areas.push({
        key: 'compensation.payouts',
        title,
        data: { de: `${inRuns.length} Posten in ${runs.length} ${runs.length === 1 ? 'Auszahlungslauf' : 'Auszahlungsläufen'}`, en: `${inRuns.length} ${inRuns.length === 1 ? 'item' : 'items'} in ${runs.length} payout ${runs.length === 1 ? 'run' : 'runs'}` },
        count: inRuns.length,
        outcome: hold ? 'keep' : 'anonymize',
        keepUntil: hold?.until ?? null,
        reason: hold ? { de: `Kassenunterlage; ${hold.reason.de}`, en: `Booking record; ${hold.reason.en}` } : { de: 'Beträge bleiben ohne Begründungen und Namen', en: 'Amounts stay without reasons and names' },
      });
    }
    const open = items.length - inRuns.length;
    const functions = await em.count(FunctionHolderEntity, { personId });
    if (open || functions) {
      areas.push({
        key: 'compensation.open',
        title,
        data: {
          de: [open && `${open} offene${open === 1 ? 'r' : ''} Posten`, functions && `${functions} ${functions === 1 ? 'Funktion' : 'Funktionen'} mit Aufwandsentschädigung`].filter(Boolean).join(', '),
          en: [open && `${open} open ${open === 1 ? 'item' : 'items'}`, functions && `${functions} ${functions === 1 ? 'function' : 'functions'} with allowance`].filter(Boolean).join(', '),
        },
        count: open + functions,
        outcome: 'delete',
        keepUntil: null,
        reason: null,
      });
    }
    return areas;
  }

  async erase(personId: string, areas: readonly ErasureArea[]): Promise<void> {
    const keys = new Set(areas.map((a) => a.key));
    const em = this.em.fork();
    if (keys.has('compensation.open')) {
      const items = await em.find(ItemEntity, { personId, run: null }, { fields: ['id'] });
      const functions = await em.find(FunctionHolderEntity, { personId }, { fields: ['id'] });
      const ids = [...items.map((i) => i.id), ...functions.map((f) => f.id)];
      if (ids.length) await em.nativeDelete(HistoryEntry, { entity: { $in: ['compensation.item', 'compensation.function_holder'] }, entityId: { $in: ids } });
      await em.nativeDelete(ItemEntity, { personId, run: null });
      await em.nativeDelete(FunctionHolderEntity, { personId });
    }
    if (keys.has('compensation.payouts')) {
      const items = await em.find(ItemEntity, { personId, run: { $ne: null } }, { fields: ['id'] });
      if (items.length) {
        await em.nativeUpdate(ItemEntity, { id: { $in: items.map((i) => i.id) } }, { reason: '' });
        await em.nativeDelete(HistoryEntry, { entity: 'compensation.item', entityId: { $in: items.map((i) => i.id) } });
      }
      await this.anonymize([personId]);
    }
  }
}
