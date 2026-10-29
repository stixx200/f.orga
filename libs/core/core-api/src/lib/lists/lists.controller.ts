import { BadRequestException, Controller, Get, NotFoundException, Param, Query, Res } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import type { Response } from 'express';
import {
  type BrigadeSettings,
  type Language,
  LANGUAGES,
  LIST_FORMATS,
  type ListData,
  type ListFormat,
  type ListInfo,
  type ListOption,
} from '@forga/core-contracts';
import { Audit } from '../audit/audit.js';
import type { AuthenticatedUser } from '../security/authenticated-user.js';
import { CurrentUser } from '../security/decorators.js';
import { OrganizationDirectory } from '../security/organization-directory.js';
import { brigadeLogoDataUrl } from '../settings/assets.js';
import { SettingsService } from '../settings/settings.js';
import { ZodPipe } from '../zod.pipe.js';
import { ListRegistry } from './list-registry.js';
import { renderCsv, renderPdf, renderXlsx } from './renderers.js';

const CONTENT_TYPES: Record<ListFormat, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv; charset=utf-8',
};

const MAX_OPTIONS = 50;

/** Query parameters of the list; `lang` selects the output language (default: the user's language). */
type Query = Record<string, string | undefined> & { lang?: string };

@Controller('core/lists')
export class ListsController {
  constructor(
    private readonly registry: ListRegistry,
    private readonly settings: SettingsService,
    private readonly audit: Audit,
    private readonly em: EntityManager,
    private readonly organization: OrganizationDirectory,
  ) {}

  @Get()
  available(@CurrentUser() user: AuthenticatedUser): ListInfo[] {
    return this.registry.available(user);
  }

  /** Choices of a `person` or `choice` parameter matching the typed text `q` (at most 50). */
  @Get(':id/parameters/:key/options')
  async options(@Param('id') id: string, @Param('key') key: string, @Query('q') query: string | undefined, @CurrentUser() user: AuthenticatedUser): Promise<ListOption[]> {
    const entry = this.registry.get(id);
    if (!entry || !user.holds(entry.definition.permission)) throw new NotFoundException();
    if (!user.can(entry.definition.permission)) throw user.stepUpRequired();
    const parameter = entry.definition.parameters?.find((p) => p.key === key);
    if (!parameter || (parameter.type !== 'person' && parameter.type !== 'choice')) throw new NotFoundException();
    const q = (query ?? '').trim().slice(0, 100);
    if (parameter.choices) return (await parameter.choices(user, q, user.language)).slice(0, MAX_OPTIONS);
    if (parameter.type !== 'person' || q.length < 2) return [];
    return (await this.organization.searchPersons(user, q, MAX_OPTIONS)).map((p) => ({ value: p.id, label: p.label }));
  }

  /** The list content for the preview in the UI. */
  @Get(':id')
  async data(@Param('id') id: string, @Query() query: Query, @CurrentUser() user: AuthenticatedUser): Promise<ListData> {
    return (await this.build(id, query, user)).data;
  }

  @Get(':id/export/:format')
  async export(
    @Param('id') id: string,
    @Param('format') format: string,
    @Query() query: Query,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ): Promise<void> {
    if (!LIST_FORMATS.includes(format as ListFormat)) throw new BadRequestException({ code: 'lists.unknownFormat' });
    const { data, definition, language, params, personIds } = await this.build(id, query, user);
    const context = {
      data,
      language,
      brigade: await this.settings.get<BrigadeSettings>('brigade'),
      logo: await brigadeLogoDataUrl(this.em),
      signatureColumn: definition.signatureColumn ?? false,
      orientation: definition.orientation ?? 'portrait',
      now: new Date(),
    };
    const file =
      format === 'pdf' ? await renderPdf(context) : format === 'xlsx' ? await renderXlsx(context) : renderCsv(context);
    // Parameters and the persons named: a lost printout can be traced to the persons affected (data breach).
    await this.audit.log('lists.exported', { listId: id, format, rows: data.rows.length, params, ...(personIds ? { personIds } : {}) });

    const name = `${data.title.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || id}.${format}`;
    res.setHeader('Content-Type', CONTENT_TYPES[format as ListFormat]);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
    res.send(file);
  }

  private async build(id: string, query: Query, user: AuthenticatedUser) {
    const entry = this.registry.get(id);
    if (!entry || !user.holds(entry.definition.permission)) throw new NotFoundException();
    if (!user.can(entry.definition.permission)) throw user.stepUpRequired();
    const { definition } = entry;
    const { lang, ...params } = query;
    const language: Language = LANGUAGES.includes(lang as Language) ? (lang as Language) : user.language;
    const parsed = new ZodPipe(definition.schema).transform(
      Object.fromEntries(Object.entries(params).filter(([, value]) => value !== '')),
    );
    const content = await definition.rows(user, parsed, language);
    const data: ListData = {
      title: definition.name[language],
      subtitle: content.subtitle,
      columns: content.columns ?? definition.columns,
      rows: content.rows,
    };
    return { data, definition, language, params: parsed as Record<string, unknown>, personIds: content.personIds ? [...new Set(content.personIds)] : null };
  }
}
