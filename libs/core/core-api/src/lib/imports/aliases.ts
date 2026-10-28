import { ConflictException } from '@nestjs/common';
import { normalizeHeading } from './parse.js';

/** A record with the names an import matches it by and its aliases. */
export interface AliasOwner {
  /** Key, name, designation … – everything the record is matched by besides its aliases. */
  names: readonly string[];
  aliases: readonly string[];
}

const normalized = (texts: readonly string[]) => new Set(texts.map(normalizeHeading).filter(Boolean));

/** `true` if `value` equals one of the aliases (compared like headings: case, umlauts and punctuation do not matter). */
export function hasAlias(aliases: readonly string[] | undefined, value: string): boolean {
  const wanted = normalizeHeading(value);
  return !!wanted && !!aliases?.some((a) => normalizeHeading(a) === wanted);
}

/** The record whose alias is `value`, if any. */
export function findByAlias<T extends { aliases: readonly string[] }>(records: readonly T[], value: string): T | undefined {
  return records.find((r) => hasAlias(r.aliases, value));
}

/** Aliases trimmed, without duplicates and without those equal to one of the record's own names. */
export function cleanAliases(aliases: readonly string[], names: readonly string[]): string[] {
  const seen = normalized(names);
  const result: string[] = [];
  for (const alias of aliases) {
    const text = alias.trim();
    const key = normalizeHeading(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
}

/**
 * Throws `409 code` (with `alias`) if an alias equals a name or alias of another record of the same kind, so an
 * alias never points to two records.
 */
export function assertAliasesFree(code: string, aliases: readonly string[], others: readonly AliasOwner[]): void {
  const taken = normalized(others.flatMap((o) => [...o.names, ...o.aliases]));
  const alias = aliases.find((a) => taken.has(normalizeHeading(a)));
  if (alias !== undefined) throw new ConflictException({ code, alias });
}

/**
 * The aliases with `value` added, or `null` if nothing changes: the value already is a name or alias of the record,
 * or a name or alias of another record (`others`).
 */
export function withAlias(owner: AliasOwner, value: string, others: readonly AliasOwner[] = []): string[] | null {
  const key = normalizeHeading(value);
  if (!key || normalized([...owner.names, ...owner.aliases]).has(key)) return null;
  if (normalized(others.flatMap((o) => [...o.names, ...o.aliases])).has(key)) return null;
  return [...owner.aliases, value.trim()];
}
