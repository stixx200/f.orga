import { ConflictException, Injectable } from '@nestjs/common';
import type { CatalogKind, CatalogReferences, CatalogUsage } from '@forga/masterdata-contracts';

type Counter = (kind: CatalogKind, key: string) => Promise<number>;

/** Collects the catalog reference counters and the entries the code relies on of all modules (`CATALOG_REFERENCES`). */
@Injectable()
export class CatalogReferenceRegistry implements CatalogReferences {
  private readonly counters: { module: string; count: Counter }[] = [];
  private readonly required: { module: string; kind: CatalogKind; key: string }[] = [];

  register(module: string, count: Counter): void {
    this.counters.push({ module, count });
  }

  require(module: string, kind: CatalogKind, key: string): void {
    this.required.push({ module, kind, key });
  }

  /** References per module, only modules with at least one. */
  async usages(kind: CatalogKind, key: string): Promise<CatalogUsage[]> {
    const counts = await Promise.all(this.counters.map(async ({ module, count }) => ({ module, count: await count(kind, key) })));
    const byModule = new Map<string, number>();
    for (const { module, count } of counts) if (count > 0) byModule.set(module, (byModule.get(module) ?? 0) + count);
    return [...byModule].map(([module, count]) => ({ module, count }));
  }

  /**
   * Throws `catalog.required` (modules relying on the entry) or `catalog.inUse` (references per module)
   * unless the entry may be deleted.
   */
  async assertDeletable(kind: CatalogKind, key: string): Promise<void> {
    const requiredBy = [...new Set(this.required.filter((r) => r.kind === kind && r.key === key).map((r) => r.module))];
    if (requiredBy.length) throw new ConflictException({ code: 'catalog.required', kind, key, modules: requiredBy });
    const usages = await this.usages(kind, key);
    if (usages.length) {
      throw new ConflictException({ code: 'catalog.inUse', kind, key, usages, modules: usages.map((u) => u.module), count: usages.reduce((sum, u) => sum + u.count, 0) });
    }
  }
}
