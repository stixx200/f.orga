import { BadRequestException, Body, Controller, Get, HttpCode, Injectable, NotFoundException, type OnModuleInit, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { EntityManager } from '@mikro-orm/core';
import { type AffectedPersons, AffectedPersonsQuery, type BreachAccount, BreachLockdownInput, type BreachLockdownResult, type BreachSourceEntry, PRIVACY_PERMISSION, type ProtocolSourceInfo } from '@forga/privacy-contracts';
import type { Language, LocalizedText } from '@forga/core-contracts';
import ExcelJS from 'exceljs';
import {
  addStyledSheet,
  ApiToken,
  Audit,
  AuditEntry,
  auditLabel,
  auditWhere,
  AuthenticatedUser,
  AuthService,
  berlinDateTime,
  hashSecret,
  ListRegistry,
  LockdownRegistry,
  OrganizationDirectory,
  type ProtocolFilter,
  ProtocolRegistry,
  RequirePermissions,
  Session,
  SESSION_COOKIE,
  StepUp,
  User,
  ZodPipe,
} from '@forga/core-api';
import { AccessLogStore } from './access-log.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Audit actions whose entries name exported or disclosed persons. */
const SOURCE_ACTIONS = ['lists.exported', 'data.exported', 'data.person-exported', 'privacy.access-report-created', 'privacy.access-report-downloaded'];

/** Helpers for data breaches (L20): protocols, affected persons, ending all sessions and tokens. */
@Injectable()
export class BreachTools implements OnModuleInit {
  constructor(
    private readonly em: EntityManager,
    private readonly protocols: ProtocolRegistry,
    private readonly organization: OrganizationDirectory,
    private readonly auth: AuthService,
    private readonly lists: ListRegistry,
    private readonly audit: Audit,
    private readonly accessLog: AccessLogStore,
    private readonly lockdowns: LockdownRegistry,
  ) {}

  onModuleInit(): void {
    this.protocols.register({
      key: 'privacy.access-log',
      title: { de: 'Leseprotokoll', en: 'Read log' },
      columns: [
        { de: 'Tag', en: 'Day' },
        { de: 'Benutzer', en: 'User' },
        { de: 'Person', en: 'Person' },
        { de: 'Bereich', en: 'Area' },
        { de: 'Zugriffe', en: 'Accesses' },
        { de: 'Erster Zugriff', en: 'First access' },
        { de: 'Letzter Zugriff', en: 'Last access' },
      ],
      widths: [12, 22, 24, 30, 10, 18, 18],
      rows: async (filter, language) =>
        (await this.accessLog.query({ from: filter.from, to: filter.to, userId: filter.userId ?? undefined, limit: 2000 })).map((e) => [
          e.day,
          e.userName ?? e.userId,
          e.personId ? (e.personName ?? e.personId) : language === 'de' ? 'alle Personen' : 'all persons',
          e.areaLabel[language],
          e.count,
          berlinDateTime(new Date(e.firstAt), language),
          berlinDateTime(new Date(e.lastAt), language),
        ]),
    });
  }

  private async names(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id): id is string => Boolean(id && UUID.test(id))))];
    if (!unique.length) return new Map();
    return new Map((await this.em.fork().find(User, { id: { $in: unique } }, { fields: ['id', 'displayName'] })).map((u) => [u.id, u.displayName]));
  }

  /** Workbook with one sheet per protocol for the period and user. */
  async protocolWorkbook(filter: ProtocolFilter, language: Language): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'f.orga';
    const user = filter.userId ? (await this.names([filter.userId])).get(filter.userId) : null;
    const subtitle = `${filter.from} – ${filter.to}${user ? ` · ${user}` : ''}`;
    for (const source of this.protocols.list()) {
      addStyledSheet(workbook, source.title[language].slice(0, 31), source.title[language], subtitle, source.columns.map((c) => c[language]), await source.rows(filter, language), source.widths ?? source.columns.map(() => 24));
    }
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async accounts(): Promise<BreachAccount[]> {
    const users = await this.em.fork().find(User, {}, { orderBy: { displayName: 'asc' } });
    return users.map((u) => ({ id: u.id, displayName: u.displayName, username: u.username, technical: u.technical, active: u.active }));
  }

  /** Audit entries of the period that name exported or disclosed persons. */
  async sources(filter: ProtocolFilter): Promise<BreachSourceEntry[]> {
    const entries = await this.em.fork().find(AuditEntry, { $and: [auditWhere(filter), { action: { $in: SOURCE_ACTIONS } }] }, { orderBy: { timestamp: 'desc' }, limit: 500 });
    const names = await this.names(entries.map((e) => e.userId));
    return entries.map((e) => ({
      auditId: e.id,
      timestamp: e.timestamp.toISOString(),
      action: e.action,
      userId: e.userId ?? null,
      userName: e.userId ? (names.get(e.userId) ?? null) : null,
      label: this.describe(e),
      persons: Array.isArray(e.details['personIds']) ? (e.details['personIds'] as unknown[]).length : typeof e.details['personId'] === 'string' ? 1 : null,
    }));
  }

  /** „Liste exportiert: Telefonliste (xlsx)“, „Vollexport: masterdata“, „Auskunft erstellt“. */
  private describe(entry: AuditEntry): LocalizedText {
    const base = auditLabel(entry.action);
    if (entry.action === 'lists.exported') {
      const list = this.lists.get(String(entry.details['listId'] ?? ''))?.definition.name;
      const format = String(entry.details['format'] ?? '');
      return { de: `${base.de}: ${list?.de ?? String(entry.details['listId'])} (${format})`, en: `${base.en}: ${list?.en ?? String(entry.details['listId'])} (${format})` };
    }
    if (entry.action === 'data.exported') return { de: `${base.de}: ${String(entry.details['module'] ?? '')}`, en: `${base.en}: ${String(entry.details['module'] ?? '')}` };
    return base;
  }

  /**
   * Affected persons: those named in an audit entry at the time (list export with its persons, access report), all
   * persons for a full export, or the persons an account can read today.
   */
  async affected(query: AffectedPersonsQuery): Promise<AffectedPersons> {
    const em = this.em.fork();
    let ids: string[];
    let description: LocalizedText;
    let basis: AffectedPersons['basis'] = 'recorded';
    if (query.source === 'audit') {
      const entry = await em.findOne(AuditEntry, query.auditId);
      if (!entry) throw new NotFoundException({ code: 'privacy.sourceUnknown' });
      const names = await this.names([entry.userId]);
      const by = entry.userId ? (names.get(entry.userId) ?? '') : '';
      const what = this.describe(entry);
      description = {
        de: `${what.de} am ${berlinDateTime(entry.timestamp, 'de')}${by ? ` durch ${by}` : ''}`,
        en: `${what.en} on ${berlinDateTime(entry.timestamp, 'en')}${by ? ` by ${by}` : ''}`,
      };
      const details = entry.details;
      if (entry.action === 'data.exported') {
        ids = await this.organization.allPersonIds();
        basis = 'current';
      } else if (Array.isArray(details['personIds'])) {
        ids = (details['personIds'] as unknown[]).filter((id): id is string => typeof id === 'string');
      } else if (typeof details['personId'] === 'string') {
        ids = [details['personId']];
      } else {
        throw new BadRequestException({ code: 'privacy.sourceWithoutPersons' });
      }
    } else {
      const user = await em.findOne(User, query.userId, { populate: ['roles.role'] });
      if (!user) throw new NotFoundException({ code: 'privacy.userUnknown' });
      // A technical user reads with the scopes of its tokens (brigade-wide), also of revoked ones: the breach may be older.
      const scopes = user.technical ? [...new Set((await em.find(ApiToken, { user: user.id })).flatMap((t) => t.scopes))] : [];
      const authenticated = user.technical
        ? new AuthenticatedUser(user.id, user.username, user.displayName, null, user.language, new Map(scopes.map((scope) => [scope, 'brigade' as const])), 'token')
        : await this.auth.load(em, user, 'session', true);
      ids = await this.organization.readablePersonIds(authenticated);
      basis = 'current';
      description = {
        de: `Personen, die das Konto „${user.displayName}“ lesen kann (Stand ${berlinDateTime(new Date(), 'de')})`,
        en: `Persons the account "${user.displayName}" can read (as of ${berlinDateTime(new Date(), 'en')})`,
      };
    }
    const persons = ((await this.organization.persons([...new Set(ids)])) ?? [])
      .map((p) => ({ id: p.id, firstName: p.firstName, lastName: p.lastName }))
      .toSorted((a, b) => a.lastName.localeCompare(b.lastName, 'de') || a.firstName.localeCompare(b.firstName, 'de'));
    await this.audit.log('privacy.breach-affected-determined', { source: query.source, ...(query.source === 'audit' ? { auditId: query.auditId } : { targetId: query.userId }), count: persons.length });
    return { persons, description, basis };
  }

  /**
   * Ends every session except the caller's own (also impersonations), revokes every API token and blocks the device
   * keys of the modules (info terminals need a new link afterwards).
   */
  async lockdown(input: ReturnType<typeof BreachLockdownInput.parse>, ownSession: string | null): Promise<BreachLockdownResult> {
    const em = this.em.fork();
    const sessions = await em.nativeDelete(Session, ownSession ? { id: { $ne: ownSession } } : {});
    const tokens = await em.nativeUpdate(ApiToken, { revokedAt: null }, { revokedAt: new Date() });
    const devices = await this.lockdowns.blockAll();
    await this.audit.log('privacy.breach-lockdown', { reason: input.reason, sessions, tokens, devices, ...(input.breachId ? { breachId: input.breachId } : {}) });
    return { sessions, tokens, devices };
  }
}

function filterOf(from: string | undefined, to: string | undefined, userId: string | undefined): { from: string; to: string; userId: string | null } {
  if (!from || !to || !DATE.test(from) || !DATE.test(to) || to < from) throw new BadRequestException({ code: 'privacy.periodInvalid' });
  if (userId && !UUID.test(userId)) throw new BadRequestException({ code: 'privacy.userUnknown' });
  return { from, to, userId: userId || null };
}

/** „Verwaltung → Datenschutz → Datenpannen“: protocols, affected persons and the emergency stop. */
@Controller('privacy/breach-tools')
@RequirePermissions(PRIVACY_PERMISSION)
export class BreachToolsController {
  constructor(
    private readonly tools: BreachTools,
    private readonly protocols: ProtocolRegistry,
    private readonly audit: Audit,
  ) {}

  /** Accounts to filter the protocols by or to determine the persons they can read. */
  @Get('accounts')
  accounts(): Promise<BreachAccount[]> {
    return this.tools.accounts();
  }

  @Get('protocols')
  protocolList(): ProtocolSourceInfo[] {
    return this.protocols.list().map((p) => ({ key: p.key, title: p.title }));
  }

  /** Audit log (and further protocols) of a period and optionally one user as Excel. */
  @Get('protocols.xlsx')
  async protocolExport(
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('userId') userId: string | undefined,
    @Query('breachId') breachId: string | undefined,
    @Query('language') language: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const filter = filterOf(from, to, userId);
    const lang: Language = language === 'en' ? 'en' : 'de';
    const file = await this.tools.protocolWorkbook(filter, lang);
    await this.audit.log('privacy.breach-protocol-exported', { from: filter.from, to: filter.to, ...(filter.userId ? { targetId: filter.userId } : {}), ...(breachId && UUID.test(breachId) ? { breachId } : {}) });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${lang === 'de' ? 'protokolle' : 'protocols'}-${filter.from}-${filter.to}.xlsx"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(file);
  }

  /** Exports and disclosures of a period from which affected persons can be reconstructed. */
  @Get('sources')
  sources(@Query('from') from: string | undefined, @Query('to') to: string | undefined, @Query('userId') userId: string | undefined): Promise<BreachSourceEntry[]> {
    return this.tools.sources(filterOf(from, to, userId));
  }

  @Post('affected')
  @HttpCode(200)
  affected(@Body(new ZodPipe(AffectedPersonsQuery)) query: AffectedPersonsQuery): Promise<AffectedPersons> {
    return this.tools.affected(query);
  }

  /** „Alle Sitzungen beenden und alle Tokens widerrufen“: with reason, in a session confirmed with the second factor. */
  @Post('lockdown')
  @HttpCode(200)
  @StepUp()
  lockdown(@Body(new ZodPipe(BreachLockdownInput)) input: ReturnType<typeof BreachLockdownInput.parse>, @Req() req: Request): Promise<BreachLockdownResult> {
    const own = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
    return this.tools.lockdown(input, own ? hashSecret(own) : null);
  }
}
