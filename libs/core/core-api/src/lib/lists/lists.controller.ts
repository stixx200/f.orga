import { BadRequestException, Controller, ForbiddenException, Get, NotFoundException, Param, Query, Res } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import type { Response } from 'express';
import {
  type BrigadeSettings,
  type Language,
  LANGUAGES,
  LIST_FORMATS,
  LIST_PURPOSE_OTHER,
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
import { type ListDefinition, ListRegistry, purposeRequired, purposesFor } from './list-registry.js';
import { renderCsv, renderPdf, renderXlsx } from './renderers.js';

const CONTENT_TYPES: Record<ListFormat, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv; charset=utf-8',
};

const MAX_OPTIONS = 50;

/**
 * Query parameters of the list; `lang` selects the output language (default: the user's language), `purpose` the purpose
 * (with `purposeNote` for `other`).
 */
type Query = Record<string, string | undefined> & { lang?: string; purpose?: string; purposeNote?: string };

/** The purpose of a run of the list: its key and the text shown on the export. */
interface ChosenPurpose {
  key: string;
  text: string;
  note: string | null;
  columns: string[] | null;
}

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
    return (await this.build(id, query, user, false)).data;
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
    const { data, definition, language, params, personIds, purpose } = await this.build(id, query, user, true);
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
    // Parameters, purpose and the persons named: a lost printout can be traced to the persons affected (data breach).
    await this.audit.log('lists.exported', {
      listId: id,
      format,
      rows: data.rows.length,
      params,
      ...(purpose ? { purpose: purpose.key, ...(purpose.note ? { purposeNote: purpose.note } : {}) } : {}),
      ...(personIds ? { personIds } : {}),
    });

    const name = `${data.title.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || id}.${format}`;
    // ASCII `filename` keeps Playwright/`suggestedFilename` reliable; `filename*` carries the real UTF-8 name.
    const ascii = `${id}.${format}`.replace(/[^\w.-]+/g, '_');
    res.setHeader('Content-Type', CONTENT_TYPES[format as ListFormat]);
    res.setHeader('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`);
    res.send(file);
  }

  private async build(id: string, query: Query, user: AuthenticatedUser, exporting: boolean) {
    const entry = this.registry.get(id);
    if (!entry || !user.holds(entry.definition.permission)) throw new NotFoundException();
    if (!user.can(entry.definition.permission)) throw user.stepUpRequired();
    const { definition } = entry;
    const { lang, purpose: purposeKey, purposeNote, ...params } = query;
    const language: Language = LANGUAGES.includes(lang as Language) ? (lang as Language) : user.language;
    const purpose = this.purpose(definition, user, language, purposeKey, purposeNote, exporting);
    const parsed = new ZodPipe(definition.schema).transform(
      Object.fromEntries(Object.entries(params).filter(([, value]) => value !== '')),
    );
    const content = await definition.rows(user, parsed, language, purpose?.key ?? null);
    const columns = content.columns ?? definition.columns;
    // Only the columns the purpose needs (data minimisation, L11).
    const shown = purpose?.columns ? columns.filter((c) => purpose.columns!.includes(c.key)) : columns;
    const data: ListData = {
      title: definition.name[language],
      subtitle: content.subtitle,
      columns: shown,
      rows: purpose?.columns ? content.rows.map((row) => Object.fromEntries(shown.map((c) => [c.key, row[c.key] ?? null]))) : content.rows,
      personalData: Boolean(definition.personalData) || Boolean(content.personIds?.length),
      purpose: purpose?.text ?? null,
    };
    return {
      data,
      definition,
      language,
      purpose,
      params: parsed as Record<string, unknown>,
      personIds: content.personIds ? [...new Set(content.personIds)] : null,
    };
  }

  /**
   * The chosen purpose: one of the list (if the user may choose it) or `other` with a description. Exports of lists with
   * contact, sensitive or health data need one; the preview takes the first purpose of the list by default.
   */
  private purpose(definition: ListDefinition<unknown>, user: AuthenticatedUser, language: Language, key: string | undefined, note: string | undefined, exporting: boolean): ChosenPurpose | null {
    const offered = purposesFor(definition as ListDefinition<never>, user);
    if (!key) {
      if (exporting && purposeRequired(definition as ListDefinition<never>)) throw new BadRequestException({ code: 'lists.purposeRequired' });
      const first = offered.find((p) => p.key !== LIST_PURPOSE_OTHER && (!p.permission || user.can(p.permission)));
      return first ? { key: first.key, text: first.label[language], note: null, columns: first.columns ?? null } : null;
    }
    const all = [...(definition.purposes ?? []), ...offered];
    const chosen = all.find((p) => p.key === key);
    if (!chosen) throw new BadRequestException({ code: 'lists.unknownPurpose' });
    if ('permission' in chosen && chosen.permission && !user.can(chosen.permission)) {
      if (user.holds(chosen.permission)) throw user.stepUpRequired();
      throw new ForbiddenException({ code: 'lists.purposeForbidden' });
    }
    if (key === LIST_PURPOSE_OTHER) {
      const text = (note ?? '').trim().slice(0, 200);
      if (text.length < 3) throw new BadRequestException({ code: 'lists.purposeNoteRequired' });
      return { key, text, note: text, columns: null };
    }
    return { key, text: chosen.label[language], note: null, columns: chosen.columns ?? null };
  }
}
