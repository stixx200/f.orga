import { Body, Controller, Delete, Get, HttpCode, Inject, Injectable, NotFoundException, type OnModuleInit, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { defineEntity, EntityManager, p } from '@mikro-orm/core';
import { v7 as uuidv7 } from 'uuid';
import { Audit, type DeadlineInput, type DeadlineProvider, OrganizationDirectory, ProcessingRestrictions, RequirePermissions, User, ZodPipe } from '@forga/core-api';
import { PERSON_DIRECTORY, type PersonDirectory } from '@forga/masterdata-contracts';
import {
  PRIVACY_PERMISSION,
  type PrivacyInformation,
  PrivacyInformationInput,
  type PrivacyInformationVia,
  type ProcessingRestriction,
  ProcessingRestrictionInput,
  type ProcessingRestrictionReason,
  type RestrictedPerson,
  type UninformedPerson,
} from '@forga/privacy-contracts';

/**
 * Restriction of processing of a person (Art. 18): the person disappears from lists, search, pickers, info terminal,
 * deadlines and e-mails of all modules (through `ProcessingRestrictions` of the core); the person file is readable only
 * with `privacy.manage`. One row per restricted person, removed when the restriction is lifted.
 */
export const ProcessingRestrictionSchema = defineEntity({
  name: 'ProcessingRestrictionEntity',
  schema: 'privacy',
  tableName: 'restriction',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    /** Person in the masterdata module; no foreign key across modules. */
    personId: p.string().unique(),
    restrictedAt: p.datetime(),
    reason: p.string().$type<ProcessingRestrictionReason>(),
    /** Planned end, e.g. the end of a retention period; the restriction stays until it is lifted. */
    until: p.date().nullable(),
    /** Data protection request that led to the restriction. */
    requestId: p.string().nullable(),
    version: p.integer().version(),
  },
});
export class ProcessingRestrictionEntity extends ProcessingRestrictionSchema.class {}
ProcessingRestrictionSchema.setClass(ProcessingRestrictionEntity);

/** Information under Art. 13/14 given to a person (e.g. a letter after the transfer from MP-Feuer) and how. */
export const PrivacyInformationSchema = defineEntity({
  name: 'PrivacyInformationEntity',
  schema: 'privacy',
  tableName: 'information',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    personId: p.string().unique(),
    informedOn: p.date(),
    via: p.string().$type<PrivacyInformationVia>(),
    version: p.integer().version(),
  },
});
export class PrivacyInformationEntity extends PrivacyInformationSchema.class {}
PrivacyInformationSchema.setClass(PrivacyInformationEntity);

/** "Zur Kenntnis genommen" of the privacy notice by a user (no consent): the version and when. */
export const NoticeAcknowledgementSchema = defineEntity({
  name: 'NoticeAcknowledgementEntity',
  schema: 'privacy',
  tableName: 'notice_acknowledgement',
  properties: {
    /** User of the core; no foreign key across modules. */
    userId: p.string().primary(),
    version: p.integer(),
    acknowledgedAt: p.datetime(),
  },
});
export class NoticeAcknowledgementEntity extends NoticeAcknowledgementSchema.class {}
NoticeAcknowledgementSchema.setClass(NoticeAcknowledgementEntity);

export const toRestriction = (r: ProcessingRestrictionEntity): ProcessingRestriction => ({
  restrictedAt: r.restrictedAt.toISOString(),
  reason: r.reason,
  until: r.until ?? null,
  requestId: r.requestId ?? null,
});

/** Restriction and information of persons; answers the core which persons are restricted. */
@Injectable()
export class PersonPrivacyService implements OnModuleInit {
  constructor(
    private readonly em: EntityManager,
    private readonly restrictions: ProcessingRestrictions,
    private readonly organization: OrganizationDirectory,
  ) {}

  onModuleInit(): void {
    this.restrictions.register({ module: 'privacy', restrictedIds: (ids) => this.restrictedIds(ids) });
  }

  async restrictedIds(ids?: readonly string[]): Promise<Set<string>> {
    if (ids && !ids.length) return new Set();
    const found = await this.em.fork().find(ProcessingRestrictionEntity, ids ? { personId: { $in: [...ids] } } : {}, { fields: ['personId'] });
    return new Set(found.map((r) => r.personId));
  }

  async restriction(personId: string): Promise<ProcessingRestriction | null> {
    const found = await this.em.fork().findOne(ProcessingRestrictionEntity, { personId });
    return found ? toRestriction(found) : null;
  }

  async information(personId: string): Promise<PrivacyInformation | null> {
    const found = await this.em.fork().findOne(PrivacyInformationEntity, { personId });
    return found ? { informedOn: found.informedOn, via: found.via } : null;
  }

  /** Restricts the processing of the person (the time of a running restriction stays); `false` for an unknown person. */
  async restrict(personId: string, restriction: { reason: ProcessingRestrictionReason; until: string | null; requestId: string | null }): Promise<boolean> {
    const known = await this.organization.persons([personId]);
    if (known && !known.length) return false;
    const em = this.em.fork();
    const existing = await em.findOne(ProcessingRestrictionEntity, { personId });
    if (existing) em.assign(existing, { reason: restriction.reason, until: restriction.until, requestId: restriction.requestId });
    else em.create(ProcessingRestrictionEntity, { personId, restrictedAt: new Date(), reason: restriction.reason, until: restriction.until, requestId: restriction.requestId });
    await em.flush();
    return true;
  }

  /** Lifts the restriction; `false` if there was none. */
  async lift(personId: string): Promise<boolean> {
    const em = this.em.fork();
    const existing = await em.findOne(ProcessingRestrictionEntity, { personId });
    if (!existing) return false;
    em.remove(existing);
    await em.flush();
    return true;
  }
}

/**
 * "Verwaltung → Datenschutz" and the data protection tab of the person file: restricting the processing of a person,
 * the restricted persons and the persons without recorded information.
 */
@Controller('privacy')
@RequirePermissions(PRIVACY_PERMISSION)
export class PersonPrivacyController {
  constructor(
    private readonly em: EntityManager,
    private readonly privacy: PersonPrivacyService,
    private readonly audit: Audit,
    private readonly organization: OrganizationDirectory,
    @Inject(PERSON_DIRECTORY) private readonly persons: PersonDirectory,
  ) {}

  @Put('persons/:id/restriction')
  async restrict(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(ProcessingRestrictionInput)) input: ReturnType<typeof ProcessingRestrictionInput.parse>): Promise<ProcessingRestriction> {
    if (!(await this.privacy.restrict(id, input))) throw new NotFoundException();
    await this.audit.log('privacy.restricted', { personId: id, reason: input.reason, ...(input.until ? { until: input.until } : {}), ...(input.requestId ? { requestId: input.requestId } : {}) });
    return (await this.privacy.restriction(id))!;
  }

  /** Lifts the restriction: the person shows up again in lists, search, pickers, deadlines and e-mails. */
  @Delete('persons/:id/restriction')
  @HttpCode(204)
  async lift(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    if (await this.privacy.lift(id)) await this.audit.log('privacy.restriction-lifted', { personId: id });
  }

  @Get('restricted')
  async restricted(): Promise<RestrictedPerson[]> {
    const rows = await this.em.fork().find(ProcessingRestrictionEntity, {});
    const persons = new Map(((await this.organization.persons(rows.map((r) => r.personId))) ?? []).map((person) => [person.id, person]));
    return rows
      .flatMap((r) => {
        const person = persons.get(r.personId);
        return person ? [{ id: person.id, firstName: person.firstName, lastName: person.lastName, restriction: toRestriction(r) }] : [];
      })
      .toSorted((a, b) => a.lastName.localeCompare(b.lastName, 'de') || a.firstName.localeCompare(b.firstName, 'de'));
  }

  /**
   * Persons not informed yet (Art. 13/14): no information recorded and no linked user who acknowledged the privacy
   * notice; without persons who left, were anonymised or whose processing is restricted.
   */
  @Get('uninformed')
  async uninformed(): Promise<UninformedPerson[]> {
    const em = this.em.fork();
    const informed = new Set((await em.find(PrivacyInformationEntity, {}, { fields: ['personId'] })).map((i) => i.personId));
    const acknowledgedUsers = (await em.find(NoticeAcknowledgementEntity, {}, { fields: ['userId'] })).map((a) => a.userId);
    const acknowledged = new Set(
      acknowledgedUsers.length ? (await em.find(User, { id: { $in: acknowledgedUsers }, personId: { $ne: null } }, { fields: ['personId'] })).map((u) => u.personId) : [],
    );
    // Persons who have not left and are not restricted (anonymised persons have left).
    const careers = await this.persons.careers();
    return careers
      .filter((person) => !informed.has(person.id) && !acknowledged.has(person.id))
      .map((person) => ({ id: person.id, firstName: person.firstName, lastName: person.lastName, status: person.status, primaryDepartmentId: person.primaryDepartmentId, joinedOn: person.joinedOn }))
      .toSorted((a, b) => a.lastName.localeCompare(b.lastName, 'de') || a.firstName.localeCompare(b.firstName, 'de'));
  }

  /** "Information erteilt am" for one or many persons, e.g. after the transfer from MP-Feuer (letter, posting). */
  @Post('information')
  @HttpCode(200)
  async information(@Body(new ZodPipe(PrivacyInformationInput)) input: PrivacyInformationInput): Promise<{ count: number }> {
    const known = (await this.organization.persons(input.personIds)) ?? [];
    const ids = known.map((person) => person.id);
    const em = this.em.fork();
    const existing = new Map((await em.find(PrivacyInformationEntity, { personId: { $in: ids } })).map((i) => [i.personId, i]));
    for (const personId of ids) {
      const stored = existing.get(personId);
      if (stored) em.assign(stored, { informedOn: input.informedOn, via: input.via });
      else em.create(PrivacyInformationEntity, { personId, informedOn: input.informedOn, via: input.via });
    }
    await em.flush();
    await this.audit.log('privacy.information-recorded', { count: ids.length, informedOn: input.informedOn, via: input.via, ...(ids.length === 1 ? { personId: ids[0] } : {}) });
    return { count: ids.length };
  }
}

/** A planned end of a restriction is a task of everybody holding `privacy.manage` (the restriction stays until lifted). */
@Injectable()
export class RestrictionDeadlines implements DeadlineProvider {
  readonly module = 'privacy';

  constructor(private readonly em: EntityManager) {}

  async deadlines(): Promise<DeadlineInput[]> {
    const found = await this.em.fork().find(ProcessingRestrictionEntity, { until: { $ne: null } });
    return found.map((r) => ({
      id: `restriction-ends:${r.personId}`,
      kind: 'restriction-ends',
      title: { de: 'Einschränkung der Verarbeitung endet: prüfen und aufheben', en: 'Restriction of processing ends: review and lift' },
      // No name: the task is about a person who must not appear in deadlines and e-mails.
      subject: { type: 'privacy.processing-restriction', id: r.personId, label: r.until! },
      dueOn: r.until!,
      leadDays: 14,
      departmentIds: [],
      permission: PRIVACY_PERMISSION,
      held: true,
      to: `/masterdata/persons/${r.personId}?tab=privacy`,
    }));
  }
}
