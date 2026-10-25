import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { type ImportContext, type ImportProfile, type ImportRow, parseDate } from '@forga/core-api';
import type { ImportResult, ImportRowResult } from '@forga/core-contracts';
import { totalOf } from '@forga/cost-recovery-contracts';
import { NoticeEntity } from '../cost-recovery.entities.js';

const field = (key: string, de: string, en: string, aliases: string[], required = false) => ({ key, label: { de, en }, required, aliases });

const FIELDS = [
  field('number', 'Aktenzeichen', 'File number', ['Aktenzeichen', 'Az', 'Bescheid']),
  field('cashReference', 'Kassenzeichen', 'Cash reference', ['Kassenzeichen', 'Kz', 'Buchungszeichen']),
  field('paidOn', 'Zahlungsdatum', 'Date of payment', ['Zahlungsdatum', 'Datum', 'Buchungsdatum', 'Wertstellung'], true),
  field('amount', 'Betrag', 'Amount', ['Betrag', 'Zahlbetrag', 'Eingang']),
];

/** Amount like `1.234,50` or `1234.50`. */
function money(text: string): number | null {
  const cleaned = text.replace(/[€\s]/g, '');
  const normalized = /,\d{1,2}$/.test(cleaned) ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned.replace(/,/g, '');
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

const OPEN = new Set(['issued', 'handed-over', 'objection']);

/** Payments reported by the treasury: marks issued notices as paid, by file number or cash reference. */
@Injectable()
export class PaymentsImport {
  constructor(private readonly em: EntityManager) {}

  profile(): ImportProfile {
    return {
      id: 'cost-recovery.payments',
      name: { de: 'Zahlungseingänge der Kämmerei', en: 'Payments from the treasury' },
      description: {
        de: 'Eine Zeile je Zahlung mit Aktenzeichen oder Kassenzeichen und Datum, optional Betrag. Bescheide gelten als bezahlt; ein geringerer Betrag wird als Teilzahlung gemeldet und nicht übernommen.',
        en: 'One row per payment with file number or cash reference and date, optionally the amount. Notices count as paid; a lower amount is reported as a partial payment and not taken over.',
      },
      permission: 'cost-recovery.write',
      fields: FIELDS,
      run: (rows, context) => this.run(rows, context),
    };
  }

  private async run(rows: ImportRow[], { dryRun }: ImportContext): Promise<ImportResult> {
    const em = this.em.fork();
    const results: ImportRowResult[] = [];
    for (const { row, values } of rows) {
      const label = values['number'] || values['cashReference'] || '';
      const error = (code: string, params?: Record<string, string>) => results.push({ row, action: 'error', label, messages: [{ code, params }] });
      const where = values['number'] ? { number: values['number'].trim() } : values['cashReference'] ? { cashReference: values['cashReference'].trim() } : null;
      const notice = where ? await em.findOne(NoticeEntity, where) : null;
      if (!notice) { error('cost-recovery.import.unknownNotice', { reference: label }); continue; }
      const paidOn = parseDate(values['paidOn'] ?? '');
      if (!paidOn) { error('imports.invalidDate'); continue; }
      if (notice.status === 'paid') { results.push({ row, action: 'unchanged', label, messages: [] }); continue; }
      if (!OPEN.has(notice.status)) { error('cost-recovery.import.notOpen', { reference: label, status: notice.status }); continue; }
      if (values['amount']) {
        const amount = money(values['amount']);
        if (amount === null) { error('cost-recovery.import.invalidAmount', { value: values['amount'] }); continue; }
        const total = totalOf(notice.positions);
        if (amount < total) { error('cost-recovery.import.partialPayment', { reference: label, amount: amount.toFixed(2), total: total.toFixed(2) }); continue; }
      }
      if (!dryRun) {
        notice.status = 'paid';
        notice.paidOn = paidOn;
      }
      results.push({ row, action: 'update', label, messages: [] });
    }
    if (!dryRun) await em.flush();
    const counts = { create: 0, update: 0, unchanged: 0, error: 0 };
    for (const r of results) counts[r.action]++;
    return { dryRun, counts, rows: results };
  }
}
