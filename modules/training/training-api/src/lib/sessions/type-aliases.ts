import { EntityManager } from '@mikro-orm/core';
import { assertAliasesFree, cleanAliases, withAlias } from '@forga/core-api';
import type { LocalizedText } from '@forga/core-contracts';
import { SessionTypeEntity } from '../training.entities.js';

/** What imports match a session type by besides its aliases. */
export function typeNames(type: { key: string; name: LocalizedText }): string[] {
  return [type.key, type.name.de, type.name.en];
}

const owner = (type: SessionTypeEntity) => ({ names: typeNames(type), aliases: type.aliases });

/**
 * The aliases of a session type without duplicates and own names. Throws `409 training.aliasTaken` if one is a key,
 * name or alias of another type.
 */
export async function checkTypeAliases(em: EntityManager, input: { key: string; name: LocalizedText; aliases?: string[] }, own: SessionTypeEntity | null): Promise<string[]> {
  const aliases = cleanAliases(input.aliases ?? own?.aliases ?? [], typeNames(input));
  if (aliases.length) assertAliasesFree('training.aliasTaken', aliases, (await em.find(SessionTypeEntity, {})).filter((t) => t.id !== own?.id).map(owner));
  return aliases;
}

/** Remembers a value of an import as alias of the session type `key` (`ImportLookup.remember`). */
export async function rememberTypeAlias(em: EntityManager, key: string, value: string): Promise<void> {
  const types = await em.find(SessionTypeEntity, {});
  const type = types.find((t) => t.key === key);
  if (!type) return;
  const aliases = withAlias(owner(type), value, types.filter((t) => t !== type).map(owner));
  if (!aliases) return;
  type.aliases = aliases;
  await em.flush();
}
