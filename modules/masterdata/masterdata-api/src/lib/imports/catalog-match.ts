import type { LocalizedText } from '@forga/core-contracts';

interface Entry {
  key: string;
  name: LocalizedText;
  attributes: Record<string, unknown>;
}

const STOP_WORDS = new Set(['in', 'der', 'des', 'die', 'und', 'auf', 'bw', 'kreisebene', 'kre', 'lehrgang']);

/** Words of a name without gender forms ("/-frau", "/-in") and filler words; `brackets` also drops "(…)". */
function words(text: string, brackets: boolean): Set<string> {
  let value = text.toLowerCase().replace(/\/-?(frau|in)\b/g, '');
  if (brackets) value = value.replace(/\([^)]*\)/g, ' ');
  return new Set(value.split(/[^a-z0-9äöüß]+/).filter((w) => w && !STOP_WORDS.has(w)));
}

const same = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((w) => b.has(w));

/**
 * Catalog entry for a name from another program, e.g. "Truppführer, Lehrgang auf Kreisebene" → "Truppführer",
 * "Feuerwehr-Ehrenzeichen in Silber" → "Feuerwehr-Ehrenzeichen BW in Silber (25 Jahre)". Only unique matches count.
 */
export function matchCatalog<T extends Entry>(entries: readonly T[], text: string): T | undefined {
  const wanted = words(text, false);
  if (!wanted.size) return undefined;
  const names = (e: T) => [e.key, e.name.de, e.name.en, String(e.attributes['abbreviation'] ?? '')].filter(Boolean);
  const exact = entries.filter((e) => names(e).some((n) => same(words(n, false), wanted)));
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return undefined;
  // All words of the entry appear in the text; the most specific entry wins.
  const loose = words(text, true);
  const contained = entries
    .map((e) => ({ entry: e, size: Math.max(...names(e).map((n) => words(n, true)).filter((w) => w.size && [...w].every((x) => loose.has(x))).map((w) => w.size), 0) }))
    .filter((c) => c.size > 0)
    .toSorted((a, b) => b.size - a.size);
  return contained.length && (contained.length === 1 || contained[0].size > contained[1].size) ? contained[0].entry : undefined;
}
