import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import ExcelJS from 'exceljs';
import { addStyledSheet, Audit, berlinDate } from '@forga/core-api';
import { type CostRecoverySettings, type HandoverColumn, IN_EFFECT_STATUSES, type NoticeFilter, round2, totalOf } from '@forga/cost-recovery-contracts';
import { NoticeEntity } from '../cost-recovery.entities.js';
import { NoticesService } from './notices.service.js';

/** CSV cell for German spreadsheet programs: decimal comma, quoted when needed. */
const csvCell = (v: string | number) => (typeof v === 'number' ? v.toFixed(2).replace('.', ',') : /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

const HANDOVER_COLUMNS: Record<HandoverColumn, { label: string; width: number; value: (n: NoticeEntity, config: CostRecoverySettings) => string | number }> = {
  number: { label: 'Aktenzeichen', width: 16, value: (n) => n.number },
  cashReference: { label: 'Kassenzeichen', width: 16, value: (n) => n.cashReference },
  debtors: { label: 'Kostenschuldner', width: 30, value: (n) => n.debtors.map((d) => d.name).join('; ') },
  address: { label: 'Anschrift', width: 40, value: (n) => n.debtors.map((d) => [d.street, `${d.postalCode} ${d.city}`.trim()].filter(Boolean).join(', ')).join('; ') },
  amount: { label: 'Betrag (€)', width: 12, value: (n) => totalOf(n.positions) },
  dueOn: { label: 'Fällig am', width: 12, value: (n) => n.dueOn ?? '' },
  issuedOn: { label: 'Erlassen am', width: 12, value: (n) => (n.issuedAt ? berlinDate(n.issuedAt) : '') },
  budgetAccount: { label: 'Haushaltsstelle', width: 16, value: (_n, config) => config.budgetAccount },
  incident: { label: 'Einsatz', width: 22, value: (n) => `${n.dispatchNumber} ${n.alarmKeyword}` },
};

/** Kind of a row: new claim, cancellation or amendment of a claim already handed over. */
type Row = { notice: NoticeEntity; kind: 'Sollstellung' | 'Aufhebung' | 'Änderung'; reference: string; delta: number | '' };

export interface HandoverFile {
  filename: string;
  contentType: string;
  body: Buffer;
  /** Notices marked as handed over, and changes reported. */
  handedOver: number;
  changes: number;
}

/**
 * Handover to the treasury (Sollstellung) in the format of the settings. Besides new claims it reports the
 * cancellations and amendments of notices the treasury already has (column "Vorgang", "Bezug", "Differenz").
 */
@Injectable()
export class TreasuryHandover {
  constructor(
    private readonly em: EntityManager,
    private readonly notices: NoticesService,
    private readonly audit: Audit,
  ) {}

  /**
   * Rows of the notices. A notice in effect is a new claim, or a change with the difference when it amends a notice
   * already handed over. A cancellation is reported when the treasury knows the claim: the notice itself was handed
   * over, or (for an amendment not handed over yet) the notice it replaced, which is then the reference.
   */
  private async rows(notices: NoticeEntity[]): Promise<Row[]> {
    const originalIds = notices.flatMap((n) => (n.amendsId ? [n.amendsId] : []));
    const originals = new Map((originalIds.length ? await this.em.fork().find(NoticeEntity, { id: { $in: originalIds } }) : []).map((o) => [o.id, o]));
    return notices.flatMap((n): Row[] => {
      const original = n.amendsId ? originals.get(n.amendsId) : undefined;
      if (n.status === 'cancelled') {
        if (n.handedOverAt) return [{ notice: n, kind: 'Aufhebung', reference: '', delta: -totalOf(n.positions) }];
        if (original?.handedOverAt) return [{ notice: n, kind: 'Aufhebung', reference: original.number, delta: -totalOf(original.positions) }];
        return [];
      }
      if (!n.issuedAt || !IN_EFFECT_STATUSES.includes(n.status)) return [];
      if (original?.handedOverAt) return [{ notice: n, kind: 'Änderung', reference: original.number, delta: round2(totalOf(n.positions) - totalOf(original.positions)) }];
      return [{ notice: n, kind: 'Sollstellung', reference: '', delta: '' }];
    });
  }

  /**
   * Still to hand over: notices in effect the treasury does not have yet (by the handover, not by the status, so also
   * paid amendments and notices in objection) and cancellations not reported yet.
   */
  private async pending(filter: NoticeFilter): Promise<NoticeEntity[]> {
    const inEffect = (await this.notices.find({ ...filter, status: IN_EFFECT_STATUSES.join(',') })).filter((n) => n.issuedAt && !n.handedOverAt);
    const cancelled = (await this.notices.find({ ...filter, status: 'cancelled' })).filter((n) => !n.changeReportedAt);
    return [...inEffect, ...cancelled];
  }

  /**
   * Export of the list filter. Without a status: the notices in effect not handed over yet and the unreported changes;
   * `mark` hands them over in the same step (handed over, issued ones `handed-over`, changes reported), so a second
   * export does not repeat them.
   */
  async export(filter: NoticeFilter, mark: boolean): Promise<HandoverFile> {
    const config = await this.notices.config();
    // A plain export with a status filter or chosen notices shows exactly those; otherwise what is still to hand over.
    const pending = mark || (!filter.status && !filter.ids);
    const selected = pending ? await this.pending(filter) : await this.notices.find(filter);
    const rows = (await this.rows(selected)).toSorted((a, b) => a.notice.number.localeCompare(b.notice.number));
    const file = this.file(config, rows);
    let handedOver = 0;
    let changes = 0;
    if (mark) {
      const em = this.em.fork();
      const now = new Date();
      for (const row of rows) {
        const notice = await em.findOneOrFail(NoticeEntity, row.notice.id);
        if (row.kind === 'Aufhebung') notice.changeReportedAt = now;
        else {
          notice.handedOverAt = now;
          if (notice.status === 'issued') notice.status = 'handed-over';
        }
        if (row.kind === 'Sollstellung') handedOver++;
        else changes++;
      }
      await em.flush();
      await this.audit.log('cost-recovery.handover-exported', { handedOver, changes, numbers: rows.map((r) => r.notice.number) });
    }
    return { ...(await file), handedOver, changes };
  }

  private async file(config: CostRecoverySettings, rows: Row[]): Promise<Omit<HandoverFile, 'handedOver' | 'changes'>> {
    const columns = config.handover.columns.map((c) => HANDOVER_COLUMNS[c]);
    const header = [...columns.map((c) => c.label), 'Vorgang', 'Bezug', 'Differenz (€)'];
    const values = rows.map((r) => [...columns.map((c) => c.value(r.notice, config)), r.kind, r.reference, r.delta]);
    const date = berlinDate();
    if (config.handover.format === 'csv') {
      return {
        filename: `Kostenersatz_Sollstellung_${date}.csv`,
        contentType: 'text/csv; charset=utf-8',
        body: Buffer.from(`﻿${[header, ...values].map((r) => r.map(csvCell).join(';')).join('\r\n')}\r\n`, 'utf8'),
      };
    }
    const wb = new ExcelJS.Workbook();
    wb.creator = 'f.orga';
    addStyledSheet(wb, 'Sollstellung', 'Kostenbescheide – Übergabe an die Kämmerei', `${config.authority} · ${date}`, header, values, [...columns.map((c) => c.width), 14, 18, 14]);
    return {
      filename: `Kostenersatz_Sollstellung_${date}.xlsx`,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body: Buffer.from(await wb.xlsx.writeBuffer()),
    };
  }
}
