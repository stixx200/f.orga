import {
  BadRequestException,
  ConflictException,
  GoneException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EntityManager, type FilterQuery } from '@mikro-orm/core';
import {
  ACCESS_REPORT_DAYS,
  type AccessReport,
  type AccessReportCreate,
  type AccessReportHandOver,
  type AccessReportSectionSummary,
  type BrigadeSettings,
  CORE_ACTIVITIES,
  type Language,
  type MyAccessReport,
  PrivacyRequestInput,
  type ProcessingActivity,
} from '@forga/core-contracts';
import { Audit, AuditEntry } from '../audit/audit.js';
import { AccessLog } from '../privacy/access-log.js';
import { ExportRegistry, PersonDataRegistry } from '../data/data.js';
import { HistoryEntry } from '../history/history.entity.js';
import { berlinDate } from '../imports/parse.js';
import { FORGA_CORE_OPTIONS, type ForgaCoreOptions } from '../options.js';
import { RetentionTexts } from '../privacy/retention-texts.js';
import type { AuthenticatedUser } from '../security/authenticated-user.js';
import { OrganizationDirectory } from '../security/organization-directory.js';
import { ApiToken, User } from '../security/security.entities.js';
import { decryptBytes, encryptBytes, serverKey } from '../security/server-key.js';
import { brigadeLogoDataUrl } from '../settings/assets.js';
import { SettingsService } from '../settings/settings.js';
import { MailService } from '../tasks/mail.service.js';
import { Notifications } from '../tasks/notifications.js';
import { renderAccessReport, type SectionInfo } from './access-report.pdf.js';
import { PrivacyRequestEntity } from '../privacy/privacy.entities.js';
import { PrivacyRequests } from '../privacy/privacy-requests.js';
import { AccessReportTexts } from './access-report.texts.js';
import { assertPersonDataComplete } from './completeness.js';
import { createDescribeContext, type DescribedAccount } from './describe-context.js';
import type { DescribeContext, PersonDataSection } from './person-description.js';
import { sectionEntries } from './person-description.js';
import { PrivacyDocument } from './privacy-document.entity.js';

const DAY_MS = 86_400_000;
const unique = (values: string[]) => [...new Set(values.filter(Boolean))];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOUR_MS = 3_600_000;
/** An import or data transfer that created a record is logged at most this long after the record. */
const IMPORT_WINDOW_MS = 30 * 60_000;

/** Everything the report says about a person, before rendering. */
interface Collected {
  personName: string;
  sections: PersonDataSection[];
  origins: Map<string, string[]>;
  ctx: DescribeContext;
}

/**
 * Access reports (Art. 15 GDPR): collects the readable descriptions of all modules (`describePerson`), renders them as
 * PDF in the background and keeps the file encrypted for 30 days.
 */
@Injectable()
export class AccessReportService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(AccessReportService.name);
  private timer?: ReturnType<typeof setInterval>;
  private readonly running = new Set<Promise<unknown>>();

  constructor(
    private readonly em: EntityManager,
    private readonly exports: ExportRegistry,
    private readonly personData: PersonDataRegistry,
    @Inject(FORGA_CORE_OPTIONS) private readonly options: ForgaCoreOptions,
    private readonly organization: OrganizationDirectory,
    private readonly retentionText: RetentionTexts,
    private readonly settings: SettingsService,
    private readonly audit: Audit,
    private readonly mail: MailService,
    private readonly notifications: Notifications,
    private readonly texts: AccessReportTexts,
    private readonly requests: PrivacyRequests,
    private readonly accessLog: AccessLog,
  ) {}

  /**
   * Checks that every module declaring personal data describes it or anonymises it; deletes expired files every hour
   * (`FORGA_PRIVACY_SCHEDULER=off` in tests). Reports still pending were interrupted by a restart.
   */
  async onApplicationBootstrap(): Promise<void> {
    this.assertComplete();
    this.requests.instantAccessReport = (user, language) => this.createInstant(user, language);
    await this.em.fork().nativeUpdate(PrivacyDocument, { status: 'pending' }, { status: 'failed', error: 'privacy.generationInterrupted' });
    if (process.env.FORGA_PRIVACY_SCHEDULER === 'off') return;
    const run = () =>
      void this.purgeExpired().catch((error: unknown) => this.logger.error(`Deleting expired documents failed: ${error instanceof Error ? error.message : String(error)}`));
    run();
    this.timer = setInterval(run, HOUR_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  /** Modules with `privacy.personData` must offer `describePerson` or `anonymize`; activity keys start with the module ID. */
  assertComplete(): void {
    assertPersonDataComplete(this.options.modules, (id) => Boolean(this.exports.sources.get(id)?.describePerson) || this.personData.handlers.has(id));
  }

  /** Processing activities of core and modules by key. */
  activities(): Map<string, ProcessingActivity> {
    const all = [...CORE_ACTIVITIES, ...this.options.modules.flatMap((m) => (m.manifest.privacy?.activities ?? []).map((a) => ({ recipients: [], retention: [], ...a })))];
    return new Map(all.map((a) => [a.key, a as ProcessingActivity]));
  }

  // ----- Collecting -----

  private async collect(personId: string, language: Language, asOf: Date): Promise<Collected> {
    const persons = await this.organization.persons([personId]);
    if (persons && !persons.length) throw new NotFoundException({ code: 'data.unknownPerson' });
    const person = persons?.[0];
    const personName = person ? `${person.firstName} ${person.lastName}`.trim() : '';
    const em = this.em.fork();
    const ownUsers = await em.find(User, { personId });
    const describe = async (user: User | null): Promise<DescribedAccount | null> => {
      if (!user) return null;
      // Technical users without a token (e.g. of an info terminal) are named by their display name, a device name.
      const token = user.technical ? await em.findOne(ApiToken, { user: user.id }, { orderBy: { createdAt: 'asc' } }) : null;
      return { technical: user.technical, roles: user.roles.getItems().map((a) => a.role.name), tokenName: token?.name ?? (user.technical ? user.displayName : null) };
    };
    const ctx = createDescribeContext({
      language,
      asOf,
      personId,
      personName,
      ownUserIds: ownUsers.map((u) => u.id),
      account: async (userId) => describe(UUID.test(userId) ? await em.findOne(User, userId, { populate: ['roles.role'] }) : null),
      accountOfPerson: async (id) => describe(await em.findOne(User, { personId: id, active: true }, { populate: ['roles.role'] })),
    });
    const sections: PersonDataSection[] = [];
    // Order of the tabs of the person file: modules in load order, the user account at the end.
    for (const module of [...this.options.modules.map((m) => m.manifest.id), 'core']) {
      const source = this.exports.sources.get(module);
      if (source?.describePerson) sections.push(...(await source.describePerson(personId, ctx)).filter((s) => s.blocks.length > 0));
    }
    const { protocol, origins } = await this.history(sections, ctx);
    if (protocol) sections.push(protocol);
    return { personName, sections, origins, ctx };
  }

  /** Changes to the records of the sections (protocol) and where the records came from (Art. 15 para. 1 g). */
  private async history(sections: PersonDataSection[], ctx: DescribeContext): Promise<{ protocol: PersonDataSection | null; origins: Map<string, string[]> }> {
    const groups = sections.flatMap((section) => (section.records ?? []).filter((r) => r.ids.length).map((r) => ({ ...r, section, set: new Set(r.ids) })));
    const origins = new Map<string, string[]>();
    if (!groups.length) return { protocol: null, origins };
    const em = this.em.fork();
    const byEntity = new Map<string, string[]>();
    for (const g of groups) byEntity.set(g.entity, [...(byEntity.get(g.entity) ?? []), ...g.ids]);
    const conditions: FilterQuery<HistoryEntry>[] = [...byEntity].flatMap(([entity, ids]) => [
      { entity, entityId: { $in: ids } },
      { parentEntity: entity, parentId: { $in: ids } },
    ]);
    const entries = await em.find(HistoryEntry, { $or: conditions }, { orderBy: { timestamp: 'desc' } });
    const imports = await em.find(AuditEntry, { action: { $in: ['imports.applied', 'mp-feuer.run-applied'] } }, { orderBy: { timestamp: 'asc' } });

    const rows: string[][] = [];
    const sources = new Map<PersonDataSection, Set<string>>();
    const actions = { created: ctx.t('angelegt', 'created'), updated: ctx.t('geändert', 'changed'), deleted: ctx.t('gelöscht', 'deleted') } as Record<string, string>;
    for (const entry of entries) {
      const direct = groups.find((g) => g.entity === entry.entity && g.set.has(entry.entityId));
      const parent = direct ? null : groups.find((g) => g.entity === entry.parentEntity && Boolean(entry.parentId) && g.set.has(entry.parentId!));
      const group = direct ?? parent;
      if (!group) continue;
      const label = direct ? (direct.label ?? group.section.title) : (group.section.labels?.[entry.entity] ?? ctx.t('Eintrag', 'Entry'));
      const by = await ctx.actor(entry.userId);
      rows.push([ctx.dateTime(entry.timestamp), group.section.title, `${label} ${actions[entry.action] ?? entry.action}`, by]);
      if (direct && entry.action === 'created') {
        const set = sources.get(group.section) ?? new Set<string>();
        set.add(await this.origin(entry, imports, ctx));
        sources.set(group.section, set);
      }
    }
    for (const [section, set] of sources) origins.set(section.key, [...set]);
    const protocol: PersonDataSection = {
      key: 'core.protocol',
      title: ctx.t('Änderungen an Ihren Daten', 'Changes to your data'),
      activity: 'core.accounts',
      categories: [ctx.t('Protokolle', 'Protocols')],
      blocks: rows.length
        ? [{ kind: 'table', columns: [ctx.t('Zeitpunkt', 'Time'), ctx.t('Bereich', 'Area'), ctx.t('Änderung', 'Change'), ctx.t('Durch', 'By')], rows }]
        : [],
    };
    return { protocol: rows.length ? protocol : null, origins };
  }

  private async origin(entry: HistoryEntry, imports: AuditEntry[], ctx: DescribeContext): Promise<string> {
    const imported = imports.find(
      (a) => a.userId === entry.userId && a.timestamp.getTime() >= entry.timestamp.getTime() - 1000 && a.timestamp.getTime() - entry.timestamp.getTime() <= IMPORT_WINDOW_MS,
    );
    if (imported) {
      // A data transfer from MP-Feuer applies its parts as imports with `source.module: 'mp-feuer'`.
      const fromMpFeuer = imported.action === 'mp-feuer.run-applied' || (imported.details['source'] as { module?: string } | undefined)?.module === 'mp-feuer';
      return fromMpFeuer
        ? ctx.t(`Datenübernahme aus MP-Feuer am ${ctx.date(imported.timestamp)}`, `data transfer from MP-Feuer on ${ctx.date(imported.timestamp)}`)
        : ctx.t(`Tabellen-Import am ${ctx.date(imported.timestamp)}`, `table import on ${ctx.date(imported.timestamp)}`);
    }
    if (!entry.userId) return ctx.t('automatisch (z. B. Infoterminal)', 'automatically (e.g. info terminal)');
    if (ctx.ownUserIds.has(entry.userId)) return ctx.t('Ihre Angaben in Mein Bereich', 'your own entries in "My area"');
    const actor = await ctx.actor(entry.userId);
    return actor.startsWith(ctx.t('Schnittstelle', 'interface')) ? actor : ctx.t('Erfassung durch die Feuerwehr', 'entered by the fire brigade');
  }

  /** All sections of the report about the person, with the protocol, as the PDF shows them. */
  async sections(personId: string, language: Language): Promise<{ sections: PersonDataSection[]; origins: Map<string, string[]> }> {
    const { sections, origins } = await this.collect(personId, language, new Date());
    return { sections, origins };
  }

  /** Sections with their number of entries, shown in the dialog before creating the report. */
  async preview(personId: string, language: Language): Promise<AccessReportSectionSummary[]> {
    const { sections } = await this.collect(personId, language, new Date());
    return sections.map((s) => ({ key: s.key, title: s.title, entries: sectionEntries(s), health: Boolean(s.health) }));
  }

  /** The PDF of the report, without storing it. */
  /** `requestDate`: day the data subject request came in, if the report answers one. */
  async render(personId: string, language: Language, includeJson: boolean, requestDate: string | null = null): Promise<Buffer> {
    const now = new Date();
    const { personName, sections, origins, ctx } = await this.collect(personId, language, now);
    const activities = this.activities();
    const retention = await this.retentionTexts(ctx);
    const tokens = await this.em.fork().find(ApiToken, { revokedAt: null, $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] }, { orderBy: { name: 'asc' } });
    const tokenRecipients = tokens.map((t) => ctx.t(`Schnittstelle „${t.name}“`, `interface "${t.name}"`));
    const em = this.em.fork();
    const described = sections.map((section) => {
      const activity = activities.get(section.activity);
      const info: SectionInfo = {
        purpose: activity ? ctx.text(activity.purpose) : null,
        retention: activity ? retention(activity) : null,
        recipients: (activity?.recipients ?? []).map((r) => ctx.text(r)),
        origins: origins.get(section.key) ?? [],
      };
      return { section, info };
    });
    const categories = unique(sections.flatMap((s) => s.categories.map((c) => (s.health ? `${c} (${ctx.t('Gesundheitsdaten', 'health data')})` : c))));
    const json = includeJson ? Buffer.from(JSON.stringify(await this.exports.person(personId), null, 2), 'utf8') : null;
    return renderAccessReport({
      language,
      now,
      brigade: await this.settings.get<BrigadeSettings>('brigade'),
      // The page header names the report on every page; a letterhead would replace it.
      letterhead: null,
      logo: await brigadeLogoDataUrl(em),
      personName,
      address: await this.organization.postalAddress(personId),
      letter: await this.texts.letter(language, { name: personName, receivedOn: requestDate ?? berlinDate(now) }),
      purposes: unique(described.map((d) => d.info.purpose ?? '')),
      categories,
      recipients: unique([...described.flatMap((d) => d.info.recipients), ...tokenRecipients]),
      origins: unique(described.flatMap((d) => d.info.origins)),
      sections: described,
      requestDate,
      json,
    });
  }

  /** „Personalakte: 30 Jahre nach Austritt“ per retention category of an activity, or „bis zur Festlegung einer Frist“. */
  private async retentionTexts(ctx: DescribeContext): Promise<(activity: ProcessingActivity) => string> {
    const text = await this.retentionText.load();
    return (activity) => text(activity.retention, ctx.language);
  }

  // ----- Documents -----

  private key(): Buffer {
    const key = serverKey();
    if (!key) throw new ServiceUnavailableException({ code: 'privacy.noSecretKey' });
    return key;
  }

  /** Creates the report in the background; the returned document is `pending` until the PDF is stored. */
  async create(input: Required<AccessReportCreate>, user: AuthenticatedUser): Promise<AccessReport> {
    const key = this.key();
    const persons = await this.organization.persons([input.personId]);
    if (persons && !persons.length) throw new NotFoundException({ code: 'data.unknownPerson' });
    if (input.requestId) {
      // Only an access request of the same person can be answered by the report.
      const request = await this.em.fork().findOne(PrivacyRequestEntity, input.requestId);
      if (!request || request.personId !== input.personId || request.kind !== 'access') throw new BadRequestException({ code: 'privacy.requestMismatch' });
    }
    const document = await this.store(input, user.id, null);
    await this.audit.log('privacy.access-report-created', { personId: input.personId, documentId: document.id, language: input.language, includeJson: input.includeJson, requestId: input.requestId });
    await this.accessLog.record(user, [input.personId], 'core.access-report');
    this.track(this.generate(document.id, key));
    return this.dto(document, new Map([[user.id, user.displayName]]));
  }

  private async store(input: Required<AccessReportCreate>, createdBy: string, selfService: string | null): Promise<PrivacyDocument> {
    const em = this.em.fork();
    const now = new Date();
    const document = em.create(PrivacyDocument, {
      kind: 'access-report',
      personId: input.personId,
      language: input.language,
      includeJson: input.includeJson,
      status: 'pending',
      createdAt: now,
      createdBy,
      expiresAt: new Date(now.getTime() + ACCESS_REPORT_DAYS * DAY_MS),
      requestId: input.requestId,
      // Created by the member itself (`instant`): provided in "Mein Bereich" right away.
      ...(selfService ? { channel: 'self-service' as const, handedOverOn: selfService, handedOverBy: createdBy } : {}),
    });
    await em.flush();
    if (input.requestId) await this.requests.attachAccessReport(input.requestId, document.id);
    return document;
  }

  /**
   * Self-service `instant` (setting `privacy.selfServiceAccess`): the member creates the own report in "Mein Bereich",
   * at most once a day. It is recorded as an access request of the channel "Mein Bereich", answered by the report.
   */
  async createInstant(user: AuthenticatedUser, language: Language): Promise<void> {
    const key = this.key();
    if (!user.personId) throw new BadRequestException({ code: 'privacy.noPerson' });
    const since = new Date(Date.now() - DAY_MS);
    if (await this.em.fork().count(PrivacyDocument, { personId: user.personId, createdBy: user.id, status: { $ne: 'failed' }, createdAt: { $gt: since } })) {
      throw new ConflictException({ code: 'privacy.accessReportToday' });
    }
    const today = berlinDate();
    const request = await this.requests.create(
      PrivacyRequestInput.parse({ personId: user.personId, kind: 'access', receivedOn: today, channel: 'my-area', identityChecked: true, identityNote: '', language }),
      user.id,
    );
    const document = await this.store({ personId: user.personId, language, includeJson: false, requestId: request.id }, user.id, today);
    await this.audit.log('privacy.access-report-created', { personId: user.personId, documentId: document.id, language, includeJson: false, requestId: request.id, selfService: true });
    this.track(
      this.generate(document.id, key).then(async (ready) => {
        if (ready) await this.requests.closeDone(request.id, berlinDate());
      }),
    );
  }

  private track(job: Promise<unknown>): void {
    this.running.add(job);
    void job.finally(() => this.running.delete(job));
  }

  /** Waits for reports being generated (tests). */
  async idle(): Promise<void> {
    while (this.running.size) await Promise.all(this.running);
  }

  /** Renders and stores the PDF; `true` if it is ready. */
  private async generate(id: string, key: Buffer): Promise<boolean> {
    const em = this.em.fork();
    const document = await em.findOneOrFail(PrivacyDocument, id);
    try {
      const request = document.requestId ? await em.findOne(PrivacyRequestEntity, document.requestId) : null;
      const pdf = await this.render(document.personId, document.language, document.includeJson, request?.receivedOn ?? null);
      document.content = encryptBytes(pdf, key);
      document.size = pdf.length;
      document.status = 'ready';
    } catch (error) {
      this.logger.error(`Access report failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
      document.status = 'failed';
      document.error = 'privacy.generationFailed';
    }
    await em.flush();
    return document.status === 'ready';
  }

  async list(personId: string): Promise<AccessReport[]> {
    const documents = await this.em.fork().find(PrivacyDocument, { personId }, { orderBy: { createdAt: 'desc' } });
    return this.dtos(documents);
  }

  async get(id: string): Promise<AccessReport> {
    return (await this.dtos([await this.find(id)]))[0];
  }

  private async find(id: string): Promise<PrivacyDocument> {
    if (!UUID.test(id)) throw new NotFoundException();
    const document = await this.em.fork().findOne(PrivacyDocument, id);
    if (!document) throw new NotFoundException();
    return document;
  }

  /** The decrypted PDF; `410 privacy.documentExpired` after the deletion, `409 privacy.documentNotReady` before. */
  async file(id: string, by: { user: AuthenticatedUser; self: boolean }): Promise<{ document: PrivacyDocument; pdf: Buffer }> {
    if (!UUID.test(id)) throw new NotFoundException();
    const em = this.em.fork();
    const document = await em.findOne(PrivacyDocument, id, { populate: ['content'] });
    if (!document || (by.self && (document.personId !== by.user.personId || document.channel !== 'self-service'))) throw new NotFoundException();
    if (document.deletedAt || document.expiresAt <= new Date()) throw new GoneException({ code: 'privacy.documentExpired' });
    if (document.status !== 'ready' || !document.content) throw new ConflictException({ code: 'privacy.documentNotReady' });
    const pdf = decryptBytes(Buffer.from(document.content), this.key());
    if (!pdf) throw new ConflictException({ code: 'privacy.documentUnreadable' });
    if (by.self && !document.downloadedByPersonAt) document.downloadedByPersonAt = new Date();
    await em.flush();
    await this.audit.log('privacy.access-report-downloaded', { personId: document.personId, documentId: document.id, by: by.self ? 'person' : 'administration' });
    if (!by.self) await this.accessLog.record(by.user, [document.personId], 'core.access-report');
    return { document, pdf };
  }

  /** Records the handover; `self-service` provides the report in "Mein Bereich" and tells the person by e-mail. */
  async handOver(id: string, input: AccessReportHandOver, user: AuthenticatedUser): Promise<AccessReport> {
    if (!UUID.test(id)) throw new NotFoundException();
    const em = this.em.fork();
    const document = await em.findOne(PrivacyDocument, id);
    if (!document) throw new NotFoundException();
    if (document.deletedAt || document.expiresAt <= new Date()) throw new GoneException({ code: 'privacy.documentExpired' });
    if (document.status !== 'ready') throw new ConflictException({ code: 'privacy.documentNotReady' });
    const account = input.channel === 'self-service' ? await em.findOne(User, { personId: document.personId, active: true, technical: false }) : null;
    if (input.channel === 'self-service' && !account) throw new BadRequestException({ code: 'privacy.noAccount' });
    document.channel = input.channel;
    document.handedOverOn = input.date ?? berlinDate();
    document.handedOverBy = user.id;
    await em.flush();
    await this.audit.log('privacy.access-report-handed-over', { personId: document.personId, documentId: document.id, channel: input.channel });
    if (input.closeRequest && document.requestId) await this.requests.closeDone(document.requestId, document.handedOverOn);
    if (account?.email) await this.notifyReady(account, document);
    return (await this.dtos([document]))[0];
  }

  /** E-mail to the person: only that the report is ready, never the report or any of its data. */
  private async notifyReady(account: User, document: PrivacyDocument): Promise<void> {
    const de = account.language !== 'en';
    const until = de ? document.expiresAt.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }) : document.expiresAt.toLocaleDateString('en-GB', { timeZone: 'Europe/Berlin' });
    const link = await this.notifications.link('/me');
    const text = de
      ? `Guten Tag ${account.displayName},\n\nIhre Auskunft liegt in f.orga bereit. Sie können sie nach der Anmeldung in „Mein Bereich“ bis zum ${until} herunterladen.`
      : `Hello ${account.displayName},\n\nyour access report is ready in f.orga. You can download it after logging in under "My area" until ${until}.`;
    try {
      await this.mail.send({ to: account.email!, subject: de ? 'Ihre Auskunft liegt in f.orga bereit' : 'Your access report is ready in f.orga', text: link ? `${text}\n\n${link}` : text });
    } catch (error) {
      this.logger.warn(`Notice about an access report failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** Reports provided to the user's person in "Mein Bereich" and not yet expired. */
  async mine(user: AuthenticatedUser): Promise<MyAccessReport[]> {
    if (!user.personId) return [];
    const documents = await this.em.fork().find(
      PrivacyDocument,
      { personId: user.personId, channel: 'self-service', status: { $in: ['ready', 'pending'] }, deletedAt: null, expiresAt: { $gt: new Date() } },
      { orderBy: { createdAt: 'desc' } },
    );
    return documents.map((d) => ({ id: d.id, status: d.status, language: d.language, createdAt: d.createdAt.toISOString(), expiresAt: d.expiresAt.toISOString(), providedOn: d.handedOverOn ?? null }));
  }

  /** Deletes the files of expired reports; the rows stay as record of creation and handover. */
  async purgeExpired(now = new Date()): Promise<number> {
    return this.em.fork().nativeUpdate(PrivacyDocument, { expiresAt: { $lte: now }, deletedAt: null }, { content: null, deletedAt: now });
  }

  private async dtos(documents: PrivacyDocument[], names?: Map<string, string>): Promise<AccessReport[]> {
    const ids = [...new Set(documents.map((d) => d.createdBy).filter((id): id is string => Boolean(id)))].filter((id) => !names?.has(id));
    const users = ids.length ? await this.em.fork().find(User, { id: { $in: ids } }) : [];
    const all = new Map([...(names ?? []), ...users.map((u) => [u.id, u.displayName] as const)]);
    return documents.map((d) => this.dto(d, all));
  }

  private dto(d: PrivacyDocument, names: Map<string, string>): AccessReport {
    const expired = Boolean(d.deletedAt) || d.expiresAt <= new Date();
    return {
      id: d.id,
      personId: d.personId,
      language: d.language,
      includeJson: d.includeJson,
      status: expired ? 'expired' : d.status,
      error: d.error ?? null,
      createdAt: d.createdAt.toISOString(),
      createdBy: d.createdBy ? (names.get(d.createdBy) ?? null) : null,
      expiresAt: d.expiresAt.toISOString(),
      handedOverOn: d.handedOverOn ?? null,
      channel: d.channel ?? null,
      downloadedByPersonAt: d.downloadedByPersonAt?.toISOString() ?? null,
      requestId: d.requestId ?? null,
      size: d.size ?? null,
    };
  }
}
