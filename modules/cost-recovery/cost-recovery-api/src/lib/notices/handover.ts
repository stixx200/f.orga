import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import ExcelJS from 'exceljs';
import { addStyledSheet, berlinDate } from '@forga/core-api';
import { type CostRecoverySettings, type HandoverColumn, type NoticeFilter, round2, totalOf } from '@forga/cost-recovery-contracts';
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
  ) {}

  /** Rows of the notices: an amendment of a notice already handed over is a change with the difference. */
  private async rows(notices: NoticeEntity[]): Promise<Row[]> {
    const originalIds = notices.flatMap((n) => (n.amendsId ? [n.amendsId] : []));
    const originals = new Map((originalIds.length ? await this.em.fork().find(NoticeEntity, { id: { $in: originalIds } }) : []).map((o) => [o.id, o]));
    return notices.flatMap((n): Row[] => {
      if (n.status === 'cancelled' && n.handedOverAt) return [{ notice: n, kind: 'Aufhebung', reference: '', delta: -totalOf(n.positions) }];
      if (!n.issuedAt || n.status === 'cancelled' || n.status === 'amended') return [];
      const original = n.amendsId ? originals.get(n.amendsId) : undefined;
      if (original?.handedOverAt) return [{ notice: n, kind: 'Änderung', reference: original.number, delta: round2(totalOf(n.positions) - totalOf(original.positions)) }];
      return [{ notice: n, kind: 'Sollstellung', reference: '', delta: '' }];
    });
  }

  /** Cancellations after the handover the treasury has not been told about yet. */
  private unreported(filter: NoticeFilter): Promise<NoticeEntity[]> {
    return this.notices.find({ ...filter, status: 'cancelled' }).then((list) => list.filter((n) => n.handedOverAt && !n.changeReportedAt));
  }

  /**
   * Export of the list filter. Without a status: the issued notices not handed over yet and the unreported changes;
   * `mark` hands them over in the same step (notices `handed-over`, changes reported), so a second export does not repeat them.
   */
  async export(filter: NoticeFilter, mark: boolean): Promise<HandoverFile> {
    const config = await this.notices.config();
    // A plain export with a status filter or chosen notices shows exactly those; otherwise what is still to hand over.
    const pending = mark || (!filter.status && !filter.ids);
    const selected = pending ? [...(await this.notices.find({ ...filter, status: 'issued' })), ...(await this.unreported(filter))] : await this.notices.find(filter);
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
        else Object.assign(notice, { status: 'handed-over', handedOverAt: now });
        if (row.kind === 'Sollstellung') handedOver++;
        else changes++;
      }
      await em.flush();
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
