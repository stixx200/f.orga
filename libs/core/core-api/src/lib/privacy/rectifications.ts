import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, Injectable, NotFoundException, type OnModuleInit, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { MyRectificationInput, OPEN_REQUEST_STATUSES, PRIVACY_PERMISSION, PrivacyRequestInput, type RectificationView } from '@forga/core-contracts';
import { Attachments } from '../attachments/attachments.js';
import { Audit } from '../audit/audit.js';
import { berlinDate } from '../imports/parse.js';
import type { AuthenticatedUser } from '../security/authenticated-user.js';
import { CurrentUser } from '../security/decorators.js';
import { OrganizationDirectory } from '../security/organization-directory.js';
import { User } from '../security/security.entities.js';
import { type DeadlineInput, type DeadlineProvider, DeadlineRegistry } from '../tasks/deadline-registry.js';
import { ZodPipe } from '../zod.pipe.js';
import { PrivacyRequestEntity } from './privacy.entities.js';
import { PrivacyRequests } from './privacy-requests.js';
import { formatDay } from './privacy-text.js';

/** Who checks and corrects a rectification: those who may change the person's data in its department. */
export const RECTIFICATION_PERMISSION = 'masterdata.persons.write';
/** Attachments of a request: the proof of a rectification (e.g. a course certificate; no copy of the driving licence). */
export const REQUEST_ATTACHMENTS = 'core.privacy-request';

/**
 * Rectification (L12): "Berichtigung beantragen" in "My area" creates a request of kind rectification with the deadline
 * of Art. 12(3) (task of `core.privacy.manage`) and a task for the holders of `masterdata.persons.write` of the
 * person's departments, who mark it as corrected.
 */
@Injectable()
export class Rectifications implements DeadlineProvider, OnModuleInit {
  readonly module = 'core';

  constructor(
    private readonly em: EntityManager,
    private readonly requests: PrivacyRequests,
    private readonly organization: OrganizationDirectory,
    private readonly registry: DeadlineRegistry,
    private readonly attachments: Attachments,
    private readonly audit: Audit,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
    this.attachments.register(REQUEST_ATTACHMENTS, {
      read: async (user, id) => {
        const request = await this.em.fork().findOne(PrivacyRequestEntity, id);
        if (!request) return false;
        return user.can(PRIVACY_PERMISSION) || this.own(user, request) || (request.rectification !== null && (await this.mayCorrect(user, request.personId)));
      },
      // The person adds the proof to the own open request; the administration to any.
      write: async (user, id) => {
        const request = await this.em.fork().findOne(PrivacyRequestEntity, id);
        if (!request) return false;
        return user.can(PRIVACY_PERMISSION) || (this.own(user, request) && OPEN_REQUEST_STATUSES.includes(request.status));
      },
    });
  }

  private own(user: AuthenticatedUser, request: PrivacyRequestEntity): boolean {
    return !user.impersonator && user.via === 'session' && user.personId === request.personId;
  }

  private async departmentsOf(personId: string): Promise<string[]> {
    return (await this.organization.persons([personId]))?.[0]?.departmentIds ?? [];
  }

  async mayCorrect(user: AuthenticatedUser, personId: string): Promise<boolean> {
    if (user.can(PRIVACY_PERMISSION) || user.grant(RECTIFICATION_PERMISSION) === 'brigade') return true;
    return (await this.departmentsOf(personId)).some((id) => user.can(RECTIFICATION_PERMISSION, id));
  }

  /** Open rectifications not yet corrected: a task of the persons responsible for the person's data (no name in it). */
  async deadlines(): Promise<DeadlineInput[]> {
    const open = (await this.em.fork().find(PrivacyRequestEntity, { kind: 'rectification', status: { $in: [...OPEN_REQUEST_STATUSES] } })).filter(
      (r) => r.rectification && !r.rectification.correctedAt,
    );
    const persons = new Map(((await this.organization.persons([...new Set(open.map((r) => r.personId))])) ?? []).map((p) => [p.id, p.departmentIds]));
    return open.map((r) => {
      const area = this.requests.areaLabel(r.rectification!.area);
      return {
        id: `privacy-rectification:${r.id}`,
        kind: 'privacy-rectification',
        title: { de: `Berichtigung prüfen: ${area.de}`, en: `Check rectification: ${area.en}` },
        subject: { type: 'core.privacy-rectification', id: r.id, label: formatDay(r.receivedOn, 'de') },
        dueOn: r.extendedUntil ?? r.dueOn,
        leadDays: 366,
        departmentIds: persons.get(r.personId) ?? [],
        permission: RECTIFICATION_PERMISSION,
        to: `/privacy/rectifications/${r.id}`,
      };
    });
  }

  /** "Berichtigung beantragen": a request of the own person, channel "My area", identity checked by the sign-in. */
  async ask(user: AuthenticatedUser, input: MyRectificationInput): Promise<PrivacyRequestEntity> {
    if (user.impersonator || user.via !== 'session') throw new ForbiddenException({ code: 'privacy.ownRequestOnly' });
    if (!user.personId) throw new BadRequestException({ code: 'privacy.noPerson' });
    const content = `${this.requests.areaLabel(input.area).de}\nFalsch: ${input.wrong}\nRichtig: ${input.correct}`;
    const request = await this.requests.create(
      PrivacyRequestInput.parse({ personId: user.personId, kind: 'rectification', receivedOn: berlinDate(), channel: 'my-area', identityChecked: true, identityNote: '', content: content.slice(0, 5000), language: user.language }),
      user.id,
      { area: input.area, wrong: input.wrong, correct: input.correct, correctedAt: null, correctedBy: null },
    );
    return request;
  }

  async view(user: AuthenticatedUser, id: string): Promise<RectificationView> {
    const request = await this.em.fork().findOne(PrivacyRequestEntity, id);
    if (!request?.rectification) throw new NotFoundException({ code: 'privacy.requestUnknown' });
    if (!(await this.mayCorrect(user, request.personId))) throw new NotFoundException({ code: 'privacy.requestUnknown' });
    const person = (await this.organization.persons([request.personId]))?.[0];
    const correctedBy = request.rectification.correctedBy;
    const users = new Map(correctedBy ? (await this.em.fork().find(User, { id: correctedBy }, { fields: ['id', 'displayName'] })).map((u) => [u.id, u.displayName]) : []);
    return {
      id: request.id,
      personId: request.personId,
      personName: person ? `${person.lastName}, ${person.firstName}` : null,
      receivedOn: request.receivedOn,
      deadline: request.extendedUntil ?? request.dueOn,
      status: request.status,
      rectification: this.requests.rectificationDto(request.rectification, users)!,
    };
  }

  /** "Als berichtigt vermerken": the data were corrected; the task ends, the request stays with data protection. */
  async corrected(user: AuthenticatedUser, id: string): Promise<RectificationView> {
    const em = this.em.fork();
    const request = await em.findOne(PrivacyRequestEntity, id);
    if (!request?.rectification || !(await this.mayCorrect(user, request.personId))) throw new NotFoundException({ code: 'privacy.requestUnknown' });
    if (request.rectification.correctedAt) throw new ConflictException({ code: 'privacy.alreadyCorrected' });
    request.rectification = { ...request.rectification, correctedAt: new Date().toISOString(), correctedBy: user.id };
    await em.flush();
    await this.audit.log('privacy.rectification-corrected', { requestId: id, personId: request.personId, area: request.rectification.area });
    return this.view(user, id);
  }
}

@Controller('core/privacy')
export class RectificationsController {
  constructor(private readonly rectifications: Rectifications) {}

  /** Returns the ID of the request, so the proof can be attached (`/api/core/attachments?type=core.privacy-request`). */
  @Post('me/rectifications')
  async ask(@Body(new ZodPipe(MyRectificationInput)) input: MyRectificationInput, @CurrentUser() user: AuthenticatedUser): Promise<{ id: string }> {
    const request = await this.rectifications.ask(user, input);
    return { id: request.id };
  }

  @Get('rectifications/:id')
  view(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser): Promise<RectificationView> {
    return this.rectifications.view(user, id);
  }

  @Post('rectifications/:id/corrected')
  @HttpCode(200)
  corrected(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser): Promise<RectificationView> {
    return this.rectifications.corrected(user, id);
  }
}
