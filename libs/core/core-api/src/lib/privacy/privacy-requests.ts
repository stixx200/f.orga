import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Injectable,
  NotFoundException,
  type OnModuleInit,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { EntityManager, type FilterQuery } from '@mikro-orm/core';
import {
  addMonthsToDate,
  type BrigadeSettings,
  fillPlaceholders,
  type Language,
  MyAccessRequestInput,
  type MyPrivacy,
  OPEN_REQUEST_STATUSES,
  type PersonPrivacy,
  PRIVACY_PERMISSION,
  type PrivacyAssignee,
  PrivacyExtensionNotified,
  type PrivacyRequest,
  PrivacyRequestClose,
  PrivacyRequestExtension,
  PrivacyRequestInput,
  type PrivacyRequestKind,
  PrivacyRecipientsNotified,
  PrivacyRequestUpdate,
  PrivacySelfService,
  PrivacyTextKey,
  REPLY_TEXT_OF_KIND,
} from '@forga/core-contracts';
import { Audit } from '../audit/audit.js';
import { AuditReferenceRegistry } from '../audit/audit-references.js';
import { berlinDate } from '../imports/parse.js';
import { renderLetterPdf } from '../lists/renderers.js';
import { assertVersion } from '../optimistic.js';
import { AuthService } from '../security/auth.service.js';
import type { AuthenticatedUser } from '../security/authenticated-user.js';
import { CurrentUser, RequirePermissions } from '../security/decorators.js';
import { OrganizationDirectory } from '../security/organization-directory.js';
import { User } from '../security/security.entities.js';
import { brigadeLogoDataUrl } from '../settings/assets.js';
import { SettingsService } from '../settings/settings.js';
import { type DeadlineInput, type DeadlineProvider, DeadlineRegistry } from '../tasks/deadline-registry.js';
import { ZodPipe } from '../zod.pipe.js';
import { PrivacyRequestEntity } from './privacy.entities.js';
import { PrivacyNoticeService } from './privacy-notice.js';
import { formatDay, KIND_LABELS, lines, pdfParagraphs } from './privacy-text.js';

const deadlineOf = (r: PrivacyRequestEntity) => r.extendedUntil ?? r.dueOn;
const isOpen = (r: PrivacyRequestEntity) => OPEN_REQUEST_STATUSES.includes(r.status);
const name = (p: { firstName: string; lastName: string }) => `${p.lastName}, ${p.firstName}`;

/**
 * Requests of data subjects (L7, L19): recorded by the administration or asked for in "My area", with the deadline of
 * Art. 12(3) as a task of everybody with `core.privacy.manage`, extension, status, reply letters and the recipients
 * informed under Art. 19.
 */
@Injectable()
export class PrivacyRequests implements DeadlineProvider, OnModuleInit {
  readonly module = 'core';

  constructor(
    private readonly em: EntityManager,
    private readonly organization: OrganizationDirectory,
    private readonly audit: Audit,
    private readonly registry: DeadlineRegistry,
    private readonly references: AuditReferenceRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
    this.references.register('core.privacy-request', {
      keys: ['requestId'],
      resolve: async (ids, user) => {
        const found = await this.em.fork().find(PrivacyRequestEntity, { id: { $in: [...ids] } });
        const to = (id: string) => (user.can(PRIVACY_PERMISSION) ? `/admin/privacy/requests/${id}` : undefined);
        return new Map(found.map((r) => [r.id, { label: { de: `${KIND_LABELS[r.kind].de} vom ${formatDay(r.receivedOn, 'de')}`, en: `${KIND_LABELS[r.kind].en} of ${formatDay(r.receivedOn, 'en')}` }, to: to(r.id) }]));
      },
    });
  }

  /**
   * Open requests are tasks of everybody holding `core.privacy.manage` (also before the step-up: the task names no
   * person), in the bell and the weekly e-mail. While a period is extended and the person not yet told, a second task
   * reminds of that until the original deadline.
   */
  async deadlines(): Promise<DeadlineInput[]> {
    const open = await this.em.fork().find(PrivacyRequestEntity, { status: { $in: [...OPEN_REQUEST_STATUSES] } });
    return open.flatMap((r): DeadlineInput[] => {
      const base = {
        subject: { type: 'core.privacy-request', id: r.id, label: formatDay(r.receivedOn, 'de') },
        departmentIds: [],
        permission: PRIVACY_PERMISSION,
        held: true,
        leadDays: 366,
        to: `/admin/privacy/requests/${r.id}`,
      };
      return [
        {
          ...base,
          id: `privacy-request:${r.id}`,
          kind: 'privacy-request',
          title: { de: `Datenschutzanfrage beantworten: ${KIND_LABELS[r.kind].de}`, en: `Answer data protection request: ${KIND_LABELS[r.kind].en}` },
          dueOn: deadlineOf(r),
        },
        ...(r.status === 'extended' && !r.extensionNotifiedOn
          ? [{ ...base, id: `privacy-extension:${r.id}`, kind: 'privacy-extension-notice', title: { de: 'Person über die Fristverlängerung unterrichten', en: 'Tell the person about the extended period' }, dueOn: r.dueOn }]
          : []),
      ];
    });
  }

  async load(em: EntityManager, id: string): Promise<PrivacyRequestEntity> {
    const found = await em.findOne(PrivacyRequestEntity, id);
    if (!found) throw new NotFoundException({ code: 'privacy.requestUnknown' });
    return found;
  }

  /** Requests as the administration sees them, with person and user names. */
  async toDtos(requests: PrivacyRequestEntity[]): Promise<PrivacyRequest[]> {
    const persons = new Map(((await this.organization.persons([...new Set(requests.map((r) => r.personId))])) ?? []).map((p) => [p.id, p]));
    const userIds = [...new Set(requests.flatMap((r) => [r.assigneeId, r.createdBy]).filter((id): id is string => Boolean(id)))];
    const users = new Map((userIds.length ? await this.em.fork().find(User, { id: { $in: userIds } }, { fields: ['id', 'displayName'] }) : []).map((u) => [u.id, u.displayName]));
    return requests.map((r) => {
      const person = persons.get(r.personId);
      return {
        id: r.id,
        personId: r.personId,
        personName: person ? name(person) : null,
        kind: r.kind,
        receivedOn: r.receivedOn,
        channel: r.channel,
        identityChecked: r.identityChecked,
        identityNote: r.identityNote,
        content: r.content,
        language: r.language,
        activity: r.activity,
        dueOn: r.dueOn,
        extendedUntil: r.extendedUntil ?? null,
        extensionReason: r.extensionReason,
        extensionNotifiedOn: r.extensionNotifiedOn ?? null,
        deadline: deadlineOf(r),
        status: r.status,
        closedOn: r.closedOn ?? null,
        rejectionReason: r.rejectionReason,
        assigneeId: r.assigneeId ?? null,
        assigneeName: r.assigneeId ? (users.get(r.assigneeId) ?? null) : null,
        notes: r.notes,
        recipients: r.recipients ?? [],
        accessReportDocumentId: r.accessReportDocumentId ?? null,
        createdAt: r.createdAt.toISOString(),
        createdByName: r.createdBy ? (users.get(r.createdBy) ?? null) : null,
        version: r.version,
      };
    });
  }

  async list(filter: { state?: string; personId?: string }): Promise<PrivacyRequest[]> {
    const where: FilterQuery<PrivacyRequestEntity> = {};
    if (filter.state === 'open') where.status = { $in: [...OPEN_REQUEST_STATUSES] };
    if (filter.state === 'closed') where.status = { $nin: [...OPEN_REQUEST_STATUSES] };
    if (filter.personId) where.personId = filter.personId;
    const found = await this.em.fork().find(PrivacyRequestEntity, where, { orderBy: { receivedOn: 'desc', createdAt: 'desc' } });
    return this.toDtos(found);
  }

  /** Records a request; with `restrict` (objection, restriction) the processing of the person is restricted right away. */
  async create(input: ReturnType<typeof PrivacyRequestInput.parse>, createdBy: string | null): Promise<PrivacyRequestEntity> {
    const known = await this.organization.persons([input.personId]);
    if (known && !known.length) throw new BadRequestException({ code: 'privacy.personUnknown' });
    if (input.receivedOn > berlinDate()) throw new BadRequestException({ code: 'privacy.receivedInFuture' });
    if (input.restrict && !['objection', 'restriction'].includes(input.kind)) throw new BadRequestException({ code: 'privacy.restrictNotForKind' });
    const em = this.em.fork();
    const request = em.create(PrivacyRequestEntity, {
      personId: input.personId,
      kind: input.kind,
      receivedOn: input.receivedOn,
      channel: input.channel,
      identityChecked: input.identityChecked,
      identityNote: input.identityNote,
      content: input.content,
      language: input.language,
      activity: input.activity,
      dueOn: addMonthsToDate(input.receivedOn, 1),
      createdBy,
    });
    await em.flush();
    await this.audit.log('privacy.request-created', { requestId: request.id, personId: request.personId, kind: request.kind, channel: request.channel });
    if (input.restrict) {
      const reason = input.kind === 'objection' ? 'objection-pending' : 'accuracy-contested';
      if (await this.organization.restrictProcessing(request.personId, { reason, until: null, requestId: request.id })) {
        await this.audit.log('privacy.restricted', { personId: request.personId, reason, requestId: request.id });
      }
    }
    return request;
  }

  /** Records the access report created for a request (feature "Auskunft als PDF"). */
  async attachAccessReport(requestId: string, documentId: string): Promise<void> {
    const em = this.em.fork();
    const request = await this.load(em, requestId);
    request.accessReportDocumentId = documentId;
    await em.flush();
  }
}

/** Users who may work on requests: holders of `core.privacy.manage` (brigade-wide). */
@Injectable()
export class PrivacyAssignees {
  constructor(
    private readonly em: EntityManager,
    private readonly auth: AuthService,
  ) {}

  async list(): Promise<PrivacyAssignee[]> {
    const em = this.em.fork();
    const users = await em.find(User, { active: true, technical: false }, { orderBy: { displayName: 'asc' } });
    const result: PrivacyAssignee[] = [];
    for (const user of users) if ((await this.auth.allGrantsOfUser(em, user)).get(PRIVACY_PERMISSION) === 'brigade') result.push({ id: user.id, displayName: user.displayName });
    return result;
  }
}

/** "Verwaltung → Datenschutz → Anfragen" and the data protection tab of the person file. */
@Controller('core/privacy')
export class PrivacyRequestsController {
  constructor(
    private readonly em: EntityManager,
    private readonly requests: PrivacyRequests,
    private readonly assignees: PrivacyAssignees,
    private readonly audit: Audit,
    private readonly settings: SettingsService,
    private readonly notices: PrivacyNoticeService,
    private readonly organization: OrganizationDirectory,
  ) {}

  @Get('requests')
  @RequirePermissions(PRIVACY_PERMISSION)
  list(@Query('state') state?: string, @Query('personId') personId?: string): Promise<PrivacyRequest[]> {
    return this.requests.list({ state, personId: personId && /^[0-9a-f-]{36}$/i.test(personId) ? personId : undefined });
  }

  @Get('requests/:id')
  @RequirePermissions(PRIVACY_PERMISSION)
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<PrivacyRequest> {
    return (await this.requests.toDtos([await this.requests.load(this.em.fork(), id)]))[0];
  }

  @Post('requests')
  @RequirePermissions(PRIVACY_PERMISSION)
  async create(@Body(new ZodPipe(PrivacyRequestInput)) input: ReturnType<typeof PrivacyRequestInput.parse>, @CurrentUser() user: AuthenticatedUser): Promise<PrivacyRequest> {
    const request = await this.requests.create(input, user.id);
    return (await this.requests.toDtos([request]))[0];
  }

  /** Working data of an open request: status (received, in review), assignee, identity, notes. */
  @Put('requests/:id')
  @RequirePermissions(PRIVACY_PERMISSION)
  async update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(PrivacyRequestUpdate)) input: ReturnType<typeof PrivacyRequestUpdate.parse>): Promise<PrivacyRequest> {
    const em = this.em.fork();
    const request = await this.requests.load(em, id);
    assertVersion(request, input.version);
    this.assertOpen(request);
    if (input.assigneeId && input.assigneeId !== request.assigneeId && !(await this.assignees.list()).some((a) => a.id === input.assigneeId)) {
      throw new BadRequestException({ code: 'privacy.assigneeWithoutPermission' });
    }
    const status = input.status && request.status !== 'extended' ? input.status : request.status;
    const changedStatus = status !== request.status;
    em.assign(request, {
      status,
      assigneeId: input.assigneeId,
      identityChecked: input.identityChecked,
      identityNote: input.identityNote,
      content: input.content,
      notes: input.notes,
      language: input.language,
      activity: input.activity,
    });
    await em.flush();
    if (changedStatus) await this.audit.log('privacy.request-status-changed', { requestId: id, personId: request.personId, status });
    return (await this.requests.toDtos([request]))[0];
  }

  /** Extends the period by one or two months with a reason (Art. 12(3)); only once and before the deadline has passed. */
  @Post('requests/:id/extend')
  @HttpCode(200)
  @RequirePermissions(PRIVACY_PERMISSION)
  async extend(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(PrivacyRequestExtension)) input: PrivacyRequestExtension): Promise<PrivacyRequest> {
    const em = this.em.fork();
    const request = await this.requests.load(em, id);
    assertVersion(request, input.version);
    this.assertOpen(request);
    if (request.extendedUntil) throw new ConflictException({ code: 'privacy.alreadyExtended' });
    if (request.dueOn < berlinDate()) throw new BadRequestException({ code: 'privacy.deadlinePassed' });
    em.assign(request, { status: 'extended', extendedUntil: addMonthsToDate(request.dueOn, input.months), extensionReason: input.reason });
    await em.flush();
    await this.audit.log('privacy.request-extended', { requestId: id, personId: request.personId, until: request.extendedUntil, reason: input.reason });
    return (await this.requests.toDtos([request]))[0];
  }

  /** The person was told about the extension within the first month; the reminder ends. */
  @Post('requests/:id/extension-notified')
  @HttpCode(200)
  @RequirePermissions(PRIVACY_PERMISSION)
  async extensionNotified(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(PrivacyExtensionNotified)) input: PrivacyExtensionNotified): Promise<PrivacyRequest> {
    const em = this.em.fork();
    const request = await this.requests.load(em, id);
    assertVersion(request, input.version);
    if (!request.extendedUntil) throw new BadRequestException({ code: 'privacy.notExtended' });
    request.extensionNotifiedOn = input.notifiedOn;
    await em.flush();
    return (await this.requests.toDtos([request]))[0];
  }

  /** Closes a request as done or rejected (with reason); the task disappears. */
  @Post('requests/:id/close')
  @HttpCode(200)
  @RequirePermissions(PRIVACY_PERMISSION)
  async close(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(PrivacyRequestClose)) input: ReturnType<typeof PrivacyRequestClose.parse>): Promise<PrivacyRequest> {
    const em = this.em.fork();
    const request = await this.requests.load(em, id);
    assertVersion(request, input.version);
    this.assertOpen(request);
    if (input.closedOn < request.receivedOn) throw new BadRequestException({ code: 'privacy.closedBeforeReceived' });
    em.assign(request, { status: input.outcome, closedOn: input.closedOn, rejectionReason: input.outcome === 'rejected' ? input.reason : '' });
    await em.flush();
    await this.audit.log('privacy.request-closed', { requestId: id, personId: request.personId, status: input.outcome, ...(input.outcome === 'rejected' ? { reason: input.reason } : {}) });
    return (await this.requests.toDtos([request]))[0];
  }

  /** Reopens a closed request, e.g. closed by mistake. */
  @Post('requests/:id/reopen')
  @HttpCode(200)
  @RequirePermissions(PRIVACY_PERMISSION)
  async reopen(@Param('id', ParseUUIDPipe) id: string, @Body() body: { version?: number }): Promise<PrivacyRequest> {
    const em = this.em.fork();
    const request = await this.requests.load(em, id);
    assertVersion(request, body?.version);
    if (OPEN_REQUEST_STATUSES.includes(request.status)) throw new ConflictException({ code: 'privacy.requestOpen' });
    em.assign(request, { status: request.extendedUntil ? 'extended' : 'in-review', closedOn: null, rejectionReason: '' });
    await em.flush();
    await this.audit.log('privacy.request-reopened', { requestId: id, personId: request.personId });
    return (await this.requests.toDtos([request]))[0];
  }

  /** Checklist of the recipients informed about a rectification, erasure or restriction (Art. 19). */
  @Put('requests/:id/recipients')
  @RequirePermissions(PRIVACY_PERMISSION)
  async recipients(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(PrivacyRecipientsNotified)) input: PrivacyRecipientsNotified): Promise<PrivacyRequest> {
    const em = this.em.fork();
    const request = await this.requests.load(em, id);
    assertVersion(request, input.version);
    request.recipients = input.recipients;
    await em.flush();
    await this.audit.log('privacy.recipients-notified', { requestId: id, personId: request.personId, recipients: input.recipients.map((r) => r.name) });
    return (await this.requests.toDtos([request]))[0];
  }

  /**
   * Reply letter as PDF from a text block (default: the reply of the kind, `replyRejection` for a rejected request),
   * in the language of the request. Placeholders are filled from the request, the person and the contacts.
   */
  @Get('requests/:id/reply.pdf')
  @RequirePermissions(PRIVACY_PERMISSION)
  async reply(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response, @Query('text') text?: string, @Query('language') language?: string): Promise<void> {
    const request = await this.requests.load(this.em.fork(), id);
    const key = text ? PrivacyTextKey.safeParse(text) : null;
    if (key && (!key.success || !key.data.startsWith('reply'))) throw new BadRequestException({ code: 'privacy.noReplyText' });
    const textKey = key?.data ?? (request.status === 'rejected' ? 'replyRejection' : REPLY_TEXT_OF_KIND[request.kind]);
    const lang: Language = language === 'en' || language === 'de' ? language : request.language;
    const pdf = await this.replyPdf(request, textKey, lang);
    await this.audit.log('privacy.reply-created', { requestId: id, personId: request.personId, text: textKey });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${lang === 'de' ? 'antwort' : 'reply'}-${request.receivedOn}.pdf"`);
    res.send(pdf);
  }

  private async replyPdf(request: PrivacyRequestEntity, textKey: PrivacyTextKey, language: Language): Promise<Buffer> {
    const em = this.em.fork();
    const brigade = await this.settings.get<BrigadeSettings>('brigade');
    const [contacts, texts] = await Promise.all([this.notices.contacts(), this.notices.texts()]);
    const person = (await this.organization.persons([request.personId]))?.[0];
    const fullName = person ? `${person.firstName} ${person.lastName}` : '';
    const kind = KIND_LABELS[request.kind][language];
    const today = berlinDate();
    const values = {
      brigade: brigade?.name ?? '',
      name: fullName,
      receivedOn: formatDay(request.receivedOn, language),
      dueOn: formatDay(request.dueOn, language),
      extendedUntil: formatDay(request.extendedUntil, language),
      kind,
      activity: request.activity,
      reason: request.status === 'rejected' ? request.rejectionReason : request.extensionReason,
      authority: lines(contacts.authority.name, contacts.authority.address, contacts.authority.website).replaceAll('\n', ', '),
      today: formatDay(today, language),
    };
    const block = texts[textKey];
    const title = language === 'de' ? 'Ihre Anfrage zum Datenschutz' : 'Your data protection request';
    const content: unknown[] = [
      { text: lines(fullName, person?.street, lines(person?.postalCode, person?.city).replace('\n', ' ')), margin: [0, 10, 0, 24] },
      { text: lines(brigade?.city && `${brigade.city}, ${formatDay(today, language)}`, !brigade?.city && formatDay(today, language)), alignment: 'right', margin: [0, 0, 0, 16] },
      { text: `${title}: ${kind} (${language === 'de' ? 'eingegangen am' : 'received on'} ${formatDay(request.receivedOn, language)})`, bold: true, margin: [0, 0, 0, 12] },
      ...pdfParagraphs(fillPlaceholders(block.text[language], values)),
      ...(block.reviewedAt ? [] : [{ text: language === 'de' ? 'Vorlage – vor dem Versand mit dem Datenschutzbeauftragten prüfen' : 'Template – review with the data protection officer before sending', style: 'small', margin: [0, 16, 0, 0] }]),
    ];
    return renderLetterPdf({ brigade, letterhead: await brigadeLogoDataUrl(em, 'letterhead'), logo: await brigadeLogoDataUrl(em), title, content, language, now: new Date() });
  }

  @Get('assignees')
  @RequirePermissions(PRIVACY_PERMISSION)
  listAssignees(): Promise<PrivacyAssignee[]> {
    return this.assignees.list();
  }

  /** Data protection tab of the person file: requests of the person and the notice acknowledged by the linked user. */
  @Get('persons/:personId')
  @RequirePermissions(PRIVACY_PERMISSION)
  async person(@Param('personId', ParseUUIDPipe) personId: string): Promise<PersonPrivacy> {
    const user = await this.em.fork().findOne(User, { personId }, { fields: ['id', 'privacyNoticeVersion', 'privacyNoticeAcknowledgedAt'] });
    return {
      requests: await this.requests.list({ personId }),
      notice: user ? { version: user.privacyNoticeVersion ?? null, acknowledgedAt: user.privacyNoticeAcknowledgedAt?.toISOString() ?? null } : null,
    };
  }

  // ----- "My area" -----

  /** The data protection section of "My area": own requests, how the access report is provided, contacts. */
  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser): Promise<MyPrivacy> {
    const em = this.em.fork();
    const [stored, current, contacts, selfService] = await Promise.all([
      em.findOneOrFail(User, user.id),
      this.notices.current(),
      this.notices.contacts(),
      this.settings.get('privacy.selfServiceAccess'),
    ]);
    const requests = user.personId ? await em.find(PrivacyRequestEntity, { personId: user.personId }, { orderBy: { receivedOn: 'desc', createdAt: 'desc' } }) : [];
    return {
      requests: requests.map((r) => ({ id: r.id, kind: r.kind, receivedOn: r.receivedOn, status: r.status, deadline: deadlineOf(r), closedOn: r.closedOn ?? null })),
      selfService: PrivacySelfService.parse(selfService ?? {}),
      dpo: { name: contacts.dpo.name, email: contacts.dpo.email, phone: contacts.dpo.phone },
      notice: { version: current.version, acknowledgedVersion: stored.privacyNoticeVersion ?? null, acknowledgedAt: stored.privacyNoticeAcknowledgedAt?.toISOString() ?? null },
    };
  }

  /**
   * "Auskunft anfordern": a request of the own person, channel "My area", identity checked by the sign-in. Not during an
   * impersonation; one open access request at a time.
   */
  @Post('me/requests')
  async requestAccess(@Body(new ZodPipe(MyAccessRequestInput)) input: ReturnType<typeof MyAccessRequestInput.parse>, @CurrentUser() user: AuthenticatedUser): Promise<MyPrivacy> {
    if (user.impersonator || user.via !== 'session') throw new ForbiddenException({ code: 'privacy.ownRequestOnly' });
    if (!user.personId) throw new BadRequestException({ code: 'privacy.noPerson' });
    const kind: PrivacyRequestKind = 'access';
    if (await this.em.fork().count(PrivacyRequestEntity, { personId: user.personId, kind, status: { $in: [...OPEN_REQUEST_STATUSES] } })) {
      throw new ConflictException({ code: 'privacy.requestOpen' });
    }
    await this.requests.create(
      PrivacyRequestInput.parse({ personId: user.personId, kind, receivedOn: berlinDate(), channel: 'my-area', identityChecked: true, identityNote: '', language: input.language }),
      user.id,
    );
    return this.me(user);
  }

  private assertOpen(request: PrivacyRequestEntity): void {
    if (!isOpen(request)) throw new ConflictException({ code: 'privacy.requestClosed' });
  }
}
