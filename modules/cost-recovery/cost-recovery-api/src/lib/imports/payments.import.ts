import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { v7 as uuidv7 } from 'uuid';
import { Audit, berlinDate, type ImportContext, type ImportProfile, type ImportRow, parseDate } from '@forga/core-api';
import type { ImportResult, ImportRowResult } from '@forga/core-contracts';
import { OPEN_STATUSES, paidOf, parseAmount, round2, totalOf } from '@forga/cost-recovery-contracts';
import { NoticeEntity } from '../cost-recovery.entities.js';

const field = (key: string, de: string, en: string, aliases: string[], required = false) => ({ key, label: { de, en }, required, aliases });

const FIELDS = [
  field('number', 'Aktenzeichen', 'File number', ['Aktenzeichen', 'Az', 'Bescheid']),
  field('cashReference', 'Kassenzeichen', 'Cash reference', ['Kassenzeichen', 'Kz', 'Buchungszeichen']),
  field('paidOn', 'Zahlungsdatum', 'Date of payment', ['Zahlungsdatum', 'Datum', 'Buchungsdatum', 'Wertstellung'], true),
  field('amount', 'Betrag', 'Amount', ['Betrag', 'Zahlbetrag', 'Eingang']),
];

const paymentKey = (noticeId: string, date: string, amount: number) => `${noticeId}|${date}|${amount.toFixed(2)}`;

/**
 * Payments reported by the treasury, by file number or cash reference. A cash reference only matches notices in
 * effect and not settled (issued, handed over, objection), so an amended original or a cancelled notice is never hit.
 * Partial payments are recorded with the remaining balance; overpayments are reported.
 *
 * Duplicates are counted against the payments recorded before the import: a file imported again books nothing,
 * while the same amount twice on one day in one file (two instalments) books both and says so. Preview and import
 * count the same way, since the preview also adds the rows in memory (without saving).
 */
@Injectable()
export class PaymentsImport {
  constructor(
    private readonly em: EntityManager,
    private readonly audit: Audit,
  ) {}

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
    // Payments per notice, date and amount recorded before this import, and how often each occurred in the file so far.
    const before = new Map<string, number>();
    const known = new Set<string>();
    const seen = new Map<string, number>();
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
      if (!known.has(notice.id)) {
        known.add(notice.id);
        for (const p of (notice.payments ?? []).filter((x) => !x.reversal)) before.set(paymentKey(notice.id, p.date, p.amount), (before.get(paymentKey(notice.id, p.date, p.amount)) ?? 0) + 1);
      }
      const paidOn = parseDate(values['paidOn'] ?? '');
      if (!paidOn) { error('imports.invalidDate'); continue; }
      if (notice.status !== 'paid' && !OPEN_STATUSES.includes(notice.status)) { error('cost-recovery.import.notOpen', { reference: label, status: notice.status }); continue; }
      if (notice.issuedAt && paidOn < berlinDate(notice.issuedAt)) { error('cost-recovery.paymentBeforeIssue'); continue; }
      if (paidOn > today) { error('cost-recovery.paymentInFuture'); continue; }
      const total = totalOf(notice.positions);
      const open = round2(total - paidOf(notice.payments ?? []));
      let amount = open;
      if (values['amount']) {
        const parsed = parseAmount(values['amount']);
        if (parsed === null || parsed <= 0) { error('cost-recovery.import.invalidAmount', { value: values['amount'] }); continue; }
        amount = parsed;
      }
      // A paid notice without amount stays as it is.
      if (amount <= 0) {
        results.push({ row, action: 'unchanged', label, messages: [] });
        continue;
      }
      const key = paymentKey(notice.id, paidOn, amount);
      const occurrence = (seen.get(key) ?? 0) + 1;
      seen.set(key, occurrence);
      const params = { reference: notice.number, amount: amount.toFixed(2), total: total.toFixed(2), open: round2(open - amount).toFixed(2), date: paidOn };
      // Imported again: a payment recorded before the import is not booked twice.
      if (occurrence <= (before.get(key) ?? 0)) {
        results.push({ row, action: 'unchanged', label, messages: [{ code: 'cost-recovery.import.alreadyRecorded', params }] });
        continue;
      }
      const messages: ImportRowResult['messages'] = [];
      if (occurrence > 1) messages.push({ code: 'cost-recovery.import.repeated', params });
      if (amount < open) messages.push({ code: 'cost-recovery.import.partialPayment', params });
      if (amount > open) messages.push({ code: 'cost-recovery.import.overpayment', params: { ...params, open: round2(amount - open).toFixed(2) } });
      // Also in the preview (not saved), so later rows of the same notice see the open amount after this one.
      notice.payments = [...(notice.payments ?? []), { id: uuidv7(), date: paidOn, amount, note: 'Import Kämmerei', recordedBy: user.displayName, reversal: null }];
      if (paidOf(notice.payments) >= total && notice.objection?.result !== 'pending') Object.assign(notice, { status: 'paid', paidOn: notice.payments.filter((p) => !p.reversal && p.amount > 0).map((p) => p.date).toSorted().at(-1) });
      results.push({ row, action: 'update', label, messages });
    }
    if (!dryRun) {
      await em.flush();
      await this.audit.log('cost-recovery.payments-imported', { booked: results.filter((r) => r.action === 'update').length });
    }
    const counts = { create: 0, update: 0, unchanged: 0, error: 0 };
    for (const r of results) counts[r.action]++;
    return { dryRun, counts, rows: results };
  }
}
