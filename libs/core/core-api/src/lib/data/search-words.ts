/**
 * Words of a search input. Names are written in several orders ("Funke, Felix", "Felix Funke"), so searches match
 * each word on its own instead of the whole input.
 */
export function searchWords(query: string): string[] {
  return query
    .split(/[\s,;]+/)
    .map((word) => word.trim())
    .filter(Boolean)
    .slice(0, 8);
}

/** `ILIKE` pattern that finds the word anywhere; `%`, `_` and `\` in the input are taken literally. */
export function likeWord(word: string): string {
  return `%${word.replace(/[\\%_]/g, '\\$&')}%`;
}

/**
 * Condition for MikroORM: every word appears in at least one of the fields, in any order. `extra` adds further
 * alternatives per word (e.g. a field only some users may search). Empty input gives `null` (no condition).
 */
export function wordsWhere(query: string, fields: string[], extra: (like: string) => object[] = () => []): { $and: object[] } | null {
  const words = searchWords(query);
  if (!words.length) return null;
  return {
    $and: words.map((word) => {
      const like = likeWord(word);
      return { $or: [...fields.map((field) => ({ [field]: { $ilike: like } })), ...extra(like)] };
    }),
  };
}
