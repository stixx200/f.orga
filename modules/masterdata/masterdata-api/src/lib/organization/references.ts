import { ConflictException, Injectable } from '@nestjs/common';
import type { OrganizationObject, OrganizationReferences } from '@forga/masterdata-contracts';

type Counter = (kind: OrganizationObject, id: string) => Promise<number>;

/** Collects the reference counters of other modules (`ORGANIZATION_REFERENCES`). */
@Injectable()
export class OrganizationReferenceRegistry implements OrganizationReferences {
  private readonly counters: { module: string; count: Counter }[] = [];

  register(module: string, count: Counter): void {
    this.counters.push({ module, count });
  }

  /** Throws `masterdata.inUse` with the referencing modules if any module still refers to the object. */
  async assertUnused(kind: OrganizationObject, id: string): Promise<void> {
    const usages = await Promise.all(this.counters.map(async ({ module, count }) => ({ module, count: await count(kind, id) })));
    const used = usages.filter((u) => u.count > 0);
    if (used.length) {
      throw new ConflictException({ code: 'masterdata.inUse', kind, modules: used.map((u) => u.module), count: used.reduce((sum, u) => sum + u.count, 0) });
    }
  }
}
