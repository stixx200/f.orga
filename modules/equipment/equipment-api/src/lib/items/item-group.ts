import { createHash } from 'node:crypto';

/** Files of items with the same category, type and name are stored under this id. */
export function equipmentGroupKey(item: { categoryKey: string; typeKey?: string | null; name: string }): string {
  return `group:${createHash('sha256').update([item.categoryKey, item.typeKey ?? '', item.name.trim()].join('\0')).digest('hex')}`;
}
