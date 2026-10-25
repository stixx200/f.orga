import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { z } from 'zod';
import type { ListColumn } from '@forga/core-contracts';
import { berlinDate, berlinDayStart, type ListDefinition } from '@forga/core-api';
import { ENDED_STATUSES, OPEN_STATUSES, paidOf, round2, totalOf } from '@forga/cost-recovery-contracts';
import { NoticeEntity } from '../cost-recovery.entities.js';
import { isOverdue, NoticesService } from '../notices/notices.service.js';

const col = (key: string, de: string, en: string, width?: number, align?: ListColumn['align']): ListColumn => ({ key, label: { de, en }, ...(width ? { width } : {}), ...(align ? { align } : {}) });
const Period = z.object({ from: z.iso.date().optional(), to: z.iso.date().optional() });
const Year = z.object({ year: z.coerce.number().int().optional() });
const READ = 'cost-recovery.read';
const period = [{ key: 'from', label: { de: 'Von', en: 'From' }, type: 'date' as const }, { key: 'to', label: { de: 'Bis', en: 'To' }, type: 'date' as const }];
const defaults = (p: z.infer<typeof Period>) => {
  const year = berlinDate().slice(0, 4);
  return { from: p.from ?? `${year}-01-01`, to: p.to ?? `${year}-12-31` };
};

/** List templates of the cost recovery module. */
@Injectable()
export class CostRecoveryLists {
  constructor(
    private readonly em: EntityManager,
    private readonly notices: NoticesService,
  ) {}

  definitions(): ListDefinition<never>[] {
    return [this.withoutNotice(), this.open(), this.perYear(), this.fireAlarms()] as ListDefinition<never>[];
  }

  private withoutNotice(): ListDefinition<z.infer<typeof Period>> {
    return {
      id: 'cost-recovery.without-notice',
      name: { de: 'Kostenpflichtige Einsätze ohne Bescheid', en: 'Chargeable incidents without notice' },
      permission: READ,
      parameters: period,
      schema: Period,
      columns: [col('date', 'Datum', 'Date'), col('number', 'Einsatz-Nr.', 'Incident no.'), col('keyword', 'Stichwort', 'Keyword'), col('location', 'Ort', 'Location', 2), col('released', 'Freigegeben', 'Released')],
      rows: async (_user, params, language) => {
        const { from, to } = defaults(params);
        const candidates = (await this.notices.candidates(from, to)).filter((c) => !c.noticeId);
        return { subtitle: `${from} – ${to}`, rows: candidates.map((c) => ({ date: c.alarmedAt.slice(0, 10), number: c.dispatchNumber, keyword: c.alarmKeyword, location: c.location, released: c.released ? (language === 'de' ? 'ja' : 'yes') : (language === 'de' ? 'nein' : 'no') })) };
      },
    };
  }

  private open(): ListDefinition<z.infer<typeof Period>> {
    return {
      id: 'cost-recovery.open',
      name: { de: 'Offene Bescheide', en: 'Open notices' },
      description: { de: 'Erlassen bzw. übergeben, nicht bezahlt', en: 'Issued or handed over, not paid' },
      permission: READ,
      parameters: [],
      schema: Period,
      columns: [
        col('number', 'Aktenzeichen', 'File no.'), col('debtor', 'Kostenschuldner', 'Debtor', 2), col('amount', 'Betrag €', 'Amount €', 1, 'right'), col('open', 'Offen €', 'Open €', 1, 'right'),
        col('due', 'Fällig', 'Due'), col('overdue', 'Überfällig', 'Overdue'), col('status', 'Status', 'Status'),
      ],
      rows: async (_user, _params, language) => {
        const today = berlinDate();
        const notices = await this.em.fork().find(NoticeEntity, { status: { $in: [...OPEN_STATUSES] } }, { orderBy: { dueOn: 'asc' } });
        const yes = language === 'de' ? 'ja' : 'yes';
        return {
          rows: notices.map((n) => ({
            number: n.number, debtor: n.debtors.map((d) => d.name).join('; '), amount: totalOf(n.positions), open: round2(totalOf(n.positions) - paidOf(n.payments ?? [])),
            due: n.dueOn ?? null, overdue: isOverdue(n, today) ? yes : '', status: n.status,
          })),
        };
      },
    };
  }

  private perYear(): ListDefinition<z.infer<typeof Year>> {
    return {
      id: 'cost-recovery.year',
      name: { de: 'Bescheide je Jahr', en: 'Notices per year' },
      description: { de: 'Mit Summen je Tatbestand', en: 'With totals per legal ground' },
      permission: READ,
      parameters: [{ key: 'year', label: { de: 'Jahr', en: 'Year' }, type: 'year' }],
      schema: Year,
      columns: [col('offense', 'Tatbestand', 'Legal ground', 2.5), col('count', 'Bescheide', 'Notices', 1, 'right'), col('amount', 'Summe €', 'Total €', 1, 'right'), col('paid', 'bezahlt €', 'paid €', 1, 'right')],
      rows: async (_user, params, language) => {
        const year = params.year ?? Number(berlinDate().slice(0, 4));
        const config = await this.notices.config();
        const notices = await this.em.fork().find(NoticeEntity, { alarmedAt: { $gte: berlinDayStart(`${year}-01-01`), $lt: berlinDayStart(`${year + 1}-01-01`) }, status: { $nin: ['draft', 'review', ...ENDED_STATUSES] } });
        const keys = [...new Set(notices.map((n) => n.offenseKey))];
        return {
          subtitle: String(year),
          rows: keys.map((key) => {
            const own = notices.filter((n) => n.offenseKey === key);
            return {
              offense: config.offenses.find((o) => o.key === key)?.name[language] ?? key,
              count: own.length,
              amount: own.reduce((s, n) => s + totalOf(n.positions), 0),
              paid: round2(own.reduce((s, n) => s + paidOf(n.payments ?? []), 0)),
            };
          }),
        };
      },
    };
  }

  /** Repeated false alarms of the same fire alarm system become visible. */
  private fireAlarms(): ListDefinition<z.infer<typeof Period>> {
    return {
      id: 'cost-recovery.fire-alarms',
      name: { de: 'BMA-Fehlalarme je Objekt', en: 'Fire alarm system false alarms per object' },
      permission: READ,
      parameters: period,
      schema: Period,
      columns: [col('object', 'Objekt', 'Object', 2), col('location', 'Anschrift', 'Address', 2), col('count', 'Fehlalarme', 'False alarms', 1, 'right'), col('last', 'Zuletzt', 'Last')],
      rows: async (_user, params) => {
        const { from, to } = defaults(params);
        const alarms = (await this.notices.candidates(from, to)).filter((c) => c.suggestedOffense === 'fire-alarm-system');
        const byObject = new Map<string, typeof alarms>();
        for (const a of alarms) byObject.set(a.object || a.location, [...(byObject.get(a.object || a.location) ?? []), a]);
        return {
          subtitle: `${from} – ${to}`,
          rows: [...byObject]
            .map(([object, list]) => ({ object, location: list[0].location, count: list.length, last: list.map((l) => l.alarmedAt.slice(0, 10)).toSorted().at(-1) ?? null }))
            .toSorted((a, b) => b.count - a.count),
        };
      },
    };
  }
}
