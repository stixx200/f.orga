import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, Injectable, NotFoundException, type OnModuleInit, Param, ParseUUIDPipe, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { EntityManager, type FilterQuery } from '@mikro-orm/core';
import { BREACH_NOTIFICATION_HOURS, BreachAffectedInput, PRIVACY_PERMISSION, type PrivacyBreach, PrivacyBreachClose, PrivacyBreachInput, PrivacyBreachUpdate } from '@forga/privacy-contracts';
import type { Language, LocalizedText } from '@forga/core-contracts';
import { addStyledSheet, assertVersion, Audit, AuditReferenceRegistry, type AuthenticatedUser, berlinDate, berlinDateTime, CurrentUser, type DeadlineInput, type DeadlineProvider, DeadlineRegistry, Notifications, OrganizationDirectory, RequirePermissions, User, ZodPipe } from '@forga/core-api';
import { PrivacyBreachEntity } from './privacy.entities.js';
import { formatDay } from './privacy-text.js';
import { PrivacyRegister } from './register.js';
import ExcelJS from 'exceljs';

const HOUR_MS = 3_600_000;

/** Deadline of the notification to the supervisory authority: 72 hours after the breach became known. */
export const notifyBy = (discoveredAt: Date): Date => new Date(discoveredAt.getTime() + BREACH_NOTIFICATION_HOURS * HOUR_MS);


type BreachValues = ReturnType<typeof PrivacyBreachInput.parse>;

/**
 * Data breaches (L20): recorded with the time they became known; while the supervisory authority is neither notified
 * nor the notification marked as not required, a task for everybody with `privacy.manage` shows the 72-hour
 * deadline (Art. 33(1)), and a second one asks to notify the persons when the risk is high (Art. 34).
 */
@Injectable()
export class PrivacyBreaches implements DeadlineProvider, OnModuleInit {
  readonly module = 'privacy';

  constructor(
    private readonly em: EntityManager,
    private readonly audit: Audit,
    private readonly registry: DeadlineRegistry,
    private readonly references: AuditReferenceRegistry,
    private readonly register: PrivacyRegister,
    private readonly notifications: Notifications,
    private readonly organization: OrganizationDirectory,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
    this.references.register('privacy.breach', {
      keys: ['breachId'],
      resolve: async (ids, user) => {
        const found = await this.em.fork().find(PrivacyBreachEntity, { id: { $in: [...ids] } });
        const to = (id: string) => (user.can(PRIVACY_PERMISSION) ? `/privacy/breaches/${id}` : undefined);
        // The label names no content: the title may describe what happened.
        return new Map(
          found.map((b) => [
            b.id,
            { label: { de: `Datenpanne vom ${berlinDateTime(b.discoveredAt, 'de')}`, en: `Data breach of ${berlinDateTime(b.discoveredAt, 'en')}` }, to: to(b.id) },
          ]),
        );
      },
    });
  }

  async deadlines(): Promise<DeadlineInput[]> {
    const open = await this.em.fork().find(PrivacyBreachEntity, { status: 'open' });
    return open.flatMap((b): DeadlineInput[] => {
      const by = notifyBy(b.discoveredAt);
      const base = {
        subject: { type: 'privacy.breach', id: b.id, label: berlinDateTime(b.discoveredAt, 'de') },
        departmentIds: [],
        permission: PRIVACY_PERMISSION,
        // The task names no content, only the deadline.
        held: true,
        leadDays: 366,
        dueOn: berlinDate(by),
        to: `/privacy/breaches/${b.id}`,
      };
      const result: DeadlineInput[] = [];
      if (!b.authorityNotifiedOn && !b.authorityNotRequired) {
        result.push({
          ...base,
          id: `privacy-breach:${b.id}`,
          kind: 'privacy-breach',
          title: { de: `Datenpanne der Aufsichtsbehörde melden (bis ${berlinDateTime(by, 'de')})`, en: `Notify the data breach to the supervisory authority (by ${berlinDateTime(by, 'en')})` },
        });
      }
      if (b.risk === 'high' && !b.subjectsNotifiedOn) {
        result.push({
          ...base,
          id: `privacy-breach-subjects:${b.id}`,
          kind: 'privacy-breach-subjects',
          title: { de: 'Betroffene Personen über die Datenpanne benachrichtigen (Art. 34)', en: 'Notify the persons affected by the data breach (Art. 34)' },
        });
      }
      return result;
    });
  }

  async load(em: EntityManager, id: string): Promise<PrivacyBreachEntity> {
    const found = await em.findOne(PrivacyBreachEntity, id);
    if (!found) throw new NotFoundException({ code: 'privacy.breachUnknown' });
    return found;
  }

  async toDtos(breaches: PrivacyBreachEntity[]): Promise<PrivacyBreach[]> {
    const userIds = [...new Set(breaches.map((b) => b.createdBy).filter((id): id is string => Boolean(id)))];
    const users = new Map((userIds.length ? await this.em.fork().find(User, { id: { $in: userIds } }, { fields: ['id', 'displayName'] }) : []).map((u) => [u.id, u.displayName]));
    const persons = new Map(((await this.organization.persons([...new Set(breaches.flatMap((b) => b.affectedPersonIds ?? []))])) ?? []).map((p) => [p.id, { id: p.id, firstName: p.firstName, lastName: p.lastName }]));
    return breaches.map((b) => ({
      id: b.id,
      title: b.title,
      discoveredAt: b.discoveredAt.toISOString(),
      notifyBy: notifyBy(b.discoveredAt).toISOString(),
      occurredFrom: b.occurredFrom ?? null,
      occurredUntil: b.occurredUntil ?? null,
      description: b.description,
      activityKeys: b.activityKeys ?? [],
      dataCategories: b.dataCategories,
      health: b.health,
      affectedCount: b.affectedCount ?? null,
      affectedPersonIds: b.affectedPersonIds ?? [],
      affectedPersons: (b.affectedPersonIds ?? []).flatMap((id) => persons.get(id) ?? []).toSorted((x, y) => x.lastName.localeCompare(y.lastName, 'de') || x.firstName.localeCompare(y.firstName, 'de')),
      affectedSource: b.affectedSource,
      consequences: b.consequences,
      measures: b.measures,
      risk: b.risk ?? null,
      authorityNotifiedOn: b.authorityNotifiedOn ?? null,
      authorityReference: b.authorityReference,
      authorityNotRequired: b.authorityNotRequired,
      authorityNote: b.authorityNote,
      subjectsNotifiedOn: b.subjectsNotifiedOn ?? null,
      subjectsNotifiedVia: b.subjectsNotifiedVia ?? null,
      subjectsNote: b.subjectsNote,
      status: b.status,
      closedOn: b.closedOn ?? null,
      createdAt: b.createdAt.toISOString(),
      createdByName: b.createdBy ? (users.get(b.createdBy) ?? null) : null,
      version: b.version,
    }));
  }

  /** Checks the values that depend on each other or on the register. */
  async validate(values: BreachValues): Promise<void> {
    const discovered = new Date(values.discoveredAt);
    if (discovered.getTime() > Date.now() + 60_000) throw new BadRequestException({ code: 'privacy.discoveredInFuture' });
    if (values.occurredFrom && values.occurredUntil && values.occurredUntil < values.occurredFrom) throw new BadRequestException({ code: 'privacy.periodInvalid' });
    const discoveredOn = berlinDate(discovered);
    if (values.authorityNotifiedOn && values.authorityNotifiedOn < discoveredOn) throw new BadRequestException({ code: 'privacy.notifiedBeforeDiscovered' });
    if (values.subjectsNotifiedOn && values.subjectsNotifiedOn < discoveredOn) throw new BadRequestException({ code: 'privacy.notifiedBeforeDiscovered' });
    if (values.authorityNotifiedOn && values.authorityNotRequired) throw new BadRequestException({ code: 'privacy.authorityNotifiedAndNotRequired' });
    if (values.subjectsNotifiedOn && !values.subjectsNotifiedVia) throw new BadRequestException({ code: 'privacy.notificationWayMissing' });
    const known = new Set((await this.register.activityOptions()).map((a) => a.key));
    if (values.activityKeys.some((key) => !known.has(key))) throw new BadRequestException({ code: 'privacy.activityUnknown' });
  }

  private assign(breach: PrivacyBreachEntity, values: BreachValues): void {
    Object.assign(breach, {
      title: values.title,
      discoveredAt: new Date(values.discoveredAt),
      occurredFrom: values.occurredFrom,
      occurredUntil: values.occurredUntil,
      description: values.description,
      activityKeys: [...new Set(values.activityKeys)],
      dataCategories: values.dataCategories,
      health: values.health,
      affectedCount: values.affectedCount,
      consequences: values.consequences,
      measures: values.measures,
      risk: values.risk,
      authorityNotifiedOn: values.authorityNotifiedOn,
      authorityReference: values.authorityReference,
      authorityNotRequired: values.authorityNotRequired,
      authorityNote: values.authorityNote,
      subjectsNotifiedOn: values.subjectsNotifiedOn,
      subjectsNotifiedVia: values.subjectsNotifiedOn ? values.subjectsNotifiedVia : null,
      subjectsNote: values.subjectsNote,
    });
  }

  /**
   * Records a breach and tells everybody whose role names `privacy.manage` by e-mail, without content: only that a
   * breach was recorded and until when the authority is to be notified.
   */
  async create(values: BreachValues, user: AuthenticatedUser): Promise<PrivacyBreachEntity> {
    await this.validate(values);
    const em = this.em.fork();
    const breach = em.create(PrivacyBreachEntity, { title: values.title, discoveredAt: new Date(values.discoveredAt), createdBy: user.id });
    this.assign(breach, values);
    await em.flush();
    await this.audit.log('privacy.breach-recorded', { breachId: breach.id });
    const by = notifyBy(breach.discoveredAt);
    await this.notifications.notify({
      permission: PRIVACY_PERMISSION,
      departmentId: null,
      action: 'privacy.breach-mailed',
      details: { breachId: breach.id },
      path: `/privacy/breaches/${breach.id}`,
      compose: (language, displayName) =>
        language === 'en'
          ? { subject: 'f.orga: data breach recorded', text: `Hello ${displayName},\n\na data breach was recorded in f.orga. If it is to be notified, the supervisory authority must be informed by ${berlinDateTime(by, 'en')} (Art. 33 GDPR). Details only in f.orga.` }
          : { subject: 'f.orga: Datenpanne erfasst', text: `Guten Tag ${displayName},\n\nin f.orga wurde eine Datenpanne erfasst. Ist sie meldepflichtig, muss die Aufsichtsbehörde bis ${berlinDateTime(by, 'de')} informiert werden (Art. 33 DSGVO). Einzelheiten nur in f.orga.` },
    });
    return breach;
  }

  async update(id: string, values: ReturnType<typeof PrivacyBreachUpdate.parse>): Promise<PrivacyBreachEntity> {
    await this.validate(values);
    const em = this.em.fork();
    const breach = await this.load(em, id);
    assertVersion(breach, values.version);
    if (breach.status === 'closed') throw new ConflictException({ code: 'privacy.breachClosed' });
    const before = { authority: breach.authorityNotifiedOn, notRequired: breach.authorityNotRequired, subjects: breach.subjectsNotifiedOn };
    this.assign(breach, values);
    await em.flush();
    await this.audit.log('privacy.breach-changed', { breachId: id });
    if (values.authorityNotifiedOn && values.authorityNotifiedOn !== before.authority) {
      await this.audit.log('privacy.breach-authority-notified', { breachId: id, notifiedOn: values.authorityNotifiedOn, reference: values.authorityReference });
    }
    if (values.authorityNotRequired && !before.notRequired) await this.audit.log('privacy.breach-not-notifiable', { breachId: id, reason: values.authorityNote });
    if (values.subjectsNotifiedOn && values.subjectsNotifiedOn !== before.subjects) {
      await this.audit.log('privacy.breach-subjects-notified', { breachId: id, notifiedOn: values.subjectsNotifiedOn, via: values.subjectsNotifiedVia });
    }
    return breach;
  }
}

const CONTACT_COLUMNS: LocalizedText[] = [
  { de: 'Nachname', en: 'Last name' },
  { de: 'Vorname', en: 'First name' },
  { de: 'Straße', en: 'Street' },
  { de: 'PLZ', en: 'Postal code' },
  { de: 'Ort', en: 'City' },
  { de: 'E-Mail', en: 'E-mail' },
  { de: 'Telefon', en: 'Phone' },
  { de: 'Benachrichtigt am', en: 'Notified on' },
];

/** „Verwaltung → Datenschutz → Datenpannen“. */
@Controller('privacy/breaches')
@RequirePermissions(PRIVACY_PERMISSION)
export class PrivacyBreachesController {
  constructor(
    private readonly em: EntityManager,
    private readonly breaches: PrivacyBreaches,
    private readonly audit: Audit,
    private readonly organization: OrganizationDirectory,
  ) {}

  @Get()
  async list(@Query('state') state?: string): Promise<PrivacyBreach[]> {
    const where: FilterQuery<PrivacyBreachEntity> = state === 'open' || state === 'closed' ? { status: state } : {};
    return this.breaches.toDtos(await this.em.fork().find(PrivacyBreachEntity, where, { orderBy: { discoveredAt: 'desc' } }));
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<PrivacyBreach> {
    return (await this.breaches.toDtos([await this.breaches.load(this.em.fork(), id)]))[0];
  }

  @Post()
  async create(@Body(new ZodPipe(PrivacyBreachInput)) input: BreachValues, @CurrentUser() user: AuthenticatedUser): Promise<PrivacyBreach> {
    return (await this.breaches.toDtos([await this.breaches.create(input, user)]))[0];
  }

  @Put(':id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(PrivacyBreachUpdate)) input: ReturnType<typeof PrivacyBreachUpdate.parse>): Promise<PrivacyBreach> {
    return (await this.breaches.toDtos([await this.breaches.update(id, input)]))[0];
  }

  /** Takes over the affected persons determined with a helper (or entered by hand). */
  @Put(':id/affected')
  async affected(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(BreachAffectedInput)) input: ReturnType<typeof BreachAffectedInput.parse>): Promise<PrivacyBreach> {
    const em = this.em.fork();
    const breach = await this.breaches.load(em, id);
    assertVersion(breach, input.version);
    if (breach.status === 'closed') throw new ConflictException({ code: 'privacy.breachClosed' });
    const ids = [...new Set(input.personIds)];
    const known = await this.organization.persons(ids);
    if (known && known.length !== ids.length) throw new BadRequestException({ code: 'privacy.personUnknown' });
    breach.affectedPersonIds = ids;
    breach.affectedSource = input.source;
    await em.flush();
    await this.audit.log('privacy.breach-affected-recorded', { breachId: id, count: ids.length, source: input.source });
    return (await this.breaches.toDtos([breach]))[0];
  }

  /** Closes the breach; the authority must be notified, or the notification marked as not required. */
  @Post(':id/close')
  @HttpCode(200)
  async close(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(PrivacyBreachClose)) input: PrivacyBreachClose): Promise<PrivacyBreach> {
    const em = this.em.fork();
    const breach = await this.breaches.load(em, id);
    assertVersion(breach, input.version);
    if (breach.status === 'closed') throw new ConflictException({ code: 'privacy.breachClosed' });
    if (!breach.authorityNotifiedOn && !breach.authorityNotRequired) throw new BadRequestException({ code: 'privacy.breachAuthorityOpen' });
    if (input.closedOn < berlinDate(breach.discoveredAt)) throw new BadRequestException({ code: 'privacy.closedBeforeDiscovered' });
    breach.status = 'closed';
    breach.closedOn = input.closedOn;
    await em.flush();
    await this.audit.log('privacy.breach-closed', { breachId: id });
    return (await this.breaches.toDtos([breach]))[0];
  }

  @Post(':id/reopen')
  @HttpCode(200)
  async reopen(@Param('id', ParseUUIDPipe) id: string, @Body() body: { version?: number }): Promise<PrivacyBreach> {
    const em = this.em.fork();
    const breach = await this.breaches.load(em, id);
    assertVersion(breach, body?.version);
    if (breach.status !== 'closed') throw new ConflictException({ code: 'privacy.breachOpen' });
    breach.status = 'open';
    breach.closedOn = null;
    await em.flush();
    await this.audit.log('privacy.breach-reopened', { breachId: id });
    return (await this.breaches.toDtos([breach]))[0];
  }

  /** Contact list of the affected persons for the notification (Art. 34) as Excel. */
  @Get(':id/contacts.xlsx')
  async contacts(@Param('id', ParseUUIDPipe) id: string, @Query('language') language: string | undefined, @Res() res: Response): Promise<void> {
    const breach = await this.breaches.load(this.em.fork(), id);
    const lang: Language = language === 'en' ? 'en' : 'de';
    const persons = ((await this.organization.persons(breach.affectedPersonIds ?? [])) ?? []).toSorted((a, b) => a.lastName.localeCompare(b.lastName, 'de') || a.firstName.localeCompare(b.firstName, 'de'));
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'f.orga';
    const title = lang === 'de' ? 'Benachrichtigung nach Art. 34 DSGVO' : 'Notification under Art. 34 GDPR';
    const subtitle = `${lang === 'de' ? 'Datenpanne vom' : 'Data breach of'} ${berlinDateTime(breach.discoveredAt, lang)} · ${persons.length} ${lang === 'de' ? 'Personen' : 'persons'} · ${lang === 'de' ? 'Personenbezogene Daten – nur für die Benachrichtigung, danach löschen' : 'Personal data – only for the notification, delete afterwards'}`;
    addStyledSheet(
      workbook,
      lang === 'de' ? 'Kontakte' : 'Contacts',
      title,
      subtitle,
      CONTACT_COLUMNS.map((c) => c[lang]),
      persons.map((p) => [p.lastName, p.firstName, p.street ?? '', p.postalCode ?? '', p.city ?? '', p.email, p.phone ?? '', breach.subjectsNotifiedOn ? formatDay(breach.subjectsNotifiedOn, lang) : '']),
      [18, 16, 26, 8, 18, 30, 18, 16],
    );
    await this.audit.log('privacy.breach-contacts-exported', { breachId: id, count: persons.length });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${lang === 'de' ? 'benachrichtigung' : 'notification'}-${berlinDate(breach.discoveredAt)}.xlsx"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(Buffer.from(await workbook.xlsx.writeBuffer()));
  }
}
