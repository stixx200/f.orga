import { Injectable } from '@nestjs/common';
import { EntityManager, wrap } from '@mikro-orm/core';
import { berlinDate, type DeadlineInput, type DeadlineProvider } from '@forga/core-api';
import { FunctionHolderEntity, ItemEntity, RunEntity } from '../compensation.entities.js';
import { RUNS } from '../items/items.service.js';

const euro = (value: number) => value.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

/** Export and deadlines of the compensation module. */
@Injectable()
export class CompensationData implements DeadlineProvider {
  readonly module = 'compensation';

  constructor(private readonly em: EntityManager) {}

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
}
