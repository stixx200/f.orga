import { Body, Controller, Delete, Get, HttpCode, Injectable, NotFoundException, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { Audit, type AuthenticatedUser, CurrentUser, type DeadlineInput, type DeadlineProvider, RequirePermissions, User, ZodPipe } from '@forga/core-api';
import {
  PRIVACY_PERMISSION,
  PrivacyInformationInput,
  ProcessingRestrictionInput,
  type ProcessingRestrictionReason,
  type RestrictedPerson,
  type UninformedPerson,
} from '@forga/core-contracts';
import type { Person as PersonDto } from '@forga/masterdata-contracts';
import { Person } from '../masterdata.entities.js';
import { PersonsService, primaryDepartment, processingRestriction } from '../persons/persons.service.js';

const POPULATE = ['memberships.department', 'qualifications', 'ranks', 'honors', 'offices', 'restPeriods'] as const;

/** Restriction of processing (Art. 18) and information under Art. 13/14, stored with the person. */
@Injectable()
export class PersonPrivacyService {
  constructor(private readonly em: EntityManager) {}

  /** Restricts the processing of the person; `false` for an unknown person. */
  async restrict(personId: string, restriction: { reason: ProcessingRestrictionReason; until: string | null; requestId: string | null }): Promise<boolean> {
    const em = this.em.fork();
    const person = await em.findOne(Person, personId);
    if (!person) return false;
    em.assign(person, {
      restrictedAt: person.restrictedAt ?? new Date(),
      restrictionReason: restriction.reason,
      restrictedUntil: restriction.until,
      restrictionRequestId: restriction.requestId,
    });
    await em.flush();
    return true;
  }

  async restrictedIds(): Promise<string[]> {
    return (await this.em.fork().find(Person, { restrictedAt: { $ne: null } }, { fields: ['id'] })).map((p) => p.id);
  }
}

/**
 * "Verwaltung → Datenschutz" and the data protection tab of the person file: restricting the processing of a person,
 * the restricted persons and the persons without recorded information.
 */
@Controller('masterdata')
@RequirePermissions(PRIVACY_PERMISSION)
export class PersonPrivacyController {
  constructor(
    private readonly em: EntityManager,
    private readonly persons: PersonsService,
    private readonly privacy: PersonPrivacyService,
    private readonly audit: Audit,
  ) {}

  @Put('persons/:id/restriction')
  async restrict(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(ProcessingRestrictionInput)) input: ReturnType<typeof ProcessingRestrictionInput.parse>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PersonDto> {
    if (!(await this.privacy.restrict(id, input))) throw new NotFoundException();
    await this.audit.log('privacy.restricted', { personId: id, reason: input.reason, ...(input.until ? { until: input.until } : {}), ...(input.requestId ? { requestId: input.requestId } : {}) });
    return this.dto(id, user);
  }

  /** Lifts the restriction: the person shows up again in lists, search, pickers, deadlines and e-mails. */
  @Delete('persons/:id/restriction')
  async lift(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser): Promise<PersonDto> {
    const em = this.em.fork();
    const person = await em.findOne(Person, id);
    if (!person) throw new NotFoundException();
    if (person.restrictedAt) {
      em.assign(person, { restrictedAt: null, restrictionReason: null, restrictedUntil: null, restrictionRequestId: null });
      await em.flush();
      await this.audit.log('privacy.restriction-lifted', { personId: id });
    }
    return this.dto(id, user);
  }

  private async dto(id: string, user: AuthenticatedUser): Promise<PersonDto> {
    const person = await this.em.fork().findOneOrFail(Person, id, { populate: POPULATE });
    return this.persons.toDto(person, user);
  }

  @Get('privacy/restricted')
  async restricted(): Promise<RestrictedPerson[]> {
    const found = await this.em.fork().find(Person, { restrictedAt: { $ne: null } }, { orderBy: { lastName: 'asc', firstName: 'asc' } });
    return found.map((p) => ({ id: p.id, firstName: p.firstName, lastName: p.lastName, restriction: processingRestriction(p)! }));
  }

  /**
   * Persons not informed yet (Art. 13/14): no information recorded and no linked user who acknowledged the privacy
   * notice; without persons who left, were anonymised or whose processing is restricted.
   */
  @Get('privacy/uninformed')
  async uninformed(): Promise<UninformedPerson[]> {
    const em = this.em.fork();
    const acknowledged = new Set(
      (await em.find(User, { personId: { $ne: null }, privacyNoticeAcknowledgedAt: { $ne: null } }, { fields: ['personId'] })).map((u) => u.personId),
    );
    const found = await em.find(
      Person,
      { privacyInformedOn: null, status: { $ne: 'left' }, anonymizedAt: null, restrictedAt: null },
      { populate: ['memberships.department'], orderBy: { lastName: 'asc', firstName: 'asc' } },
    );
    return found
      .filter((p) => !acknowledged.has(p.id))
      .map((p) => ({ id: p.id, firstName: p.firstName, lastName: p.lastName, status: p.status, primaryDepartmentId: primaryDepartment(p), joinedOn: p.joinedOn ?? null }));
  }

  /** "Information erteilt am" for one or many persons, e.g. after the transfer from MP-Feuer (letter, posting). */
  @Post('privacy/information')
  @HttpCode(200)
  async information(@Body(new ZodPipe(PrivacyInformationInput)) input: PrivacyInformationInput): Promise<{ count: number }> {
    const em = this.em.fork();
    const persons = await em.find(Person, { id: { $in: input.personIds } });
    for (const person of persons) em.assign(person, { privacyInformedOn: input.informedOn, privacyInformedVia: input.via });
    await em.flush();
    await this.audit.log('privacy.information-recorded', { count: persons.length, informedOn: input.informedOn, via: input.via, ...(persons.length === 1 ? { personId: persons[0].id } : {}) });
    return { count: persons.length };
  }
}

/** A planned end of a restriction is a task of everybody holding `core.privacy.manage` (the restriction stays until lifted). */
@Injectable()
export class RestrictionDeadlines implements DeadlineProvider {
  readonly module = 'masterdata';

  constructor(private readonly em: EntityManager) {}

  async deadlines(): Promise<DeadlineInput[]> {
    const found = await this.em.fork().find(Person, { restrictedAt: { $ne: null }, restrictedUntil: { $ne: null } });
    return found.map((p) => ({
      id: `restriction-ends:${p.id}`,
      kind: 'restriction-ends',
      title: { de: 'Einschränkung der Verarbeitung endet: prüfen und aufheben', en: 'Restriction of processing ends: review and lift' },
      // No name: the task is about a person who must not appear in deadlines and e-mails.
      subject: { type: 'masterdata.processing-restriction', id: p.id, label: p.restrictedUntil! },
      dueOn: p.restrictedUntil!,
      leadDays: 14,
      departmentIds: [],
      permission: PRIVACY_PERMISSION,
      held: true,
      to: `/masterdata/persons/${p.id}?tab=privacy`,
    }));
  }
}
