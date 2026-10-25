import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import type { DeadlineInput, DeadlineProvider } from '@forga/core-api';
import { NoticeEntity } from '../cost-recovery.entities.js';
import { currentDueOn, isOverdue, refundDue } from './notices.service.js';

/** Due the day after the payment date: from then on the notice is overdue. */
const dayAfter = (date: string) => new Date(Date.parse(`${date}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
const label = (n: NoticeEntity) => [n.number, n.debtors.map((d) => d.name).join('; ')].filter(Boolean).join(' · ');
const euro = (value: number) => value.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

/**
 * Tasks of cost recovery:
 * - Overdue notices for those who edit cost notices: due the day after the payment term in force (the due date, after
 *   a reminder its new term). Before a reminder the task asks for one; after it, the notice is still open despite the
 *   reminder. The task disappears with full payment, cancellation or amendment.
 * - Overpayments (also payments on a cancelled notice) for the treasury (`cost-recovery.refund`): "Erstattung", until
 *   the refund is recorded.
 */
@Injectable()
export class OverdueNotices implements DeadlineProvider {
  readonly module = 'cost-recovery';

  constructor(private readonly em: EntityManager) {}

  async deadlines(asOf: string): Promise<DeadlineInput[]> {
    const em = this.em.fork();
    const open = await em.find(NoticeEntity, { status: { $in: ['issued', 'handed-over'] }, dueOn: { $ne: null } });
    const overdue = open
      .filter((n) => isOverdue(n, asOf))
      .map((n): DeadlineInput => {
        const reminded = Boolean(n.reminders?.length);
        return {
          id: `notice-overdue:${n.id}`,
          kind: 'cost-recovery-overdue',
          title: reminded
            ? { de: 'Kostenbescheid trotz Zahlungserinnerung offen', en: 'Cost notice still open after reminder' }
            : { de: 'Kostenbescheid überfällig: Zahlungserinnerung', en: 'Cost notice overdue: payment reminder' },
          subject: { type: 'cost-recovery.notice', id: n.id, label: label(n) },
          dueOn: dayAfter(currentDueOn(n)!),
          leadDays: 0,
          departmentIds: [],
          permission: 'cost-recovery.write',
          to: `/cost-recovery/notices/${n.id}`,
        };
      });
    const settled = await em.find(NoticeEntity, { status: { $in: ['issued', 'handed-over', 'objection', 'paid', 'cancelled'] } });
    const refunds = settled
      .filter((n) => refundDue(n) > 0)
      .map((n): DeadlineInput => {
        // Due since the overpayment arose: the last payment or the cancellation, whichever is later.
        const since = [...(n.payments ?? []).filter((p) => !p.reversal).map((p) => p.date), n.cancellation?.date ?? ''].toSorted().at(-1) || asOf;
        return {
          id: `notice-refund:${n.id}`,
          kind: 'cost-recovery-refund',
          title: { de: `Erstattung: ${euro(refundDue(n))} zu viel gezahlt`, en: `Refund: ${refundDue(n).toFixed(2)} € overpaid` },
          subject: { type: 'cost-recovery.notice', id: n.id, label: label(n) },
          dueOn: since,
          leadDays: 0,
          departmentIds: [],
          permission: 'cost-recovery.refund',
          to: `/cost-recovery/notices/${n.id}`,
        };
      });
    return [...overdue, ...refunds];
  }
}
