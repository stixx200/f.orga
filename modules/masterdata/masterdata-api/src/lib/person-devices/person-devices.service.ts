import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { Audit, type AuthenticatedUser } from '@forga/core-api';
import { normalizeRfid } from '@forga/core-contracts';
import type { PersonDeviceToken as TokenDto, PersonDeviceTokenInput } from '@forga/masterdata-contracts';
import type { z } from 'zod';
import { DriverLicenseToken, Person, PersonDeviceToken } from '../masterdata.entities.js';
import { PersonsService, READ, WRITE } from '../persons/persons.service.js';
import { tokenHash } from '../driver-licenses/driver-licenses.service.js';

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/**
 * Devices of persons for the info terminal (NFC sticker or barcode). Editing the person (`masterdata.persons.write`
 * in the departments of the person) registers and revokes them; the same ID may not belong to two persons, neither
 * as a device nor as a licence sticker. Revoked devices stay in the history with their reason.
 */
@Injectable()
export class PersonDevicesService {
  constructor(
    private readonly em: EntityManager,
    private readonly persons: PersonsService,
    private readonly audit: Audit,
  ) {}

  /** Active and revoked devices of the person, newest first. */
  async list(user: AuthenticatedUser, personId: string): Promise<TokenDto[]> {
    const em = this.em.fork();
    const person = await this.persons.load(em, personId, user, READ);
    const tokens = await em.find(PersonDeviceToken, { person }, { orderBy: { registeredAt: 'desc' } });
    return tokens.map((t) => this.dto(t));
  }

  /**
   * Registers the device after the person was identified; the active device of the person is replaced.
   * The same ID already active at this person: nothing changes. Taken by another person: `409 masterdata.tokenTaken`;
   * without `FORGA_SECRET_KEY`: `503 masterdata.noSecretKey`.
   */
  async register(user: AuthenticatedUser, personId: string, input: z.output<typeof PersonDeviceTokenInput>): Promise<TokenDto[]> {
    const em = this.em.fork();
    const person = await this.persons.load(em, personId, user, WRITE);
    const { codeHash, taken } = await this.assertFree(em, person, input.code);
    if (!taken) {
      const previous = await em.find(PersonDeviceToken, { person, revokedAt: null });
      for (const token of previous) em.assign(token, { revokedAt: new Date(), revokedBy: user.displayName, revokeReason: 'replaced' });
      const token = em.create(PersonDeviceToken, {
        person,
        kind: input.kind,
        codeHash,
        suffix: normalizeRfid(input.code).slice(-4),
        registeredAt: new Date(),
        registeredBy: user.displayName,
        revokedAt: null,
        revokedBy: null,
        revokeReason: null,
      });
      await em.flush();
      await this.audit.log('masterdata.person-token-registered', { personId: person.id, tokenId: token.id, kind: token.kind, suffix: token.suffix, replaced: previous.map((t) => t.id) });
    }
    return this.list(user, personId);
  }

  /** Revokes a device at once; a scan then finds nobody. Revoking twice changes nothing. */
  async revoke(user: AuthenticatedUser, personId: string, tokenId: string, reason: string): Promise<TokenDto[]> {
    const em = this.em.fork();
    const person = await this.persons.load(em, personId, user, WRITE);
    const token = await em.findOne(PersonDeviceToken, { id: tokenId, person });
    if (!token) throw new NotFoundException();
    if (!token.revokedAt) {
      em.assign(token, { revokedAt: new Date(), revokedBy: user.displayName, revokeReason: reason });
      await em.flush();
      await this.audit.log('masterdata.person-token-revoked', { personId: person.id, tokenId: token.id, suffix: token.suffix, reason });
    }
    return this.list(user, personId);
  }

  /** The hash of an ID that is free or already the person's own active device (`taken`). */
  private async assertFree(em: EntityManager, person: Person, code: string): Promise<{ codeHash: string; taken: boolean }> {
    if (!normalizeRfid(code)) throw new BadRequestException({ code: 'validation.failed' });
    const codeHash = tokenHash(code);
    if (!codeHash) throw new HttpException({ code: 'masterdata.noSecretKey' }, HttpStatus.SERVICE_UNAVAILABLE);
    const [device, licence] = await Promise.all([
      em.findOne(PersonDeviceToken, { codeHash, revokedAt: null }, { populate: ['person'] }),
      em.findOne(DriverLicenseToken, { codeHash, revokedAt: null }, { populate: ['person'] }),
    ]);
    if ((device && device.person.id !== person.id) || (licence && licence.person.id !== person.id)) throw new ConflictException({ code: 'masterdata.tokenTaken' });
    return { codeHash, taken: Boolean(device) };
  }

  /**
   * The person of an active device with the code, populated for the directory. Left and anonymised persons are not
   * returned; restriction is checked by the caller.
   */
  async activePerson(em: EntityManager, code: string): Promise<Person | null> {
    if (!normalizeRfid(code)) return null;
    const codeHash = tokenHash(code);
    if (!codeHash) return null;
    const token = await em.findOne(PersonDeviceToken, { codeHash, revokedAt: null }, { populate: ['person.memberships.department', 'person.qualifications'] });
    return token && token.person.status !== 'left' && !token.person.anonymizedAt ? token.person : null;
  }

  private dto(t: PersonDeviceToken): TokenDto {
    return {
      id: t.id,
      kind: t.kind,
      suffix: t.suffix,
      registeredAt: t.registeredAt.toISOString(),
      registeredBy: t.registeredBy,
      revokedAt: iso(t.revokedAt),
      revokedBy: t.revokedBy ?? null,
      revokeReason: t.revokeReason ?? null,
    };
  }
}
