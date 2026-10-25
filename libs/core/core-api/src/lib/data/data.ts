import {
  Body,
  Controller,
  Get,
  HttpCode,
  Injectable,
  NotFoundException,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import type { Response } from 'express';
import { type PrivacySettings, type RetentionResult, RetentionRun, type SearchHit } from '@forga/core-contracts';
import { Audit, AuditEntry } from '../audit/audit.js';
import type { AuthenticatedUser } from '../security/authenticated-user.js';
import { CurrentUser, RequirePermissions } from '../security/decorators.js';
import { SettingsService } from '../settings/settings.js';
import { IMPORT_EXPIRY_MS, ImportUploadEntity } from '../imports/imports.js';
import { ImportTransferEntity } from '../imports/transfers.js';
import { ZodPipe } from '../zod.pipe.js';

export const EXPORT_PERMISSION = 'core.data.export';

// ----- Global search -----

export type SearchSource = (user: AuthenticatedUser, query: string) => Promise<SearchHit[]>;

/** Modules contribute hits to the global search; each source checks the permissions of the user itself. */
@Injectable()
export class SearchRegistry {
  private readonly sources: { module: string; source: SearchSource }[] = [];

  register(module: string, source: SearchSource): void {
    this.sources.push({ module, source });
  }

  async search(user: AuthenticatedUser, query: string): Promise<SearchHit[]> {
    const results = await Promise.all(
      this.sources.filter((s) => user.canAnythingIn(s.module)).map((s) => s.source(user, query).catch((): SearchHit[] => [])),
    );
    return results.flat();
  }
}

/** Finds the item with a scanned code: exact barcode, RFID chip, inventory or serial number, or the URL of a label. */
export type CodeSource = (user: AuthenticatedUser, code: string) => Promise<SearchHit[]>;

/** Modules with labeled items (equipment, clothing) resolve scanned codes; each source checks the permissions itself. */
@Injectable()
export class CodeRegistry {
  private readonly sources: { module: string; source: CodeSource }[] = [];

  register(module: string, source: CodeSource): void {
    this.sources.push({ module, source });
  }

  /** Modules whose codes the user may look up; without any, the shell hides the input mask. */
  modules(user: AuthenticatedUser): string[] {
    return [...new Set(this.sources.filter((s) => user.canAnythingIn(s.module)).map((s) => s.module))];
  }

  async lookup(user: AuthenticatedUser, code: string): Promise<SearchHit[]> {
    const results = await Promise.all(
      this.sources.filter((s) => user.canAnythingIn(s.module)).map((s) => s.source(user, code).catch((): SearchHit[] => [])),
    );
    return results.flat();
  }
}

// ----- Full export and data access request -----

export interface ExportSource {
  /** All data of the module, with IDs, as plain JSON. */
  all(): Promise<Record<string, unknown>>;
  /** Everything the module stores about a person (data access request, Art. 15 GDPR). */
  person?(personId: string): Promise<Record<string, unknown>>;
}

@Injectable()
export class ExportRegistry {
  readonly sources = new Map<string, ExportSource>();

  register(module: string, source: ExportSource): void {
    this.sources.set(module, source);
  }
}

// ----- Retention -----

export interface RetentionRule {
  /** Applies the rule (or only counts when `dryRun`); returns the number of affected records. */
  run(settings: PrivacySettings, dryRun: boolean): Promise<number>;
}

/** Deletion and anonymisation rules; the core deletes old audit entries, modules add their own rules. */
@Injectable()
export class RetentionRegistry {
  readonly rules = new Map<string, RetentionRule>();

  register(key: string, rule: RetentionRule): void {
    this.rules.set(key, rule);
  }
}

const DAY_MS = 24 * 60 * 60_000;

@Injectable()
export class RetentionService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private first?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly em: EntityManager,
    private readonly registry: RetentionRegistry,
    private readonly settings: SettingsService,
    private readonly audit: Audit,
  ) {}

  /**
   * Runs a minute after the start and then once a day, so it also runs when the server is restarted daily;
   * switched off with `FORGA_RETENTION_SCHEDULER=off` (tests, or to apply the rules only by hand).
   * Persons are only anonymised once an administrator has chosen a period (default: never).
   */
  onApplicationBootstrap(): void {
    if (process.env.FORGA_RETENTION_SCHEDULER === 'off') return;
    this.first = setTimeout(() => void this.run(false).catch(() => undefined), 60_000);
    this.first.unref();
    this.timer = setInterval(() => void this.run(false).catch(() => undefined), DAY_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearTimeout(this.first);
    clearInterval(this.timer);
  }

  /** `overrides` only for dry runs: what would other values affect, before they are saved. */
  async run(dryRun: boolean, overrides: Partial<PrivacySettings> = {}): Promise<RetentionResult> {
    const stored = (await this.settings.get<PrivacySettings>('privacy')) as PrivacySettings;
    const settings: PrivacySettings = dryRun ? { ...stored, ...Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== undefined)) } : stored;
    const counts: Record<string, number> = {};
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - settings.auditRetentionMonths);
    const em = this.em.fork();
    counts['core.audit'] = dryRun ? await em.count(AuditEntry, { timestamp: { $lt: cutoff } }) : await em.nativeDelete(AuditEntry, { timestamp: { $lt: cutoff } });
    // Uploaded import files and data transfers hold personal data; nobody needs them after a day.
    const expired = { createdAt: { $lt: new Date(Date.now() - IMPORT_EXPIRY_MS) } };
    counts['core.imports'] = dryRun
      ? (await em.count(ImportUploadEntity, expired)) + (await em.count(ImportTransferEntity, expired))
      : (await em.nativeDelete(ImportUploadEntity, expired)) + (await em.nativeDelete(ImportTransferEntity, expired));
    for (const [key, rule] of this.registry.rules) counts[key] = await rule.run(settings, dryRun);
    if (!dryRun && Object.values(counts).some((c) => c > 0)) await this.audit.log('privacy.retention-applied', counts, null);
    return { dryRun, counts };
  }
}

@Controller('core')
export class DataController {
  constructor(
    private readonly search: SearchRegistry,
    private readonly codes: CodeRegistry,
    private readonly exports: ExportRegistry,
    private readonly retention: RetentionService,
    private readonly audit: Audit,
  ) {}

  @Get('search')
  find(@Query('q') query: string | undefined, @CurrentUser() user: AuthenticatedUser): Promise<SearchHit[]> {
    const q = (query ?? '').trim();
    return q.length < 2 ? Promise.resolve([]) : this.search.search(user, q);
  }

  /** Items carrying a scanned barcode or RFID chip (input mask "Code suchen"). */
  @Get('codes')
  code(@Query('code') code: string | undefined, @CurrentUser() user: AuthenticatedUser): Promise<SearchHit[]> {
    const value = (code ?? '').trim().slice(0, 500);
    return value ? this.codes.lookup(user, value) : Promise.resolve([]);
  }

  @Get('codes/modules')
  codeModules(@CurrentUser() user: AuthenticatedUser): string[] {
    return this.codes.modules(user);
  }

  /** Modules that offer a full export. */
  @Get('export')
  @RequirePermissions(EXPORT_PERMISSION)
  modules(): string[] {
    return [...this.exports.sources.keys()];
  }

  /** Full export of one module as versioned JSON file. */
  @Get('export/:module')
  @RequirePermissions(EXPORT_PERMISSION)
  async export(@Param('module') module: string, @Res() res: Response): Promise<void> {
    const source = this.exports.sources.get(module);
    if (!source) throw new NotFoundException();
    const exportedAt = new Date();
    const body = { format: 'forga.export', version: 1, module, exportedAt: exportedAt.toISOString(), data: await source.all() };
    await this.audit.log('data.exported', { module });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="forga-${module}-${exportedAt.toISOString().slice(0, 10)}.json"`);
    res.send(JSON.stringify(body, null, 2));
  }

  /** Everything stored about a person across all modules (data access request). */
  @Get('export/person/:personId')
  @RequirePermissions(EXPORT_PERMISSION)
  async person(@Param('personId') personId: string, @Res() res: Response): Promise<void> {
    const data: Record<string, unknown> = {};
    for (const [module, source] of this.exports.sources) {
      if (source.person) data[module] = await source.person(personId);
    }
    await this.audit.log('data.person-exported', { personId });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="forga-auskunft-${personId}.json"`);
    res.send(JSON.stringify({ format: 'forga.person', version: 1, personId, exportedAt: new Date().toISOString(), data }, null, 2));
  }

  /** Applies the retention rules now; with `dryRun` only counts what would be affected. */
  @Post('retention/run')
  @HttpCode(200)
  @RequirePermissions('core.settings.manage')
  run(@Body(new ZodPipe(RetentionRun)) input: ReturnType<typeof RetentionRun.parse>): Promise<RetentionResult> {
    return this.retention.run(input.dryRun, input.settings);
  }
}
