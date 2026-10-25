import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import type { DeadlineInput, DeadlineProvider } from '@forga/core-api';
import { NoticeEntity } from '../cost-recovery.entities.js';
import { isOverdue } from './notices.service.js';

/** Due the day after the payment date: from then on the notice is overdue. */
const dayAfter = (date: string) => new Date(Date.parse(`${date}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/**
 * Overdue notices as tasks for those who edit cost notices: due on the payment date, after a reminder on its new
 * payment term. The task disappears with full payment, cancellation or amendment.
 */
@Injectable()
export class OverdueNotices implements DeadlineProvider {
  readonly module = 'cost-recovery';

  constructor(private readonly em: EntityManager) {}

  async deadlines(asOf: string): Promise<DeadlineInput[]> {
    const notices = await this.em.fork().find(NoticeEntity, { status: { $in: ['issued', 'handed-over'] }, dueOn: { $ne: null } });
    return notices
      .filter((n) => isOverdue(n, asOf))
      .map((n) => {
        const reminder = n.reminders?.at(-1);
        return {
          id: `notice-overdue:${n.id}`,
          kind: 'cost-recovery-overdue',
          title: reminder
            ? { de: 'Kostenbescheid trotz Zahlungserinnerung offen', en: 'Cost notice still open after reminder' }
            : { de: 'Kostenbescheid überfällig: Zahlungserinnerung', en: 'Cost notice overdue: payment reminder' },
          subject: { type: 'cost-recovery.notice', id: n.id, label: [n.number, n.debtors.map((d) => d.name).join('; ')].filter(Boolean).join(' · ') },
          dueOn: dayAfter(reminder?.dueOn ?? n.dueOn!),
          leadDays: 0,
          departmentIds: [],
          permission: 'cost-recovery.write',
        };
      });
  }
}
