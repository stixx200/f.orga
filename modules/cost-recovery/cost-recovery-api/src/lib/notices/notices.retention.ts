import { Injectable } from '@nestjs/common';
import { EntityManager, wrap } from '@mikro-orm/core';
import { HistoryEntry, type RetentionCandidate, type RetentionExportRecord, type RetentionQuery, RetentionRegistry } from '@forga/core-api';
import type { NoticeStatus } from '@forga/cost-recovery-contracts';
import { IncidentOffenseEntity, NoticeEntity } from '../cost-recovery.entities.js';

/** Settled notices: paid, lifted, replaced by an amendment or never issued. */
const SETTLED: NoticeStatus[] = ['paid', 'cancelled', 'amended', 'discarded'];

/** Day the notice was settled: payment, cancellation, last payment, issue or creation. */
function settledOn(n: NoticeEntity): string {
  const payments = (n.payments ?? []).filter((p) => !p.reversal).map((p) => p.date).toSorted();
  return n.paidOn ?? n.cancellation?.date ?? payments.at(-1) ?? (n.issuedAt ?? n.createdAt).toISOString().slice(0, 10);
}

/**
 * Retention of the cost notices (cash records: periods of the budget law, to be agreed with the treasury). An incident
 * with an open notice is not deleted.
 */
@Injectable()
export class NoticesRetention {
  constructor(private readonly em: EntityManager) {}

  register(registry: RetentionRegistry): void {
    registry.registerCategory({
      key: 'cost-recovery.notices',
      module: 'cost-recovery',
      name: { de: 'Kostenbescheide', en: 'Cost notices' },
      description: { de: 'mit Zahlungen und Mahnungen; haushaltsrechtliche Fristen, mit der Kämmerei abstimmen', en: 'with payments and reminders; periods of the budget law, to be agreed with the treasury' },
      event: { de: 'Erledigung (Zahlung, Aufhebung)', en: 'Settlement (payment, cancellation)' },
      actions: ['offer-archive', 'delete', 'none'],
      financial: true,
      candidates: (query) => this.candidates(query),
      export: (ids) => this.export(ids),
      execute: (ids) => this.delete(ids),
    });
    registry.registerDependent('incidents.incidents', 'cost-recovery', {
      blockedBy: async (records, action) => {
        const blocked = new Map<string, string>();
        if (action !== 'delete') return blocked;
        const open = await this.em.fork().find(NoticeEntity, { incidentId: { $in: records.map((r) => r.id) }, status: { $nin: SETTLED } }, { fields: ['id', 'incidentId'] });
        for (const n of open) blocked.set(n.incidentId, 'retention.costNoticeOpen');
        return blocked;
      },
      // The legal ground chosen for a deleted incident is of no use any more; settled notices keep their own copy of the incident data.
      execute: async (records, action) => {
        if (action !== 'delete' || !records.length) return;
        const ids = records.map((r) => r.id);
        const em = this.em.fork();
        await em.nativeDelete(IncidentOffenseEntity, { incidentId: { $in: ids } });
        await em.nativeDelete(HistoryEntry, { entity: 'cost_recovery.incident_offense', entityId: { $in: ids } });
      },
    });
  }

  private async candidates(query: RetentionQuery): Promise<RetentionCandidate[]> {
    const cutoff = query.cutoff.toISOString().slice(0, 10);
    const notices = await this.em.fork().find(NoticeEntity, { status: { $in: SETTLED } }, { orderBy: { number: 'asc' } });
    return notices
      .map((n) => ({ n, on: settledOn(n) }))
      .filter(({ on }) => on < cutoff)
      .map(({ n, on }) => ({ id: n.id, label: `${n.number} · ${n.dispatchNumber}`, neutralLabel: n.number, eventDate: on }));
  }

  private async export(ids: readonly string[]): Promise<RetentionExportRecord[]> {
    const notices = await this.em.fork().find(NoticeEntity, { id: { $in: [...ids] } }, { populate: ['pdf'] });
    return notices.map((n) => {
      const { pdf, ...data } = wrap(n).toObject() as Record<string, unknown>;
      return {
        id: n.id,
        title: `${n.number} · ${n.dispatchNumber}`,
        fields: [
          { label: { de: 'Aktenzeichen', en: 'File number' }, value: n.number },
          { label: { de: 'Einsatz', en: 'Incident' }, value: `${n.dispatchNumber} · ${n.alarmKeyword}` },
          { label: { de: 'Status', en: 'Status' }, value: n.status },
          { label: { de: 'Erledigt am', en: 'Settled on' }, value: settledOn(n) },
          { label: { de: 'Kostenschuldner', en: 'Debtors' }, value: (n.debtors ?? []).map((d) => d.name).join(', ') },
        ],
        data: { ...data, pdf: undefined, hasPdf: Boolean(pdf) },
        attachments: [],
        files: n.pdf ? [{ name: `${n.number}.pdf`, data: Buffer.from(n.pdf) }] : [],
      };
    });
  }

  private async delete(ids: readonly string[]): Promise<number> {
    const em = this.em.fork();
    await em.nativeDelete(HistoryEntry, { entity: 'cost_recovery.notice', entityId: { $in: [...ids] } });
    return em.nativeDelete(NoticeEntity, { id: { $in: [...ids] }, status: { $in: SETTLED } });
  }
}
