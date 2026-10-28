import { Body, ConflictException, Controller, Get, NotFoundException, Param, Post, Put } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { RequirePermissions, ZodPipe } from '@forga/core-api';
import { type AlarmKeyword, AlarmKeywordInput, BW_KEYWORD_TEMPLATE } from '@forga/incidents-contracts';
import { AlarmKeywordEntity } from '../incidents.entities.js';

type ParsedKeyword = ReturnType<typeof AlarmKeywordInput.parse>;
const MANAGE = 'incidents.settings.manage';

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
    const keyword = em.create(AlarmKeywordEntity, input);
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
    em.assign(keyword, rest);
    await em.flush();
    return toDto(keyword);
  }

  @Post('templates/bw')
  @RequirePermissions(MANAGE)
  async applyTemplate(): Promise<{ added: number }> {
    const em = this.em.fork();
    const existing = new Set((await em.find(AlarmKeywordEntity, {}, { fields: ['key'] })).map((k) => k.key));
    const missing = BW_KEYWORD_TEMPLATE.map((k) => AlarmKeywordInput.parse(k)).filter((k) => !existing.has(k.key));
    for (const keyword of missing) em.create(AlarmKeywordEntity, keyword);
    await em.flush();
    return { added: missing.length };
  }
}
