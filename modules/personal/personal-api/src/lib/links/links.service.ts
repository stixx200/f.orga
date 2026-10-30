import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, Optional, ServiceUnavailableException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { Audit, type AuthenticatedUser, CookiePolicy, decryptSecret, encryptSecret, hashSecret, serverKey } from '@forga/core-api';
import { PERSON_DIRECTORY, type PersonDirectory, type PersonSummary } from '@forga/masterdata-contracts';
import { type PersonalLink, type PersonalLinkCreated, PERSONAL_MANAGE, PERSONAL_READ, type PersonalView, type ShownLink } from '@forga/personal-contracts';
import { RESPIRATORY_PROTECTION_FITNESS, type FitnessLookup } from '@forga/respiratory-protection-contracts';
import { AccessLinkEntity } from '../personal.entities.js';
import { generateAccessKey, sameHash } from '../security/access-keys.js';

@Injectable()
export class LinksService {
  constructor(
    private readonly em: EntityManager,
    private readonly audit: Audit,
    private readonly cookies: CookiePolicy,
    @Inject(PERSON_DIRECTORY) private readonly directory: PersonDirectory,
    @Optional() @Inject(RESPIRATORY_PROTECTION_FITNESS) private readonly fitness?: FitnessLookup,
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

  /** The file behind a valid access key. Medical examinations are not included. */
  async view(link: AccessLinkEntity): Promise<PersonalView> {
    const file = await this.directory.personalFile(link.personId);
    if (!file) throw new NotFoundException({ code: 'personal.gone' });
    const respiratory = this.fitness ? await this.fitness.personalView(link.personId) : null;
    return { ...file, respiratory };
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
