import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { defineEntity, EntityManager, p } from '@mikro-orm/core';
import { v7 as uuidv7 } from 'uuid';
import type { LocalizedText } from '@forga/core-contracts';
import { RequirePermissions, ZodPipe } from '@forga/core-api';
import {
  type ApplyTemplateResult,
  BW_CATALOG_TEMPLATE,
  CatalogAttributes,
  type CatalogEntry as CatalogEntryDto,
  CatalogEntryInput,
  CatalogKind,
  VEHICLE_STATISTICS_CATEGORIES,
} from '@forga/masterdata-contracts';
import { CatalogReferenceRegistry } from './references.js';

export const CatalogEntrySchema = defineEntity({
  name: 'CatalogEntry',
  schema: 'masterdata',
  tableName: 'catalog_entry',
  uniques: [{ properties: ['kind', 'key'] }],
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    kind: p.string().$type<CatalogKind>(),
    key: p.string(),
    name: p.json<LocalizedText>(),
    sortOrder: p.integer().default(0),
    active: p.boolean().default(true),
    attributes: p.json<Record<string, unknown>>(),
    version: p.integer().version(),
  },
});
export class CatalogEntry extends CatalogEntrySchema.class {}
CatalogEntrySchema.setClass(CatalogEntry);

type ParsedEntry = ReturnType<typeof CatalogEntryInput.parse>;

export function toCatalogDto(entry: CatalogEntry): CatalogEntryDto {
  return {
    id: entry.id,
    kind: entry.kind,
    key: entry.key,
    name: entry.name,
    sortOrder: entry.sortOrder,
    active: entry.active,
    attributes: entry.attributes,
    version: entry.version,
  };
}

@Injectable()
export class CatalogService {
  constructor(private readonly em: EntityManager) {}

  /** Throws `catalog.unknownKey` unless the key exists (and, for new references, is active). */
  async requireKey(kind: CatalogKind, key: string, em: EntityManager = this.em.fork()): Promise<CatalogEntry> {
    const entry = await em.findOne(CatalogEntry, { kind, key });
    if (!entry) throw new BadRequestException({ code: 'catalog.unknownKey', kind, key });
    return entry;
  }

  async requireKeys(kind: CatalogKind, keys: readonly string[], em: EntityManager = this.em.fork()): Promise<void> {
    const unique = [...new Set(keys)];
    const found = await em.count(CatalogEntry, { kind, key: { $in: unique } });
    if (found !== unique.length) throw new BadRequestException({ code: 'catalog.unknownKey', kind, keys: unique });
  }

  async attribute<T>(kind: CatalogKind, key: string, attribute: string): Promise<T | undefined> {
    const entry = await this.requireKey(kind, key);
    return entry.attributes[attribute] as T | undefined;
  }

  /** Adds all template entries whose key is missing; existing entries stay untouched. */
  async applyTemplate(entries: readonly ReturnType<typeof CatalogEntryInput.parse>[]): Promise<Record<string, number>> {
    const em = this.em.fork();
    const existing = await em.find(CatalogEntry, {}, { fields: ['kind', 'key'] });
    const known = new Set(existing.map((e) => `${e.kind}/${e.key}`));
    const added: Record<string, number> = {};
    for (const entry of entries) {
      if (known.has(`${entry.kind}/${entry.key}`)) continue;
      em.create(CatalogEntry, entry);
      added[entry.kind] = (added[entry.kind] ?? 0) + 1;
    }
    await em.flush();
    return added;
  }
}

function parseEntry(input: ParsedEntry): ParsedEntry {
  const attributes = CatalogAttributes[input.kind].safeParse(input.attributes);
  if (!attributes.success) {
    throw new BadRequestException({
      code: 'validation.failed',
      issues: attributes.error.issues.map((i) => ({ path: `attributes.${i.path.join('.')}`, code: i.code, message: i.message })),
    });
  }
  return { ...input, attributes: attributes.data };
}

@Controller('masterdata')
export class CatalogController {
  constructor(
    private readonly em: EntityManager,
    private readonly catalogs: CatalogService,
    private readonly references: CatalogReferenceRegistry,
  ) {}

  /** Catalogs are readable by every authenticated user (selection lists). */
  @Get('catalog')
  async list(@Query('kind') kind?: string): Promise<CatalogEntryDto[]> {
    const where = kind ? { kind: CatalogKind.parse(kind) } : {};
    const entries = await this.em.fork().find(CatalogEntry, where, { orderBy: { kind: 'asc', sortOrder: 'asc', key: 'asc' } });
    return entries.map(toCatalogDto);
  }

  @Post('catalog')
  @RequirePermissions('masterdata.catalogs.manage')
  async create(@Body(new ZodPipe(CatalogEntryInput)) input: ParsedEntry): Promise<CatalogEntryDto> {
    const em = this.em.fork();
    if (await em.count(CatalogEntry, { kind: input.kind, key: input.key })) {
      throw new ConflictException({ code: 'catalog.keyTaken', key: input.key });
    }
    const entry = em.create(CatalogEntry, parseEntry(input));
    await em.flush();
    return toCatalogDto(entry);
  }

  /** Kind and key are fixed once created; entries still in use are deactivated instead of deleted. */
  @Put('catalog/:id')
  @RequirePermissions('masterdata.catalogs.manage')
  async update(@Param('id') id: string, @Body(new ZodPipe(CatalogEntryInput)) input: ParsedEntry): Promise<CatalogEntryDto> {
    const em = this.em.fork();
    const entry = await em.findOne(CatalogEntry, id);
    if (!entry) throw new NotFoundException();
    if (entry.kind !== input.kind || entry.key !== input.key) {
      throw new BadRequestException({ code: 'catalog.keyImmutable' });
    }
    const { name, sortOrder, active, attributes } = parseEntry(input);
    em.assign(entry, { name, sortOrder, active, attributes });
    await em.flush();
    return toCatalogDto(entry);
  }

  /**
   * Deletes an entry nothing refers to. Otherwise `409 catalog.inUse` with the references per module (`usages`),
   * or `409 catalog.required` when a module's code relies on the entry.
   */
  @Delete('catalog/:id')
  @HttpCode(204)
  @RequirePermissions('masterdata.catalogs.manage')
  async remove(@Param('id') id: string): Promise<void> {
    const em = this.em.fork();
    const entry = await em.findOne(CatalogEntry, id);
    if (!entry) throw new NotFoundException();
    await this.references.assertDeletable(entry.kind, entry.key);
    await em.remove(entry).flush();
  }

  @Post('catalog/templates/bw')
  @RequirePermissions('masterdata.catalogs.manage')
  async applyBwTemplate(): Promise<ApplyTemplateResult> {
    const parsed = BW_CATALOG_TEMPLATE.map((entry) => parseEntry(CatalogEntryInput.parse(entry)));
    return { added: await this.catalogs.applyTemplate(parsed) };
  }

  /** Fixed vehicle positions F63–F120 of the annual statistics. */
  @Get('vehicle-statistics-categories')
  statisticsCategories() {
    return VEHICLE_STATISTICS_CATEGORIES;
  }
}
