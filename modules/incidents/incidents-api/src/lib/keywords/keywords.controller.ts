import { Body, ConflictException, Controller, Get, NotFoundException, Param, Post, Put } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { assertAliasesFree, cleanAliases, RequirePermissions, withAlias, ZodPipe } from '@forga/core-api';
import { type AlarmKeyword, AlarmKeywordInput, BW_KEYWORD_TEMPLATE } from '@forga/incidents-contracts';
import { AlarmKeywordEntity } from '../incidents.entities.js';

type ParsedKeyword = ReturnType<typeof AlarmKeywordInput.parse>;
const MANAGE = 'incidents.settings.manage';

/** What imports match an alarm keyword by besides its aliases. */
export function keywordNames(k: { key: string; name: { de: string; en: string } }): string[] {
  return [k.key, k.name.de, k.name.en];
}

const owner = (k: AlarmKeywordEntity) => ({ names: keywordNames(k), aliases: k.aliases });

/**
 * The aliases of a keyword without duplicates and own names. Throws `409 incidents.aliasTaken` if one is a key, name
 * or alias of another keyword.
 */
async function checkAliases(em: EntityManager, input: ParsedKeyword, own: AlarmKeywordEntity | null): Promise<string[]> {
  const aliases = cleanAliases(input.aliases ?? own?.aliases ?? [], keywordNames(input));
  if (aliases.length) assertAliasesFree('incidents.aliasTaken', aliases, (await em.find(AlarmKeywordEntity, {})).filter((k) => k.id !== own?.id).map(owner));
  return aliases;
}

/** Remembers a value of an import as alias of the keyword `key` (`ImportLookup.remember`). */
export async function rememberKeywordAlias(em: EntityManager, key: string, value: string): Promise<void> {
  const keywords = await em.find(AlarmKeywordEntity, {});
  const keyword = keywords.find((k) => k.key === key);
  if (!keyword) return;
  const aliases = withAlias(owner(keyword), value, keywords.filter((k) => k !== keyword).map(owner));
  if (!aliases) return;
  keyword.aliases = aliases;
  await em.flush();
}

function toDto(k: AlarmKeywordEntity): AlarmKeyword {
  return {
    id: k.id,
    key: k.key,
    name: k.name,
    mainType: k.mainType ?? null,
    technicalCategory: k.technicalCategory ?? null,
    falseAlarmType: k.falseAlarmType ?? null,
    requiresVehicle: k.requiresVehicle,
    compensationKind: k.compensationKind,
    active: k.active,
    aliases: k.aliases,
    version: k.version,
  };
}

/** Alarm keywords of the dispatch centre with statistics and compensation defaults. */
@Controller('incidents/keywords')
export class KeywordsController {
  constructor(private readonly em: EntityManager) {}

  @Get()
  async list(): Promise<AlarmKeyword[]> {
    return (await this.em.fork().find(AlarmKeywordEntity, {}, { orderBy: { key: 'asc' } })).map(toDto);
  }

  @Post()
  @RequirePermissions(MANAGE)
  async create(@Body(new ZodPipe(AlarmKeywordInput)) input: ParsedKeyword): Promise<AlarmKeyword> {
    const em = this.em.fork();
    if (await em.count(AlarmKeywordEntity, { key: input.key })) throw new ConflictException({ code: 'catalog.keyTaken', key: input.key });
    const keyword = em.create(AlarmKeywordEntity, { ...input, aliases: await checkAliases(em, input, null) });
    await em.flush();
    return toDto(keyword);
  }

  /** The key stays fixed because incidents refer to it. */
  @Put(':id')
  @RequirePermissions(MANAGE)
  async update(@Param('id') id: string, @Body(new ZodPipe(AlarmKeywordInput)) input: ParsedKeyword): Promise<AlarmKeyword> {
    const em = this.em.fork();
    const keyword = await em.findOne(AlarmKeywordEntity, id);
    if (!keyword) throw new NotFoundException();
    const { key: _key, ...rest } = input;
    em.assign(keyword, { ...rest, aliases: await checkAliases(em, { ...input, key: keyword.key }, keyword) });
    await em.flush();
    return toDto(keyword);
  }

  @Post('templates/bw')
  @RequirePermissions(MANAGE)
  async applyTemplate(): Promise<{ added: number }> {
    const em = this.em.fork();
    const existing = new Set((await em.find(AlarmKeywordEntity, {}, { fields: ['key'] })).map((k) => k.key));
    const missing = BW_KEYWORD_TEMPLATE.map((k) => AlarmKeywordInput.parse(k)).filter((k) => !existing.has(k.key));
    for (const keyword of missing) em.create(AlarmKeywordEntity, { ...keyword, aliases: keyword.aliases ?? [] });
    await em.flush();
    return { added: missing.length };
  }
}
