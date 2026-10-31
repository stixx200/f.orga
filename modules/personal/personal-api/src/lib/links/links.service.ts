import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, Optional, ServiceUnavailableException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { Audit, type AuthenticatedUser, CookiePolicy, decryptSecret, encryptSecret, hashSecret, MailService, refuseRestricted, serverKey } from '@forga/core-api';
import { CLOTHING_HELD, type ClothingHeld } from '@forga/clothing-contracts';
import { INCIDENTS_LOOKUP, type IncidentsLookup } from '@forga/incidents-contracts';
import { PERSON_DIRECTORY, type PersonDirectory, type PersonSummary } from '@forga/masterdata-contracts';
import { type MailedLink, type PersonalLink, type PersonalLinkCreated, PERSONAL_MANAGE, PERSONAL_READ, type PersonalView, type ShownLink } from '@forga/personal-contracts';
import { RESPIRATORY_PROTECTION_FITNESS, type FitnessLookup } from '@forga/respiratory-protection-contracts';
import { TRAINING_SESSIONS, type TrainingSessions } from '@forga/training-contracts';
import { AccessLinkEntity } from '../personal.entities.js';
import { generateAccessKey, sameHash } from '../security/access-keys.js';

@Injectable()
export class LinksService {
  constructor(
    private readonly em: EntityManager,
    private readonly audit: Audit,
    private readonly cookies: CookiePolicy,
    private readonly mailer: MailService,
    @Inject(PERSON_DIRECTORY) private readonly directory: PersonDirectory,
    @Optional() @Inject(RESPIRATORY_PROTECTION_FITNESS) private readonly fitness?: FitnessLookup,
    @Optional() @Inject(INCIDENTS_LOOKUP) private readonly incidents?: IncidentsLookup,
    @Optional() @Inject(TRAINING_SESSIONS) private readonly sessions?: TrainingSessions,
    @Optional() @Inject(CLOTHING_HELD) private readonly clothing?: ClothingHeld,
  ) {}

  async list(user: AuthenticatedUser): Promise<PersonalLink[]> {
    const rows = await this.em.fork().find(AccessLinkEntity, {}, { orderBy: { createdAt: 'desc' } });
    const people = await this.directory.summaries(rows.map((row) => row.personId));
    const byId = new Map(people.map((person) => [person.id, person]));
    return rows.flatMap((row) => {
      const person = byId.get(row.personId);
      if (!person || !this.may(user, PERSONAL_READ, person)) return [];
      return [this.toDto(row, person)];
    });
  }

  async current(user: AuthenticatedUser, personId: string): Promise<PersonalLink | null> {
    const person = await this.person(user, personId, PERSONAL_READ);
    const row = await this.em.fork().findOne(AccessLinkEntity, { personId });
    return row ? this.toDto(row, person) : null;
  }

  /** Creates the link, or replaces the key of the existing one. The clear-text key is returned only here. */
  async create(user: AuthenticatedUser, personId: string): Promise<PersonalLinkCreated> {
    const person = await this.person(user, personId, PERSONAL_MANAGE);
    refuseRestricted(await this.directory.isRestricted(personId));
    const secret = this.secret();
    const base = await this.publicBase();
    const key = generateAccessKey();
    const em = this.em.fork();
    const existing = await em.findOne(AccessLinkEntity, { personId });
    const fields = { keyHash: hashSecret(key), keyPrefix: key.slice(0, 12), keyEncrypted: encryptSecret(key, secret), revokedAt: null, revokedBy: null };
    const row = existing ?? em.create(AccessLinkEntity, { personId, createdAt: new Date(), createdBy: user.displayName, lastSeenAt: null, ...fields });
    if (existing) em.assign(existing, fields);
    await em.flush();
    await this.audit.log('personal.link-created', { personId, linkId: row.id }, user.id);
    return { link: this.toDto(row, person), url: this.url(base, key), key };
  }

  /** Shows the link again. Every time is written to the audit log. */
  async show(user: AuthenticatedUser, personId: string): Promise<ShownLink> {
    const person = await this.person(user, personId, PERSONAL_MANAGE);
    refuseRestricted(await this.directory.isRestricted(personId));
    const row = await this.em.fork().findOne(AccessLinkEntity, { personId }, { populate: ['keyEncrypted'] });
    if (!row || row.revokedAt) throw new NotFoundException({ code: 'personal.unknownPerson' });
    this.mayOrFail(user, PERSONAL_MANAGE, person);
    const secret = this.secret();
    const key = row.keyEncrypted ? decryptSecret(row.keyEncrypted, secret) : null;
    if (!key) throw new ConflictException({ code: 'personal.linkUnavailable' });
    await this.audit.log('personal.link-shown', { personId, linkId: row.id }, user.id);
    return { url: this.url(await this.publicBase(), key), key };
  }

  async revoke(user: AuthenticatedUser, personId: string): Promise<PersonalLink> {
    const person = await this.person(user, personId, PERSONAL_MANAGE);
    const em = this.em.fork();
    const row = await em.findOne(AccessLinkEntity, { personId });
    if (!row || row.revokedAt) throw new NotFoundException({ code: 'personal.unknownPerson' });
    em.assign(row, { keyHash: hashSecret(generateAccessKey()), keyEncrypted: null, revokedAt: new Date(), revokedBy: user.displayName });
    await em.flush();
    await this.audit.log('personal.link-revoked', { personId, linkId: row.id }, user.id);
    return this.toDto(row, person);
  }

  /**
   * Sends the link to the person's e-mail address. Without an active link, one is created first.
   * The clear-text key is only in the mail.
   */
  async mail(user: AuthenticatedUser, personId: string): Promise<MailedLink> {
    const person = await this.person(user, personId, PERSONAL_MANAGE);
    refuseRestricted(await this.directory.isRestricted(personId));
    if (!person.email.trim()) throw new BadRequestException({ code: 'personal.noEmail' });
    const base = await this.publicBase();
    const secret = this.secret();
    const row = await this.em.fork().findOne(AccessLinkEntity, { personId }, { populate: ['keyEncrypted'] });
    const stored = row && !row.revokedAt && row.keyEncrypted ? decryptSecret(row.keyEncrypted, secret) : null;
    const created = stored ? null : await this.create(user, personId);
    const key = stored ?? created?.key;
    if (!key) throw new ConflictException({ code: 'personal.linkUnavailable' });
    const url = this.url(base, key);
    const name = `${person.firstName} ${person.lastName}`.trim();
    await this.mailer.send({
      to: person.email,
      subject: 'f.orga: Persönlicher Zugang / Personal access',
      text: [
        `Hallo ${name},`,
        '',
        'mit diesem Link sehen Sie in f.orga Ihre eigenen Daten. Er gilt nur für Sie:',
        url,
        '',
        'Wenn Sie den Link nicht erwartet haben, ignorieren Sie diese E-Mail.',
        '',
        `Hello ${name},`,
        '',
        'this link shows your own data in f.orga. It is meant only for you:',
        url,
        '',
        'If you did not expect this link, ignore this e-mail.',
      ].join('\n'),
    });
    await this.audit.log('personal.link-mailed', { personId, linkId: created?.link.id ?? row?.id }, user.id);
    return { email: person.email };
  }

  /** The file behind a valid access key. Examinations have no medical detail; incidents have no report text or pay. */
  async view(link: AccessLinkEntity): Promise<PersonalView> {
    refuseRestricted(await this.directory.isRestricted(link.personId));
    const file = await this.directory.personalFile(link.personId);
    if (!file) throw new NotFoundException({ code: 'personal.gone' });
    const departmentIds = file.memberships.map((membership) => membership.departmentId);
    const [respiratory, incidents, sessions, upcoming, courses, clothing] = await Promise.all([
      this.fitness ? this.fitness.personalView(link.personId) : null,
      this.incidents ? this.incidents.recentForPerson(link.personId) : null,
      this.sessions ? this.sessions.recentForPerson(link.personId) : null,
      this.sessions ? this.sessions.upcomingForDepartments(departmentIds) : null,
      this.directory.openCourses(link.personId),
      this.clothing ? this.clothing.heldBy(link.personId) : null,
    ]);
    return { ...file, respiratory, incidents, sessions, upcoming, courses, clothing };
  }

  /** Refuses the kiosk while processing of this person is restricted (Art. 18). */
  async assertNotRestricted(link: AccessLinkEntity): Promise<void> {
    refuseRestricted(await this.directory.isRestricted(link.personId));
  }

  /** Marks the link as seen without writing history. */
  async touch(id: string): Promise<void> {
    await this.em.fork().nativeUpdate(AccessLinkEntity, { id }, { lastSeenAt: new Date() });
  }

  /** The link of a key, or `null` when the key is unknown. Revoked links are returned so the caller can say so. */
  async findByKey(key: string | undefined): Promise<AccessLinkEntity | null> {
    const hash = key ? hashSecret(key) : '';
    if (!hash) return null;
    const link = await this.em.fork().findOne(AccessLinkEntity, { keyHash: hash });
    return link && sameHash(link.keyHash, hash) ? link : null;
  }

  private async person(user: AuthenticatedUser, personId: string, permission: string): Promise<PersonSummary> {
    if (!/^[0-9a-f-]{36}$/i.test(personId)) throw new NotFoundException({ code: 'personal.unknownPerson' });
    const [person] = await this.directory.summaries([personId]);
    if (!person) throw new NotFoundException({ code: 'personal.unknownPerson' });
    this.mayOrFail(user, permission, person);
    return person;
  }

  private may(user: AuthenticatedUser, permission: string, person: PersonSummary): boolean {
    if (person.departmentIds.some((id) => user.can(permission, id))) return true;
    return person.departmentIds.length === 0 && user.can(permission);
  }

  private mayOrFail(user: AuthenticatedUser, permission: string, person: PersonSummary): void {
    if (!this.may(user, permission, person)) throw new ForbiddenException({ code: 'auth.forbidden' });
  }

  private secret(): Buffer {
    const key = serverKey();
    if (!key) throw new ServiceUnavailableException({ code: 'personal.noSecretKey' });
    return key;
  }

  private async publicBase(): Promise<string> {
    const base = (await this.cookies.publicUrl()).replace(/\/$/, '');
    if (!/^https?:\/\//.test(base)) throw new ServiceUnavailableException({ code: 'personal.noPublicUrl' });
    return base;
  }

  private url(base: string, key: string): string {
    return `${base}/personal#k=${key}`;
  }

  private toDto(row: AccessLinkEntity, person: PersonSummary): PersonalLink {
    return {
      id: row.id,
      personId: row.personId,
      firstName: person.firstName,
      lastName: person.lastName,
      keyPrefix: row.keyPrefix,
      createdAt: row.createdAt.toISOString(),
      lastSeenAt: row.lastSeenAt ? row.lastSeenAt.toISOString() : null,
      revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
      active: row.revokedAt === null,
    };
  }
}
