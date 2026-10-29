import { Injectable } from '@nestjs/common';
import { EntityManager, wrap } from '@mikro-orm/core';
import { berlinDate, type DeadlineInput, type DeadlineProvider, type DescribeContext, type PersonDataSection, SettingsService } from '@forga/core-api';
import { CompensationSettings, type RunStatus } from '@forga/compensation-contracts';
import { FunctionHolderEntity, ItemEntity, RunEntity } from '../compensation.entities.js';
import { RUNS } from '../items/items.service.js';

const euro = (value: number) => value.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

/** Export and deadlines of the compensation module. */
@Injectable()
export class CompensationData implements DeadlineProvider {
  readonly module = 'compensation';

  constructor(
    private readonly em: EntityManager,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Loss of earnings without amount blocks the next run: remind those who prepare the runs. Payouts another way
   * (payees confirmed without IBAN when closing) stay a task for the treasury until marked as paid.
   */
  async deadlines(): Promise<DeadlineInput[]> {
    const em = this.em.fork();
    const runs = await em.find(RunEntity, { status: { $ne: 'draft' } });
    const payouts = runs.flatMap((run) =>
      (run.manualPayouts ?? [])
        .filter((p) => !p.paidAt)
        .map((p): DeadlineInput => ({
          id: `manual-payout:${run.id}:${p.key}`,
          kind: 'compensation-manual-payout',
          title: { de: `Ohne Bankverbindung auszahlen: ${euro(p.amount)}`, en: `Pay out without bank account: ${p.amount.toFixed(2)} €` },
          subject: { type: 'compensation.run', id: run.id, label: `${run.number} · ${p.name}` },
          dueOn: berlinDate(run.closedAt ?? new Date()),
          leadDays: 0,
          departmentIds: [],
          permission: RUNS,
          to: `/compensation/runs/${run.id}`,
        })),
    );
    const open = await em.find(ItemEntity, { kind: 'loss-of-earnings', amount: null, $or: [{ run: null }, { run: { status: 'draft' } }] });
    return [...payouts, ...open.map((i) => ({
      id: `loss-of-earnings:${i.id}`,
      kind: 'compensation-amount-missing',
      title: { de: 'Verdienstausfall: Betrag eintragen', en: 'Loss of earnings: enter amount' },
      subject: { type: 'compensation.item', id: i.id, label: i.label },
      personId: i.personId,
      dueOn: i.date,
      leadDays: 0,
      departmentIds: [],
      permission: RUNS,
    }))];
  }

  async exportAll(): Promise<Record<string, unknown>> {
    const em = this.em.fork();
    const plain = async <T extends object>(entity: new () => T) => (await em.find(entity, {})).map((e) => wrap(e).toObject());
    return { runs: await plain(RunEntity), items: await plain(ItemEntity), functionHolders: await plain(FunctionHolderEntity) };
  }

  async exportPerson(personId: string): Promise<Record<string, unknown>> {
    const em = this.em.fork();
    return {
      items: (await em.find(ItemEntity, { personId }, { orderBy: { date: 'asc' } })).map((e) => wrap(e).toObject()),
      functions: (await em.find(FunctionHolderEntity, { personId })).map((e) => wrap(e).toObject()),
    };
  }

  /**
   * Access report: items with amount, source and payout run (status, way of payment), sums per year, and the functions
   * with allowance the person holds. Bank accounts are kept in the person file (master data), not here.
   */
  async describePerson(personId: string, ctx: DescribeContext): Promise<PersonDataSection[]> {
    const em = this.em.fork();
    const items = await em.find(ItemEntity, { personId }, { populate: ['run'], orderBy: { date: 'desc' } });
    const functions = await em.find(FunctionHolderEntity, { personId }, { orderBy: { from: 'desc' } });
    if (!items.length && !functions.length) return [];
    const config = CompensationSettings.parse((await this.settings.get('compensation.general')) ?? {});
    const functionNames = new Map(config.functionAllowances.map((f) => [f.key, ctx.text(f.name)]));
    const kinds: Record<ItemEntity['kind'], string> = {
      compensation: ctx.t('Entschädigung nach Stunden', 'Hourly compensation'),
      'loss-of-earnings': ctx.t('Verdienstausfall', 'Loss of earnings'),
      'flat-rate': ctx.t('Pauschale', 'Flat rate'),
      expenses: ctx.t('Auslagen', 'Expenses'),
    };
    const sources: Record<ItemEntity['source'], string> = {
      incident: ctx.t('Einsatz', 'Incident'),
      training: ctx.t('Dienst', 'Session'),
      function: ctx.t('Funktion', 'Function'),
      manual: ctx.t('von Hand erfasst', 'entered by hand'),
      duty: ctx.t('Dienst als Einsatzleiter vom Dienst', 'Duty officer service'),
      course: ctx.t('Lehrgang', 'Course'),
    };
    const statuses: Record<RunStatus, string> = {
      draft: ctx.t('in Vorbereitung', 'in preparation'),
      closed: ctx.t('abgeschlossen', 'closed'),
      'handed-over': ctx.t('an die Kasse übergeben', 'handed over to the treasury'),
      paid: ctx.t('ausgezahlt', 'paid'),
    };
    const payout = (run: RunEntity | null | undefined) => {
      if (!run) return ctx.t('noch in keinem Lauf', 'not yet in a run');
      const manual = (run.manualPayouts ?? []).find((p) => p.personIds.includes(personId) && p.key === personId);
      const way = run.status === 'draft' ? '' : manual ? ctx.t(`ohne Bankverbindung, auf anderem Weg${manual.paidAt ? ` (bezahlt am ${ctx.date(manual.paidAt)})` : ''}`, `without bank account, another way${manual.paidAt ? ` (paid on ${ctx.date(manual.paidAt)})` : ''}`) : ctx.t('Überweisung', 'bank transfer');
      return [`${ctx.t('Lauf', 'Run')} ${run.number}`, statuses[run.status as RunStatus], run.paidAt ? ctx.date(run.paidAt) : '', way].filter(Boolean).join(', ');
    };
    const years = new Map<string, { count: number; amount: number; hours: number }>();
    for (const item of items) {
      const sum = years.get(item.date.slice(0, 4)) ?? { count: 0, amount: 0, hours: 0 };
      sum.count += 1;
      sum.amount += Number(item.amount ?? 0);
      sum.hours += Number(item.hours ?? 0);
      years.set(item.date.slice(0, 4), sum);
    }
    const blocks: PersonDataSection['blocks'] = [];
    if (items.length) {
      blocks.push({
        kind: 'table',
        title: ctx.t('Posten', 'Items'),
        columns: [ctx.t('Datum', 'Date'), ctx.t('Anlass', 'Occasion'), ctx.t('Art', 'Kind'), ctx.t('Stunden', 'Hours'), ctx.t('Betrag', 'Amount'), ctx.t('Auszahlung', 'Payout'), ctx.t('Bemerkung', 'Remark')],
        rows: items.map((i) => [
          ctx.date(i.date),
          [sources[i.source], i.label].filter(Boolean).join(': '),
          [kinds[i.kind], i.workingHours ? ctx.t('während der Arbeitszeit', 'during working hours') : '', i.correction ? ctx.t('Korrektur', 'correction') : ''].filter(Boolean).join(', '),
          typeof i.hours === 'number' ? ctx.number(i.hours, 2) : '–',
          ctx.money(i.amount === null || i.amount === undefined ? null : Number(i.amount)),
          payout(i.run),
          ctx.value(i.reason),
        ]),
        summary: [...years].map(([year, sum]) =>
          ctx.t(`${year}: ${sum.count} Posten, ${ctx.money(sum.amount)}`, `${year}: ${sum.count} items, ${ctx.money(sum.amount)}`),
        ),
      });
    }
    if (functions.length) {
      blocks.push({
        kind: 'table',
        title: ctx.t('Funktionen mit Aufwandsentschädigung', 'Functions with allowance'),
        columns: [ctx.t('Funktion', 'Function'), ctx.t('Von', 'From'), ctx.t('Bis', 'Until')],
        rows: functions.map((f) => [functionNames.get(f.functionKey) ?? ctx.t('Funktion (nicht mehr in der Satzung)', 'function (no longer in the statute)'), ctx.date(f.from), ctx.date(f.to)]),
      });
    }
    return [
      {
        key: 'compensation',
        title: ctx.t('Entschädigung', 'Compensation'),
        activity: 'compensation.payouts',
        categories: [ctx.t('Entschädigungsposten und Beträge', 'Compensation items and amounts'), ctx.t('Auszahlungen', 'Payouts'), ctx.t('Funktionen', 'Functions')],
        blocks,
        records: [
          { entity: 'compensation.item', ids: items.map((i) => i.id), label: ctx.t('Posten', 'Item') },
          { entity: 'compensation.function_holder', ids: functions.map((f) => f.id), label: ctx.t('Funktion', 'Function') },
        ],
      },
    ];
  }
}
