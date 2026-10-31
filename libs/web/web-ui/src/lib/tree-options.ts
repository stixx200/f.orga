const SEPARATOR = ' › ';

type TreeEntry = { key: string; parentKey?: string | null };

/**
 * Label of an entry as the path from the root ("Atemschutz › Maske").
 * The closed selection field shows this label, so the parent stays visible after choosing a child.
 * An unknown key is returned unchanged.
 */
export function treeLabel<T extends TreeEntry>(entries: T[], key: string, labelOf: (entry: T) => string): string {
  const byKey = new Map(entries.map((entry) => [entry.key, entry]));
  const names: string[] = [];
  const seen = new Set<string>();
  let current = byKey.get(key);
  while (current && !seen.has(current.key)) {
    seen.add(current.key);
    names.unshift(labelOf(current));
    const parent = current.parentKey;
    current = parent && parent !== current.key ? byKey.get(parent) : undefined;
  }
  return names.join(SEPARATOR) || key;
}

/**
 * Options in tree order: depth-first, siblings by their own label (German, ignoring case).
 * Entries of a cycle or with an unknown parent count as top level. `exclude` drops one key;
 * `include` limits which keys are offered. The path still uses every entry, so a child keeps its parent in the label.
 */
export function treeOptions<T extends TreeEntry>(
  entries: T[],
  labelOf: (entry: T) => string,
  options?: { exclude?: string; include?: (entry: T) => boolean },
): { value: string; label: string }[] {
  const byKey = new Map(entries.map((entry) => [entry.key, entry]));
  const children = new Map<string | null, T[]>();
  for (const entry of entries) {
    const parent = entry.parentKey && byKey.has(entry.parentKey) && entry.parentKey !== entry.key ? entry.parentKey : null;
    children.set(parent, [...(children.get(parent) ?? []), entry]);
  }
  for (const list of children.values()) {
    list.sort((a, b) => labelOf(a).localeCompare(labelOf(b), 'de', { sensitivity: 'base' }));
  }
  const result: { value: string; label: string }[] = [];
  const seen = new Set<string>();
  const walk = (entry: T) => {
    if (seen.has(entry.key)) return;
    seen.add(entry.key);
    const offered = entry.key !== options?.exclude && (options?.include?.(entry) ?? true);
    if (offered) result.push({ value: entry.key, label: treeLabel(entries, entry.key, labelOf) });
    for (const child of children.get(entry.key) ?? []) walk(child);
  };
  for (const entry of children.get(null) ?? []) walk(entry);
  for (const entry of entries) walk(entry);
  return result;
}
