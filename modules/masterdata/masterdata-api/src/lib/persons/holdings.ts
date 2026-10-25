import { ConflictException, Injectable } from '@nestjs/common';
import type { PersonHoldings } from '@forga/masterdata-contracts';

type Counter = (personId: string) => Promise<number>;

/** Collects what other modules count as held by a person (`PERSON_HOLDINGS`). */
@Injectable()
export class PersonHoldingsRegistry implements PersonHoldings {
  private readonly counters: { module: string; count: Counter }[] = [];

  register(module: string, count: Counter): void {
    this.counters.push({ module, count });
  }

  /** Throws `masterdata.personHoldsItems` with the modules if the person still holds anything. */
  async assertNothingHeld(personId: string): Promise<void> {
    const held = (await Promise.all(this.counters.map(async ({ module, count }) => ({ module, count: await count(personId) })))).filter((h) => h.count > 0);
    if (held.length) {
      throw new ConflictException({ code: 'masterdata.personHoldsItems', modules: held.map((h) => h.module), count: held.reduce((sum, h) => sum + h.count, 0) });
    }
  }
}
