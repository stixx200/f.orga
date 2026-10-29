import { Inject, Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { z } from 'zod';
import type { ListColumn } from '@forga/core-contracts';
import { type AuthenticatedUser, type ListDefinition } from '@forga/core-api';
import { PERSON_DIRECTORY, type PersonDirectory } from '@forga/masterdata-contracts';
import { ItemEntity, RunEntity } from '../compensation.entities.js';
import { ItemsService, READ, RUNS } from '../items/items.service.js';
import { YearTotals } from './year-totals.js';

const col = (key: string, de: string, en: string, width?: number, align?: ListColumn['align']): ListColumn => ({ key, label: { de, en }, ...(width ? { width } : {}), ...(align ? { align } : {}) });
const KINDS = { compensation: { de: 'Entschädigung', en: 'Compensation' }, 'loss-of-earnings': { de: 'Verdienstausfall', en: 'Loss of earnings' }, 'flat-rate': { de: 'Pauschale', en: 'Flat rate' }, expenses: { de: 'Auslagen', en: 'Expenses' } } as const;
const StatementParams = z.object({ runId: z.uuid().optional(), personId: z.uuid().optional(), year: z.coerce.number().int().optional() });
const YearParams = z.object({ year: z.coerce.number().int().optional() });

/** List templates of the compensation module. */
@Injectable()
export class CompensationLists {
  constructor(
    private readonly em: EntityManager,
    private readonly items: ItemsService,
    private readonly totals: YearTotals,
    @Inject(PERSON_DIRECTORY) private readonly directory: PersonDirectory,
  ) {}

  definitions(): ListDefinition<never>[] {
    return [this.statement(), this.yearTotals()] as ListDefinition<never>[];
  }

  /** Compensation statement: items of a run or a year, per person with address, "(AZ)" for working hours. */
  private statement(): ListDefinition<z.infer<typeof StatementParams>> {
    return {
      id: 'compensation.statement',
      name: { de: 'Abrechnungsübersicht', en: 'Compensation statement' },
      description: { de: 'Posten je Person eines Auszahlungslaufs oder Jahres', en: 'Items per person of a payout run or year' },
      permission: READ,
      // Names with postal address: an export needs a purpose (L11).
      personalData: 'contact',
      purposes: [{ key: 'treasury', label: { de: 'Abrechnung für die Kasse bzw. die Personen', en: 'Statement for the treasury or the persons' } }],
      parameters: [
        {
          key: 'runId',
          label: { de: 'Auszahlungslauf', en: 'Payout run' },
          type: 'choice',
          // Runs hold no personal data; the rows still only show the items the user may see.
          choices: async (_user, query) => {
            const words = query.toLowerCase().split(/\s+/).filter(Boolean);
            return (await this.em.fork().find(RunEntity, {}, { orderBy: { from: 'desc' }, limit: 200 }))
              .filter((r) => words.every((w) => r.number.toLowerCase().includes(w)))
              .map((r) => ({ value: r.id, label: r.number, description: `${r.from} – ${r.to}` }));
          },
        },
        { key: 'personId', label: { de: 'Person', en: 'Person' }, type: 'person' },
        { key: 'year', label: { de: 'Jahr', en: 'Year' }, type: 'year' },
      ],
      schema: StatementParams,
      columns: [col('name', 'Name', 'Name', 1.8), col('date', 'Datum', 'Date'), col('label', 'Bezeichnung', 'Label', 2.2), col('kind', 'Art', 'Kind'), col('hours', 'Std.', 'Hours', 0.6, 'right'), col('amount', 'Betrag €', 'Amount €', 0.9, 'right')],
      rows: async (user: AuthenticatedUser, params, language) => {
        const visible = await this.items.visibleFilter(user);
        if (!visible) return { rows: [] };
        const year = params.year ?? new Date().getFullYear();
        const where = { $and: [visible, params.runId ? { run: params.runId } : { date: { $gte: `${year}-01-01`, $lte: `${year}-12-31` } }, params.personId ? { personId: params.personId } : {}] };
        const items = await this.em.fork().find(ItemEntity, where as never, { orderBy: { personId: 'asc', date: 'asc' } });
        const run = params.runId ? await this.em.fork().findOne(RunEntity, params.runId) : null;
        const people = new Map((await this.directory.paymentDetails([...new Set(items.map((i) => i.personId))])).map((p) => [p.id, p]));
        const name = (id: string) => {
          const p = people.get(id);
          return p ? `${p.lastName}, ${p.firstName} · ${[p.street, `${p.postalCode} ${p.city}`.trim()].filter(Boolean).join(', ')}` : '';
        };
        const rows = items
          .map((i) => ({
            name: name(i.personId),
            date: i.date,
            label: `${i.label}${i.workingHours ? ' (AZ)' : ''}${i.correction ? (language === 'de' ? ' (Korrektur)' : ' (correction)') : ''}`,
            kind: KINDS[i.kind][language],
            hours: i.hours ?? null,
            amount: i.amount === null || i.amount === undefined ? null : Number(i.amount),
          }))
          .toSorted((a, b) => a.name.localeCompare(b.name) || a.date.localeCompare(b.date));
        return { subtitle: run ? `${run.number}: ${run.from} – ${run.to}` : String(year), personIds: [...people.keys()], rows };
      },
    };
  }

  private yearTotals(): ListDefinition<z.infer<typeof YearParams>> {
    return {
      id: 'compensation.year-totals',
      name: { de: 'Jahressummen je Person', en: 'Annual totals per person' },
      description: { de: 'Mit Hinweis auf die steuerfreien Beträge (R 3.12 LStR); keine Steuerberechnung', en: 'With hint on the tax-free amounts; no tax calculation' },
      permission: RUNS,
      personalData: 'names',
      parameters: [{ key: 'year', label: { de: 'Jahr', en: 'Year' }, type: 'year' }],
      schema: YearParams,
      columns: [
        col('name', 'Name', 'Name', 2), col('compensation', 'Entschädigung', 'Compensation', 1, 'right'), col('flat', 'Pauschalen', 'Flat rates', 1, 'right'),
        col('loss', 'Verdienstausfall', 'Loss of earnings', 1, 'right'), col('expenses', 'Auslagen', 'Expenses', 1, 'right'), col('total', 'Summe', 'Total', 1, 'right'), col('hint', 'Hinweis', 'Hint', 1.5),
      ],
      rows: async (_user, params, language) => {
        const year = params.year ?? new Date().getFullYear();
        const totals = await this.totals.compute(year);
        return {
          subtitle: String(year),
          personIds: totals.map((t) => t.personId),
          rows: totals.map((t) => ({
            name: t.name,
            compensation: t.byKind['compensation'] ?? 0,
            flat: t.byKind['flat-rate'] ?? 0,
            loss: t.byKind['loss-of-earnings'] ?? 0,
            expenses: t.byKind['expenses'] ?? 0,
            total: t.total,
            hint: [t.aboveYear ? (language === 'de' ? 'über Jahresfreibetrag' : 'above annual allowance') : '', t.monthsAbove.length ? `${language === 'de' ? 'Monate' : 'months'} ${t.monthsAbove.join(', ')}` : ''].filter(Boolean).join('; '),
          })),
        };
      },
    };
  }
}
