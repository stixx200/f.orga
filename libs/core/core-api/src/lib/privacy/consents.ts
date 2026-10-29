import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
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
} from '@nestjs/common';
import { defineEntity, EntityManager, p } from '@mikro-orm/core';
import { v7 as uuidv7 } from 'uuid';
import {
  CONSENT_EFFECTS,
  CONSENT_TEMPLATES,
  consentApplies,
  type ConsentCatalog,
  type ConsentDefinition,
  ConsentDefinitionInput,
  type ConsentEffect,
  type ConsentLookup,
  ConsentRecordInput,
  type ConsentWay,
  ConsentWithdrawalInput,
  type ConsentWithdrawalWay,
  CONSENTS_PERMISSION,
  type LocalizedText,
  type MyConsents,
  MyConsentInput,
  OPEN_REQUEST_STATUSES,
  type PersonConsent,
  type PersonConsents,
  PRIVACY_PERMISSION,
  PrivacyConsents,
} from '@forga/core-contracts';
import { Audit } from '../audit/audit.js';
import { Attachments } from '../attachments/attachments.js';
import type { DescribeContext, PersonDataSection } from '../access-report/person-description.js';
import { berlinDate } from '../imports/parse.js';
import type { AuthenticatedUser } from '../security/authenticated-user.js';
import { CurrentUser, RequirePermissions } from '../security/decorators.js';
import { OrganizationDirectory } from '../security/organization-directory.js';
import { User } from '../security/security.entities.js';
import { SettingsService } from '../settings/settings.js';
import { ZodPipe } from '../zod.pipe.js';
import { PrivacyRequestEntity } from './privacy.entities.js';
import { PrivacyRequests } from './privacy-requests.js';

const SECTION = 'privacy.consents';
/** Attachments (proof, e.g. the scan of a signed form) of a consent. */
export const CONSENT_ATTACHMENTS = 'core.consent';

/**
 * A consent of a person (L9). Never deleted, only withdrawn (or superseded by a consent to a newer version); the
 * history of the record is the proof. Title and text of the version consented to are stored with it.
 */
export const ConsentSchema = defineEntity({
  name: 'ConsentEntity',
  schema: 'core',
  tableName: 'consent',
  indexes: [{ properties: ['personId'] }, { properties: ['key'] }],
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    /** Person in the master data module; no foreign key across modules. */
    personId: p.string(),
    key: p.string(),
    /** Version of the catalog entry consented to. */
    definitionVersion: p.integer(),
    title: p.json<LocalizedText>(),
    text: p.json<{ de: string; en: string }>(),
    givenOn: p.string().length(10),
    givenVia: p.string().$type<ConsentWay>(),
    /** User who recorded it (the person itself in "My area"); no foreign key. */
    recordedBy: p.string().nullable(),
    withdrawnOn: p.string().length(10).nullable(),
    withdrawnVia: p.string().$type<ConsentWithdrawalWay>().nullable(),
    withdrawnBy: p.string().nullable(),
    /** Request of kind "withdrawal of consent" closed by the withdrawal. */
    requestId: p.string().nullable(),
    /** The person consented again to a newer version; this record no longer counts. */
    supersededOn: p.string().length(10).nullable(),
    createdAt: p.datetime().onCreate(() => new Date()),
  },
});
export class ConsentEntity extends ConsentSchema.class {}
ConsentSchema.setClass(ConsentEntity);

const valid = (c: ConsentEntity) => !c.withdrawnOn && !c.supersededOn;
const same = (a: object, b: object) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Consents (L9): the catalog in the setting `privacy.consents`, consents of persons, their effects for modules
 * (`CONSENTS`) and the own consents in "My area" and at the first sign-in.
 */
@Injectable()
export class ConsentService implements ConsentLookup, OnModuleInit {
  constructor(
    private readonly em: EntityManager,
    private readonly settings: SettingsService,
    private readonly organization: OrganizationDirectory,
    private readonly audit: Audit,
    private readonly attachments: Attachments,
    private readonly requests: PrivacyRequests,
  ) {}

  onModuleInit(): void {
    const access = async (user: AuthenticatedUser, id: string) => {
      const consent = await this.em.fork().findOne(ConsentEntity, id);
      return consent ? this.mayRecord(user, consent.personId) : false;
    };
    this.attachments.register(CONSENT_ATTACHMENTS, { read: access, write: access });
  }

  async catalog(): Promise<ConsentDefinition[]> {
    return PrivacyConsents.parse((await this.settings.get(SECTION)) ?? {}).consents;
  }

  private async saveCatalog(consents: ConsentDefinition[]): Promise<void> {
    await this.settings.set(SECTION, { consents });
  }

  /** Persons with a valid consent per catalog key. */
  async givenCounts(): Promise<Record<string, number>> {
    const rows: { key: string; count: string }[] = await this.em
      .fork()
      .getConnection()
      .execute('select "key", count(distinct "person_id") as "count" from "core"."consent" where "withdrawn_on" is null and "superseded_on" is null group by "key"');
    return Object.fromEntries(rows.map((r) => [r.key, Number(r.count)]));
  }

  async catalogDto(): Promise<ConsentCatalog> {
    return {
      consents: await this.catalog(),
      given: await this.givenCounts(),
      effects: (Object.entries(CONSENT_EFFECTS) as [ConsentEffect, (typeof CONSENT_EFFECTS)[ConsentEffect]][]).map(([key, e]) => ({ key, module: e.module, label: e.label })),
    };
  }

  /**
   * Creates or changes a catalog entry. A changed title, text or purpose is a new version and a template again; consents
   * already given keep their version.
   */
  async saveDefinition(key: string, input: ReturnType<typeof ConsentDefinitionInput.parse>, user: AuthenticatedUser): Promise<ConsentDefinition> {
    if (!/^[a-z][a-z0-9-]{1,59}$/.test(key)) throw new BadRequestException({ code: 'privacy.consentKeyInvalid' });
    const catalog = await this.catalog();
    const existing = catalog.find((c) => c.key === key);
    const now = new Date().toISOString();
    if (!existing) {
      if (input.version !== undefined) throw new NotFoundException({ code: 'privacy.consentUnknown' });
      const created: ConsentDefinition = { key, ...input, version: 1, changedAt: now, changedBy: user.displayName, reviewedAt: null, reviewedBy: null };
      await this.saveCatalog([...catalog, created]);
      await this.audit.log('privacy.consent-definition-changed', { key, version: 1, created: true });
      return created;
    }
    if (input.version !== existing.version) throw new ConflictException({ code: 'conflict.stale', current: existing.version, expected: input.version });
    const newVersion = !same(existing.title, input.title) || !same(existing.text, input.text) || !same(existing.purpose, input.purpose);
    const changed: ConsentDefinition = {
      ...existing,
      title: input.title,
      text: input.text,
      purpose: input.purpose,
      givenBy: input.givenBy,
      effects: input.effects,
      active: input.active,
      ...(newVersion ? { version: existing.version + 1, changedAt: now, changedBy: user.displayName, reviewedAt: null, reviewedBy: null } : {}),
    };
    await this.saveCatalog(catalog.map((c) => (c.key === key ? changed : c)));
    await this.audit.log('privacy.consent-definition-changed', { key, version: changed.version, active: changed.active });
    return changed;
  }

  /** "Als geprüft markieren": the entry was reviewed with the data protection officer; active entries apply from now on. */
  async review(key: string, version: unknown, user: AuthenticatedUser): Promise<ConsentDefinition> {
    const catalog = await this.catalog();
    const existing = catalog.find((c) => c.key === key);
    if (!existing) throw new NotFoundException({ code: 'privacy.consentUnknown' });
    if (version !== existing.version) throw new ConflictException({ code: 'conflict.stale', current: existing.version, expected: version });
    const reviewed = { ...existing, reviewedAt: new Date().toISOString(), reviewedBy: user.displayName };
    await this.saveCatalog(catalog.map((c) => (c.key === key ? reviewed : c)));
    await this.audit.log('privacy.consent-definition-reviewed', { key, version: existing.version });
    return reviewed;
  }

  /** "Vorlagen einfügen": the templates not yet in the catalog, as templates (not reviewed). */
  async insertTemplates(user: AuthenticatedUser): Promise<number> {
    const catalog = await this.catalog();
    const now = new Date().toISOString();
    const added = Object.entries(CONSENT_TEMPLATES)
      .filter(([key]) => !catalog.some((c) => c.key === key))
      .map(([key, template]): ConsentDefinition => ({
        key,
        ...ConsentDefinitionInput.parse(template),
        version: 1,
        changedAt: now,
        changedBy: user.displayName,
        reviewedAt: null,
        reviewedBy: null,
      }));
    if (added.length) {
      await this.saveCatalog([...catalog, ...added]);
      await this.audit.log('privacy.consent-templates-inserted', { keys: added.map((a) => a.key) });
    }
    return added.length;
  }

  /** Removes an entry nobody consented to yet; entries with consents are deactivated instead. */
  async removeDefinition(key: string): Promise<void> {
    const catalog = await this.catalog();
    if (!catalog.some((c) => c.key === key)) throw new NotFoundException({ code: 'privacy.consentUnknown' });
    if (await this.em.fork().count(ConsentEntity, { key })) throw new ConflictException({ code: 'privacy.consentInUse' });
    await this.saveCatalog(catalog.filter((c) => c.key !== key));
    await this.audit.log('privacy.consent-definition-removed', { key });
  }

  async find(id: string): Promise<ConsentEntity | null> {
    return /^[0-9a-f-]{36}$/i.test(id) ? this.em.fork().findOne(ConsentEntity, id) : null;
  }

  // ----- Effects for modules -----

  async has(personId: string, key: string): Promise<boolean> {
    return (await this.em.fork().count(ConsentEntity, { personId, key, withdrawnOn: null, supersededOn: null })) > 0;
  }

  async withEffect(effect: ConsentEffect, personIds: readonly string[]): Promise<Set<string>> {
    const keys = (await this.catalog()).filter((c) => c.effects.includes(effect)).map((c) => c.key);
    if (!keys.length || !personIds.length) return new Set();
    const found = await this.em.fork().find(ConsentEntity, { personId: { $in: [...personIds] }, key: { $in: keys }, withdrawnOn: null, supersededOn: null }, { fields: ['personId'] });
    return new Set(found.map((c) => c.personId));
  }

  // ----- Consents of a person (administration) -----

  /** Recording and reading consents: `core.privacy.manage`, or `core.privacy.consents` for a department of the person. */
  async mayRecord(user: AuthenticatedUser, personId: string): Promise<boolean> {
    if (user.can(PRIVACY_PERMISSION)) return true;
    const grant = user.grant(CONSENTS_PERMISSION);
    if (!grant) return false;
    if (grant === 'brigade') return true;
    const person = (await this.organization.persons([personId]))?.[0];
    return Boolean(person?.departmentIds.some((id) => user.can(CONSENTS_PERMISSION, id)));
  }

  private async assertMayRecord(user: AuthenticatedUser, personId: string): Promise<void> {
    if (await this.mayRecord(user, personId)) return;
    throw user.denied([PRIVACY_PERMISSION, CONSENTS_PERMISSION]);
  }

  private async assertPerson(personId: string): Promise<void> {
    const known = await this.organization.persons([personId]);
    if (known && !known.length) throw new NotFoundException({ code: 'privacy.personUnknown' });
  }

  async isMinor(personId: string): Promise<boolean> {
    return (await this.organization.minors([personId])).has(personId);
  }

  async forPerson(user: AuthenticatedUser, personId: string): Promise<PersonConsents> {
    await this.assertMayRecord(user, personId);
    await this.assertPerson(personId);
    const em = this.em.fork();
    const [consents, catalog] = await Promise.all([em.find(ConsentEntity, { personId }, { orderBy: { givenOn: 'desc', createdAt: 'desc' } }), this.catalog()]);
    return {
      consents: await this.toDtos(consents, catalog),
      recordable: catalog.filter(consentApplies).map((c) => ({ key: c.key, title: c.title, version: c.version, givenBy: c.givenBy })),
      canRecord: true,
      minor: await this.isMinor(personId),
    };
  }

  private async toDtos(consents: ConsentEntity[], catalog: ConsentDefinition[]): Promise<PersonConsent[]> {
    const userIds = [...new Set(consents.flatMap((c) => [c.recordedBy, c.withdrawnBy]).filter((id): id is string => Boolean(id)))];
    const users = new Map((userIds.length ? await this.em.fork().find(User, { id: { $in: userIds } }, { fields: ['id', 'displayName'] }) : []).map((u) => [u.id, u.displayName]));
    const proofs = await this.attachments.count(CONSENT_ATTACHMENTS, consents.map((c) => c.id));
    return consents.map((c) => ({
      id: c.id,
      key: c.key,
      title: c.title,
      text: c.text,
      version: c.definitionVersion,
      currentVersion: catalog.find((d) => d.key === c.key)?.version ?? null,
      givenOn: c.givenOn,
      givenVia: c.givenVia,
      recordedByName: c.recordedBy ? (users.get(c.recordedBy) ?? null) : null,
      withdrawnOn: c.withdrawnOn ?? null,
      withdrawnVia: c.withdrawnVia ?? null,
      withdrawnByName: c.withdrawnBy ? (users.get(c.withdrawnBy) ?? null) : null,
      supersededOn: c.supersededOn ?? null,
      requestId: c.requestId ?? null,
      proofCount: proofs.get(c.id) ?? 0,
    }));
  }

  /**
   * Records a consent given in writing, in person or by the legal guardians (minors, entries "Person oder
   * Erziehungsberechtigte"). An older valid consent of the same entry is superseded.
   */
  async record(user: AuthenticatedUser, personId: string, input: ReturnType<typeof ConsentRecordInput.parse>): Promise<PersonConsent> {
    await this.assertMayRecord(user, personId);
    await this.assertPerson(personId);
    const definition = (await this.catalog()).find((c) => c.key === input.key);
    if (!definition || !consentApplies(definition)) throw new BadRequestException({ code: 'privacy.consentNotApplicable' });
    if (input.givenOn > berlinDate()) throw new BadRequestException({ code: 'privacy.consentInFuture' });
    if (definition.givenBy === 'person-or-guardians' && input.via !== 'guardians' && (await this.isMinor(personId))) {
      throw new BadRequestException({ code: 'privacy.consentGuardiansRequired' });
    }
    const consent = await this.give(personId, definition, input.givenOn, input.via, user.id);
    return (await this.toDtos([consent], await this.catalog()))[0];
  }

  private async give(personId: string, definition: ConsentDefinition, givenOn: string, via: ConsentWay, userId: string): Promise<ConsentEntity> {
    const em = this.em.fork();
    const current = await em.find(ConsentEntity, { personId, key: definition.key, withdrawnOn: null, supersededOn: null });
    if (current.some((c) => c.definitionVersion === definition.version)) throw new ConflictException({ code: 'privacy.consentGiven' });
    for (const old of current) old.supersededOn = givenOn;
    const consent = em.create(ConsentEntity, {
      personId,
      key: definition.key,
      definitionVersion: definition.version,
      title: definition.title,
      text: definition.text,
      givenOn,
      givenVia: via,
      recordedBy: userId,
    });
    await em.flush();
    await this.audit.log('privacy.consent-given', { personId, key: definition.key, version: definition.version, via });
    return consent;
  }

  /**
   * Withdrawal (Art. 7(3)): applies from now on. With `requestId` of an open request "withdrawal of consent" of the same
   * person, the request is closed as done.
   */
  async withdraw(user: AuthenticatedUser, id: string, input: ReturnType<typeof ConsentWithdrawalInput.parse>): Promise<PersonConsent> {
    const em = this.em.fork();
    const consent = await em.findOne(ConsentEntity, id);
    if (!consent) throw new NotFoundException({ code: 'privacy.consentUnknown' });
    await this.assertMayRecord(user, consent.personId);
    if (!valid(consent)) throw new ConflictException({ code: 'privacy.consentWithdrawn' });
    if (input.withdrawnOn > berlinDate()) throw new BadRequestException({ code: 'privacy.consentInFuture' });
    if (input.withdrawnOn < consent.givenOn) throw new BadRequestException({ code: 'privacy.withdrawnBeforeGiven' });
    let request: PrivacyRequestEntity | null = null;
    if (input.requestId) {
      request = await em.findOne(PrivacyRequestEntity, input.requestId);
      if (!request || request.personId !== consent.personId || request.kind !== 'consent-withdrawal' || !OPEN_REQUEST_STATUSES.includes(request.status)) {
        throw new BadRequestException({ code: 'privacy.requestMismatch' });
      }
      if (!user.can(PRIVACY_PERMISSION)) throw user.denied([PRIVACY_PERMISSION]);
    }
    em.assign(consent, { withdrawnOn: input.withdrawnOn, withdrawnVia: request ? 'request' : input.via, withdrawnBy: user.id, requestId: request?.id ?? null });
    await em.flush();
    await this.audit.log('privacy.consent-withdrawn', { personId: consent.personId, key: consent.key, via: consent.withdrawnVia, ...(request ? { requestId: request.id } : {}) });
    if (request) await this.requests.closeDone(request.id, input.withdrawnOn);
    return (await this.toDtos([consent], await this.catalog()))[0];
  }

  // ----- Own consents ("My area", first sign-in) -----

  private assertOwn(user: AuthenticatedUser): string {
    if (user.impersonator || user.via !== 'session') throw new ForbiddenException({ code: 'privacy.ownConsentOnly' });
    if (!user.personId) throw new BadRequestException({ code: 'privacy.noPerson' });
    return user.personId;
  }

  /** The entries that apply and the person's consents (also to entries that no longer apply). */
  async mine(user: AuthenticatedUser): Promise<MyConsents> {
    if (!user.personId) return { minor: false, consents: [] };
    const [catalog, consents, minor] = await Promise.all([
      this.catalog(),
      this.em.fork().find(ConsentEntity, { personId: user.personId }, { orderBy: { givenOn: 'desc', createdAt: 'desc' } }),
      this.isMinor(user.personId),
    ]);
    const keys = [...new Set([...catalog.filter(consentApplies).map((c) => c.key), ...consents.map((c) => c.key)])];
    return {
      minor,
      consents: keys.map((key) => {
        const definition = catalog.find((c) => c.key === key);
        const applies = definition && consentApplies(definition) ? definition : null;
        const latest = consents.find((c) => c.key === key && !c.supersededOn);
        const current = latest && !latest.withdrawnOn ? latest : null;
        return {
          key,
          title: applies?.title ?? latest!.title,
          text: applies?.text ?? latest!.text,
          purpose: applies?.purpose ?? definition?.purpose ?? { de: '', en: '' },
          version: applies?.version ?? null,
          given: current ? { id: current.id, version: current.definitionVersion, givenOn: current.givenOn, via: current.givenVia } : null,
          withdrawnOn: latest?.withdrawnOn ?? null,
        };
      }),
    };
  }

  /** Gives or withdraws an own consent; minors only see theirs (the legal guardians consent in writing). */
  async setMine(user: AuthenticatedUser, key: string, input: ReturnType<typeof MyConsentInput.parse>): Promise<MyConsents> {
    const personId = this.assertOwn(user);
    if (await this.isMinor(personId)) throw new ForbiddenException({ code: 'privacy.consentMinor' });
    const today = berlinDate();
    if (input.given) {
      const definition = (await this.catalog()).find((c) => c.key === key);
      if (!definition || !consentApplies(definition)) throw new BadRequestException({ code: 'privacy.consentNotApplicable' });
      if (input.version !== definition.version) throw new ConflictException({ code: 'conflict.stale', current: definition.version, expected: input.version });
      if (!(await this.em.fork().count(ConsentEntity, { personId, key, definitionVersion: definition.version, withdrawnOn: null, supersededOn: null }))) {
        await this.give(personId, definition, today, input.firstLogin ? 'first-login' : 'my-area', user.id);
      }
    } else {
      const em = this.em.fork();
      const current = await em.find(ConsentEntity, { personId, key, withdrawnOn: null, supersededOn: null });
      for (const consent of current) em.assign(consent, { withdrawnOn: today, withdrawnVia: 'my-area', withdrawnBy: user.id });
      await em.flush();
      if (current.length) await this.audit.log('privacy.consent-withdrawn', { personId, key, via: 'my-area' });
    }
    return this.mine(user);
  }

  // ----- Access report -----

  /** Consents of the person with version, way and withdrawal, for the access report; empty without consents. */
  async describe(personId: string, ctx: DescribeContext): Promise<PersonDataSection | null> {
    const consents = await this.em.fork().find(ConsentEntity, { personId }, { orderBy: { givenOn: 'asc', createdAt: 'asc' } });
    if (!consents.length) return null;
    const ways: Record<ConsentWay | ConsentWithdrawalWay, LocalizedText> = {
      written: { de: 'schriftlich', en: 'in writing' },
      'in-person': { de: 'persönlich', en: 'in person' },
      guardians: { de: 'durch Erziehungsberechtigte', en: 'by the legal guardians' },
      'my-area': { de: 'in Mein Bereich', en: 'in My area' },
      'first-login': { de: 'bei der ersten Anmeldung', en: 'at the first sign-in' },
      email: { de: 'per E-Mail', en: 'by e-mail' },
      request: { de: 'auf Ihre Anfrage', en: 'on your request' },
    };
    const state = (c: ConsentEntity) =>
      c.withdrawnOn
        ? ctx.t(`widerrufen am ${ctx.date(c.withdrawnOn)} (${ctx.text(ways[c.withdrawnVia ?? 'written'])})`, `withdrawn on ${ctx.date(c.withdrawnOn)} (${ctx.text(ways[c.withdrawnVia ?? 'written'])})`)
        : c.supersededOn
          ? ctx.t(`ersetzt durch eine neue Fassung am ${ctx.date(c.supersededOn)}`, `replaced by a new version on ${ctx.date(c.supersededOn)}`)
          : ctx.t('erteilt', 'given');
    return {
      key: 'core.consents',
      title: ctx.t('Einwilligungen', 'Consents'),
      activity: 'core.accounts',
      categories: [ctx.t('Einwilligungen mit Fassung und Nachweis', 'Consents with version and proof')],
      blocks: [
        {
          kind: 'table',
          columns: [ctx.t('Einwilligung', 'Consent'), ctx.t('Fassung', 'Version'), ctx.t('Erteilt', 'Given'), ctx.t('Erfasst von', 'Recorded by'), ctx.t('Stand', 'State')],
          rows: await Promise.all(
            consents.map(async (c) => [ctx.text(c.title), String(c.definitionVersion), `${ctx.date(c.givenOn)} (${ctx.text(ways[c.givenVia])})`, await ctx.actor(c.recordedBy), state(c)]),
          ),
        },
      ],
      records: [{ entity: 'core.consent', ids: consents.map((c) => c.id), label: ctx.t('Einwilligung', 'Consent') }],
    };
  }
}

/** Catalog (`core.privacy.manage`), consents of persons and own consents. */
@Controller('core/privacy')
export class ConsentsController {
  constructor(private readonly consents: ConsentService) {}

  @Get('consents')
  @RequirePermissions(PRIVACY_PERMISSION)
  catalog(): Promise<ConsentCatalog> {
    return this.consents.catalogDto();
  }

  @Post('consents/templates')
  @HttpCode(200)
  @RequirePermissions(PRIVACY_PERMISSION)
  async templates(@CurrentUser() user: AuthenticatedUser): Promise<ConsentCatalog> {
    await this.consents.insertTemplates(user);
    return this.consents.catalogDto();
  }

  @Put('consents/:key')
  @RequirePermissions(PRIVACY_PERMISSION)
  async save(@Param('key') key: string, @Body(new ZodPipe(ConsentDefinitionInput)) input: ReturnType<typeof ConsentDefinitionInput.parse>, @CurrentUser() user: AuthenticatedUser): Promise<ConsentCatalog> {
    await this.consents.saveDefinition(key, input, user);
    return this.consents.catalogDto();
  }

  @Post('consents/:key/review')
  @HttpCode(200)
  @RequirePermissions(PRIVACY_PERMISSION)
  async review(@Param('key') key: string, @Body() body: { version?: unknown }, @CurrentUser() user: AuthenticatedUser): Promise<ConsentCatalog> {
    await this.consents.review(key, body?.version, user);
    return this.consents.catalogDto();
  }

  @Delete('consents/:key')
  @RequirePermissions(PRIVACY_PERMISSION)
  async remove(@Param('key') key: string): Promise<ConsentCatalog> {
    await this.consents.removeDefinition(key);
    return this.consents.catalogDto();
  }

  @Get('persons/:personId/consents')
  forPerson(@Param('personId', ParseUUIDPipe) personId: string, @CurrentUser() user: AuthenticatedUser): Promise<PersonConsents> {
    return this.consents.forPerson(user, personId);
  }

  @Post('persons/:personId/consents')
  record(
    @Param('personId', ParseUUIDPipe) personId: string,
    @Body(new ZodPipe(ConsentRecordInput)) input: ReturnType<typeof ConsentRecordInput.parse>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PersonConsent> {
    return this.consents.record(user, personId, input);
  }

  @Post('given-consents/:id/withdraw')
  @HttpCode(200)
  withdraw(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(ConsentWithdrawalInput)) input: ReturnType<typeof ConsentWithdrawalInput.parse>, @CurrentUser() user: AuthenticatedUser): Promise<PersonConsent> {
    return this.consents.withdraw(user, id, input);
  }

  @Get('me/consents')
  mine(@CurrentUser() user: AuthenticatedUser): Promise<MyConsents> {
    return this.consents.mine(user);
  }

  @Put('me/consents/:key')
  setMine(@Param('key') key: string, @Body(new ZodPipe(MyConsentInput)) input: ReturnType<typeof MyConsentInput.parse>, @CurrentUser() user: AuthenticatedUser): Promise<MyConsents> {
    return this.consents.setMine(user, key, input);
  }
}
