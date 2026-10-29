import { Inject, Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { round2, type YearTotal } from '@forga/compensation-contracts';
import { PERSON_DIRECTORY, type PersonDirectory } from '@forga/masterdata-contracts';
import { ItemEntity } from '../compensation.entities.js';
import { ItemsService } from '../items/items.service.js';

/** Annual totals per person, split by kind, with the hint on the tax-free amounts (R 3.12 LStR). */
@Injectable()
export class YearTotals {
  constructor(
    private readonly em: EntityManager,
    private readonly items: ItemsService,
    @Inject(PERSON_DIRECTORY) private readonly directory: PersonDirectory,
  ) {}

  async compute(year: number): Promise<YearTotal[]> {
    const config = await this.items.config();
    const all = await this.em.fork().find(ItemEntity, { date: { $gte: `${year}-01-01`, $lte: `${year}-12-31` } });
    // Persons whose processing is restricted (Art. 18) are left out of the totals.
    const restricted = await this.directory.restrictedIds([...new Set(all.map((i) => i.personId))]);
    const items = all.filter((i) => !restricted.has(i.personId));
    const names = new Map((await this.directory.snapshots([...new Set(items.map((i) => i.personId))])).map((p) => [p.id, `${p.lastName}, ${p.firstName}`]));
    const byPerson = new Map<string, ItemEntity[]>();
    for (const item of items) byPerson.set(item.personId, [...(byPerson.get(item.personId) ?? []), item]);
    return [...byPerson]
      .map(([personId, list]) => {
        const byKind: Record<string, number> = {};
        const months = Array.from({ length: 12 }, () => 0);
        for (const item of list) {
          const amount = Number(item.amount ?? 0);
          byKind[item.kind] = round2((byKind[item.kind] ?? 0) + amount);
          // Loss of earnings is a reimbursement, not compensation: it does not count for the tax-free amounts.
          if (item.kind !== 'loss-of-earnings' && item.kind !== 'expenses') months[Number(item.date.slice(5, 7)) - 1] += amount;
        }
        const total = round2(Object.values(byKind).reduce((s, v) => s + v, 0));
        const taxable = months.reduce((s, v) => s + v, 0);
        return {
          personId,
          name: names.get(personId) ?? '–',
          byKind,
          total,
          monthsAbove: months.flatMap((value, index) => (value > config.taxFreePerMonth ? [index + 1] : [])),
          aboveYear: taxable > config.taxFreePerYear,
        };
      })
      .toSorted((a, b) => a.name.localeCompare(b.name));
  }
}
