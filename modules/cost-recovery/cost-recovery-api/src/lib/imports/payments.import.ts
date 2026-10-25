import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { v7 as uuidv7 } from 'uuid';
import { berlinDate, type ImportContext, type ImportProfile, type ImportRow, parseDate } from '@forga/core-api';
import type { ImportResult, ImportRowResult } from '@forga/core-contracts';
import { OPEN_STATUSES, paidOf, round2, totalOf } from '@forga/cost-recovery-contracts';
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

/**
 * Payments reported by the treasury, by file number or cash reference. A cash reference only matches notices in
 * effect and not settled (issued, handed over, objection), so an amended original or a cancelled notice is never hit.
 * Partial payments are recorded with the remaining balance; overpayments are reported.
 */
@Injectable()
export class PaymentsImport {
  constructor(private readonly em: EntityManager) {}

  profile(): ImportProfile {
    return {
      id: 'cost-recovery.payments',
      name: { de: 'Zahlungseingänge der Kämmerei', en: 'Payments from the treasury' },
      description: {
        de: 'Eine Zeile je Zahlung mit Aktenzeichen oder Kassenzeichen und Datum, optional Betrag (ohne Betrag: der offene Betrag). Teilzahlungen werden mit dem Restbetrag erfasst, Überzahlungen gemeldet; eine schon erfasste Zahlung (gleiches Datum, gleicher Betrag) wird nicht doppelt gebucht.',
        en: 'One row per payment with file number or cash reference and date, optionally the amount (without: the open amount). Partial payments are recorded with the remaining balance, overpayments reported; a payment already recorded (same date and amount) is not booked twice.',
      },
      permission: 'cost-recovery.write',
      fields: FIELDS,
      run: (rows, context) => this.run(rows, context),
    };
  }

  private async run(rows: ImportRow[], { dryRun, user }: ImportContext): Promise<ImportResult> {
    const em = this.em.fork();
    const results: ImportRowResult[] = [];
    const today = berlinDate();
    for (const { row, values } of rows) {
      const number = values['number']?.trim();
      const cashReference = values['cashReference']?.trim();
      const label = number || cashReference || '';
      const error = (code: string, params?: Record<string, string>) => results.push({ row, action: 'error', label, messages: [{ code, params }] });
      const candidates = number
        ? await em.find(NoticeEntity, { number })
        : cashReference
          ? await em.find(NoticeEntity, { cashReference, status: { $in: [...OPEN_STATUSES, 'paid'] } })
          : [];
      if (!candidates.length) { error('cost-recovery.import.unknownNotice', { reference: label }); continue; }
      if (candidates.length > 1) { error('cost-recovery.import.ambiguous', { reference: label, numbers: candidates.map((n) => n.number).join(', ') }); continue; }
      const notice = candidates[0]!;
      const paidOn = parseDate(values['paidOn'] ?? '');
      if (!paidOn) { error('imports.invalidDate'); continue; }
      if (notice.status !== 'paid' && !OPEN_STATUSES.includes(notice.status)) { error('cost-recovery.import.notOpen', { reference: label, status: notice.status }); continue; }
      if (notice.issuedAt && paidOn < berlinDate(notice.issuedAt)) { error('cost-recovery.paymentBeforeIssue'); continue; }
      if (paidOn > today) { error('cost-recovery.paymentInFuture'); continue; }
      const total = totalOf(notice.positions);
      const open = round2(total - paidOf(notice.payments ?? []));
      let amount = open;
      if (values['amount']) {
        const parsed = money(values['amount']);
        if (parsed === null || parsed <= 0) { error('cost-recovery.import.invalidAmount', { value: values['amount'] }); continue; }
        amount = parsed;
      }
      // Imported again: the same payment is not booked twice; a paid notice without amount stays as it is.
      if ((notice.payments ?? []).some((p) => !p.reversal && p.date === paidOn && p.amount === amount) || amount <= 0) {
        results.push({ row, action: 'unchanged', label, messages: [] });
        continue;
      }
      const messages: ImportRowResult['messages'] = [];
      const params = { reference: notice.number, amount: amount.toFixed(2), total: total.toFixed(2), open: round2(open - amount).toFixed(2) };
      if (amount < open) messages.push({ code: 'cost-recovery.import.partialPayment', params });
      if (amount > open) messages.push({ code: 'cost-recovery.import.overpayment', params: { ...params, open: round2(amount - open).toFixed(2) } });
      if (!dryRun) {
        notice.payments = [...(notice.payments ?? []), { id: uuidv7(), date: paidOn, amount, note: 'Import Kämmerei', recordedBy: user.displayName, reversal: null }];
        if (paidOf(notice.payments) >= total) Object.assign(notice, { status: 'paid', paidOn: notice.payments.filter((p) => !p.reversal).map((p) => p.date).toSorted().at(-1) });
      }
      results.push({ row, action: 'update', label, messages });
    }
    if (!dryRun) await em.flush();
    const counts = { create: 0, update: 0, unchanged: 0, error: 0 };
    for (const r of results) counts[r.action]++;
    return { dryRun, counts, rows: results };
  }
}
