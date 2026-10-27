import type { CatalogKind } from '@forga/masterdata-contracts';
import type { Condition, PromotionSettings } from '@forga/promotions-contracts';

/** How often the promotion rules refer to the catalog entry: target rank and the rank, qualification and office conditions. */
export function ruleReferences(config: PromotionSettings, kind: CatalogKind, key: string): number {
  const inCondition = (c: Condition): number => {
    switch (c.type) {
      case 'and':
      case 'or':
        return c.children.reduce((sum, child) => sum + inCondition(child), 0);
      case 'rank':
        return kind === 'rank' && c.ranks.includes(key) ? 1 : 0;
      case 'qualification':
        return kind === 'qualification' && c.keys.includes(key) ? 1 : 0;
      case 'office':
        return kind === 'office' && c.keys.includes(key) ? 1 : 0;
      default:
        return 0;
    }
  };
  return config.rules.reduce((sum, rule) => sum + (kind === 'rank' && rule.rank === key ? 1 : 0) + inCondition(rule.condition), 0);
}
