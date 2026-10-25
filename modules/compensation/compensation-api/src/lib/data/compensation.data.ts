import { Injectable } from '@nestjs/common';
import { EntityManager, wrap } from '@mikro-orm/core';
import type { DeadlineInput, DeadlineProvider } from '@forga/core-api';
import { FunctionHolderEntity, ItemEntity, RunEntity } from '../compensation.entities.js';
import { RUNS } from '../items/items.service.js';

/** Export and deadlines of the compensation module. */
@Injectable()
export class CompensationData implements DeadlineProvider {
  readonly module = 'compensation';

  constructor(private readonly em: EntityManager) {}

  /** Loss of earnings without amount blocks the next run: remind those who prepare the runs. */
  async deadlines(): Promise<DeadlineInput[]> {
    const open = await this.em.fork().find(ItemEntity, { kind: 'loss-of-earnings', amount: null, $or: [{ run: null }, { run: { status: 'draft' } }] });
    return open.map((i) => ({
      id: `loss-of-earnings:${i.id}`,
      kind: 'compensation-amount-missing',
      title: { de: 'Verdienstausfall: Betrag eintragen', en: 'Loss of earnings: enter amount' },
      subject: { type: 'compensation.item', id: i.id, label: i.label },
      dueOn: i.date,
      leadDays: 0,
      departmentIds: [],
      permission: RUNS,
    }));
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
