import type { ComboboxItem, ComboboxParsedItem, OptionsFilter } from '@mantine/core';

/** Words of a search input; names are written in several orders ("Funke, Felix", "Felix Funke"). */
export function searchWords(query: string): string[] {
  return query.toLocaleLowerCase('de').split(/[\s,;]+/).filter(Boolean);
}

/** Every word of the search appears in one of the values, in any order. An empty search matches everything. */
export function matchesSearch(values: (string | null | undefined)[], query: string): boolean {
  const words = searchWords(query);
  if (!words.length) return true;
  const text = values.filter(Boolean).join(' ').toLocaleLowerCase('de');
  return words.every((word) => text.includes(word));
}

const isGroup = (item: ComboboxParsedItem): item is { group: string; items: ComboboxItem[] } => 'group' in item;

/** Filter of the selection fields (default in the theme): "Felix" and "Felix Funke" both find "Funke, Felix". */
export const wordsFilter: OptionsFilter = ({ options, search, limit }) => {
  const result: ComboboxParsedItem[] = [];
  for (const item of options) {
    if (result.length >= limit) break;
    if (isGroup(item)) {
      const items = item.items.filter((option) => matchesSearch([option.label], search));
      if (items.length) result.push({ ...item, items });
    } else if (matchesSearch([(item as ComboboxItem).label], search)) {
      result.push(item);
    }
  }
  return result;
};
