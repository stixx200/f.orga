import { BadRequestException, Controller, Get, Injectable, NotFoundException, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { SearchHit } from '@forga/core-contracts';
import type { DescribeContext, PersonDataSection } from '../access-report/person-description.js';
import { Audit } from '../audit/audit.js';
import type { AuthenticatedUser } from '../security/authenticated-user.js';
import { OrganizationDirectory } from '../security/organization-directory.js';
import { CurrentUser, RequirePermissions } from '../security/decorators.js';

export const EXPORT_PERMISSION = 'core.data.export';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ----- Global search -----

export type SearchSource = (user: AuthenticatedUser, query: string) => Promise<SearchHit[]>;

/** Modules contribute hits to the global search; each source checks the permissions of the user itself. */
@Injectable()
export class SearchRegistry {
  private readonly sources: { module: string; source: SearchSource }[] = [];

  constructor(private readonly organization: OrganizationDirectory) {}

  register(module: string, source: SearchSource): void {
    this.sources.push({ module, source });
  }

  async search(user: AuthenticatedUser, query: string): Promise<SearchHit[]> {
    const results = await Promise.all(
      this.sources.filter((s) => user.canAnythingIn(s.module)).map((s) => s.source(user, query).catch((): SearchHit[] => [])),
    );
    // Hits about persons whose processing is restricted (Art. 18) never show up.
    const restricted = await this.organization.restrictedPersonIds();
    return results.flat().filter((hit) => !hit.personId || !restricted.has(hit.personId));
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
  /** All data of the module, with IDs, as plain JSON; `user` is the exporting user (e.g. to leave out managers' fields). */
  all(user: AuthenticatedUser): Promise<Record<string, unknown>>;
  /** Everything the module stores about a person (data access request, Art. 15 GDPR). */
  person?(personId: string): Promise<Record<string, unknown>>;
  /**
   * The same data in readable form for the access report (PDF): plain text, no IDs, other persons not named. Returns
   * no sections when the module stores nothing about the person.
   */
  describePerson?(personId: string, ctx: DescribeContext): Promise<PersonDataSection[]>;
}

@Injectable()
export class ExportRegistry {
  readonly sources = new Map<string, ExportSource>();

  register(module: string, source: ExportSource): void {
    this.sources.set(module, source);
  }

  /** Everything stored about a person across all modules, as JSON document (`forga.person`). */
  async person(personId: string): Promise<Record<string, unknown>> {
    const data: Record<string, unknown> = {};
    for (const [module, source] of this.sources) {
      if (source.person) data[module] = await source.person(personId);
    }
    return { format: 'forga.person', version: 1, personId, exportedAt: new Date().toISOString(), data };
  }
}

// ----- Personal data -----

/** What a module does with the data of a person who is anonymised (e.g. long after leaving). */
export interface PersonDataHandler {
  /** Removes or neutralises everything the module stores about these persons beyond what statistics need. */
  anonymize(personIds: readonly string[]): Promise<void>;
}

/**
 * Modules register how they anonymise the data they keep about persons; the master data module calls `anonymize`
 * when it anonymises persons, so no module keeps names, notes or health data of them.
 */
@Injectable()
export class PersonDataRegistry {
  readonly handlers = new Map<string, PersonDataHandler>();

  register(module: string, handler: PersonDataHandler): void {
    this.handlers.set(module, handler);
  }

  async anonymize(personIds: readonly string[]): Promise<void> {
    if (!personIds.length) return;
    for (const handler of this.handlers.values()) await handler.anonymize(personIds);
  }
}

@Controller('core')
export class DataController {
  constructor(
    private readonly search: SearchRegistry,
    private readonly codes: CodeRegistry,
    private readonly exports: ExportRegistry,
    private readonly audit: Audit,
    private readonly organization: OrganizationDirectory,
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
  async export(@Param('module') module: string, @CurrentUser() user: AuthenticatedUser, @Res() res: Response): Promise<void> {
    const source = this.exports.sources.get(module);
    if (!source) throw new NotFoundException();
    const exportedAt = new Date();
    const body = { format: 'forga.export', version: 1, module, exportedAt: exportedAt.toISOString(), data: await source.all(user) };
    await this.audit.log('data.exported', { module });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="forga-${module}-${exportedAt.toISOString().slice(0, 10)}.json"`);
    res.send(JSON.stringify(body, null, 2));
  }

  /** Everything stored about a person across all modules (data access request). */
  @Get('export/person/:personId')
  @RequirePermissions(EXPORT_PERMISSION)
  async person(@Param('personId') personId: string, @Res() res: Response): Promise<void> {
    if (!UUID.test(personId)) throw new BadRequestException({ code: 'data.invalidPersonId' });
    // Without the master data module persons cannot be checked; the modules answer for the ID as given.
    const known = await this.organization.persons([personId]);
    if (known && !known.length) throw new NotFoundException({ code: 'data.unknownPerson' });
    const body = await this.exports.person(personId);
    await this.audit.log('data.person-exported', { personId });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="forga-auskunft-${personId}.json"`);
    res.send(JSON.stringify(body, null, 2));
  }
}
