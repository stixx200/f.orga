import { createHmac, hkdfSync } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { Audit, type AuthenticatedUser, serverKey, SettingsService } from '@forga/core-api';
import { normalizeRfid } from '@forga/core-contracts';
import {
  type DriverLicense,
  type DriverLicenseCheck as CheckDto,
  DriverLicenseCheckInput,
  type DriverLicenseFile,
  type DriverLicenseLastCheck,
  type DriverLicenseOverview,
  type DriverLicenseRequest as RequestDto,
  DriverLicenseRequestInput,
  DriverLicenseSettings,
  type DriverLicenseToken as TokenDto,
  type DriverLicenseTokenInput,
  type MyDriverLicense,
  readDriverLicense,
  selfCheckEnabled,
} from '@forga/masterdata-contracts';
import type { z } from 'zod';
import { DriverLicenseCheck, DriverLicenseRequest, DriverLicenseToken, Person } from '../masterdata.entities.js';
import { departmentsOf, PersonsService, primaryDepartment, READ, validQualifications } from '../persons/persons.service.js';
import { today } from '../shared/access.js';
import { type LicenseStatus, licenseStatus } from './license-status.js';

export const CHECK = 'masterdata.licenses.check';

type CheckInput = z.output<typeof DriverLicenseCheckInput>;
type RequestInput = z.output<typeof DriverLicenseRequestInput>;

const personName = (p: Pick<Person, 'firstName' | 'lastName'>) => `${p.firstName} ${p.lastName}`;
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/**
 * HMAC-SHA-256 of the normalised sticker ID with a key derived from `FORGA_SECRET_KEY`. A plain hash of the 4–10 bytes
 * of an NFC ID could be found by trying; without the server key it cannot. `null` without a server key.
 */
export function tokenHash(code: string, key = serverKey()): string | null {
  if (!key) return null;
  const derived = Buffer.from(hkdfSync('sha256', key, Buffer.alloc(0), 'forga.masterdata.driver-license-token', 32));
  return createHmac('sha256', derived).update(normalizeRfid(code)).digest('hex');
}

function group<T extends { person: { id: string } }>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) map.set(item.person.id, [...(map.get(item.person.id) ?? []), item]);
  return map;
}

/** The data a status is computed from, loaded for many persons at once. */
interface Records {
  checks: Map<string, DriverLicenseCheck[]>;
  openRequests: Map<string, DriverLicenseRequest[]>;
  activeTokens: Set<string>;
}

/**
 * Driving licence checks: the licence with its classes on the person, checks as proof (never changed, only cancelled),
 * requests to present it again, stickers for self-checks, the deadlines and the overview of the target group.
 */
@Injectable()
export class DriverLicensesService {
  constructor(
    private readonly em: EntityManager,
    private readonly persons: PersonsService,
    private readonly settingsService: SettingsService,
    private readonly audit: Audit,
  ) {}

  async settings(): Promise<DriverLicenseSettings> {
    return (await this.settingsService.get<DriverLicenseSettings>('masterdata.driverLicense')) ?? DriverLicenseSettings.parse({});
  }

  /** Checks, open requests and active stickers of the persons. */
  async records(em: EntityManager, personIds: readonly string[]): Promise<Records> {
    const ids = [...personIds];
    if (!ids.length) return { checks: new Map(), openRequests: new Map(), activeTokens: new Set() };
    const [checks, requests, tokens] = await Promise.all([
      em.find(DriverLicenseCheck, { person: { $in: ids } }, { populate: ['checkedBy'], orderBy: { checkedOn: 'desc', recordedAt: 'desc' } }),
      em.find(DriverLicenseRequest, { person: { $in: ids }, completedByCheckId: null, withdrawnAt: null }, { orderBy: { dueOn: 'asc' } }),
      em.find(DriverLicenseToken, { person: { $in: ids }, revokedAt: null }),
    ]);
    return { checks: group(checks), openRequests: group(requests), activeTokens: new Set(tokens.map((t) => t.person.id)) };
  }

  /** State of a person (memberships and qualifications populated). */
  status(person: Person, records: Records, settings: DriverLicenseSettings, asOf = today()): LicenseStatus {
    return licenseStatus(
      {
        status: person.status,
        license: readDriverLicense(person.driverLicense),
        qualifications: validQualifications(person, asOf),
        checks: (records.checks.get(person.id) ?? []).map((c) => ({ checkedOn: c.checkedOn, method: c.method, cancelled: Boolean(c.cancelledAt) })),
        openRequests: records.openRequests.get(person.id) ?? [],
      },
      settings,
      asOf,
    );
  }

  private lastCheck(checks: readonly DriverLicenseCheck[], method?: 'in-person', first = false): DriverLicenseLastCheck | null {
    const valid = checks.filter((c) => !c.cancelledAt && (!method || c.method === method)).toSorted((a, b) => a.checkedOn.localeCompare(b.checkedOn) || a.recordedAt.getTime() - b.recordedAt.getTime());
    const check = first ? valid[0] : valid.at(-1);
    return check ? { checkedOn: check.checkedOn, method: check.method, checkedBy: check.checkedBy ? personName(check.checkedBy) : null } : null;
  }

  /** May the user see the licence of the person (personnel file or licence checks)? */
  private visible(user: AuthenticatedUser, person: Person): boolean {
    return this.persons.can(user, READ, person) || this.persons.can(user, CHECK, person);
  }

  private async person(em: EntityManager, id: string, user: AuthenticatedUser, permission?: string): Promise<Person> {
    const person = await em.findOne(Person, id, { populate: ['memberships.department', 'qualifications'] });
    if (!person || !this.visible(user, person)) throw new NotFoundException();
    await this.persons.assertReadable(user, person);
    if (permission && !this.persons.can(user, permission, person)) throw new ForbiddenException({ code: 'auth.forbidden', permissions: [permission] });
    return person;
  }

  async file(user: AuthenticatedUser, id: string): Promise<DriverLicenseFile> {
    const em = this.em.fork();
    const person = await this.person(em, id, user);
    const canCheck = this.persons.can(user, CHECK, person);
    const [settings, records, requests, tokens] = await Promise.all([
      this.settings(),
      this.records(em, [person.id]),
      em.find(DriverLicenseRequest, { person }, { orderBy: { requestedAt: 'desc' } }),
      canCheck ? em.find(DriverLicenseToken, { person }, { orderBy: { registeredAt: 'desc' } }) : Promise.resolve([]),
    ]);
    const checks = records.checks.get(person.id) ?? [];
    const status = this.status(person, records, settings);
    const first = this.firstInPerson(checks);
    return {
      person: { id: person.id, firstName: person.firstName, lastName: person.lastName, status: person.status, departmentIds: departmentsOf(person) },
      license: readDriverLicense(person.driverLicense),
      mode: settings.mode,
      selfCheck: selfCheckEnabled(settings),
      monitored: status.monitored,
      state: status.state,
      dues: status.dues,
      firstCheck: this.lastCheck(checks, 'in-person', true),
      lastCheck: this.lastCheck(checks),
      checks: checks.map((c) => this.checkDto(c, first)),
      requests: requests.map((r) => this.requestDto(r, canCheck)),
      tokens: tokens.map((t) => this.tokenDto(t)),
      canCheck,
    };
  }

  private firstInPerson(checks: readonly DriverLicenseCheck[]): string | null {
    return checks.filter((c) => !c.cancelledAt && c.method === 'in-person').toSorted((a, b) => a.checkedOn.localeCompare(b.checkedOn))[0]?.id ?? null;
  }

  private checkDto(c: DriverLicenseCheck, firstId: string | null): CheckDto {
    return {
      id: c.id,
      checkedOn: c.checkedOn,
      method: c.method,
      checkedBy: c.checkedBy ? { id: c.checkedBy.id, name: personName(c.checkedBy) } : null,
      originalPresented: c.originalPresented,
      classes: c.classes,
      selfDeclaration: c.selfDeclaration,
      device: c.device,
      requestId: c.requestId ?? null,
      first: c.id === firstId,
      note: c.note,
      recordedAt: c.recordedAt.toISOString(),
      cancelledAt: iso(c.cancelledAt),
      cancelledBy: c.cancelledBy ?? null,
      cancelReason: c.cancelReason ?? null,
    };
  }

  private requestDto(r: DriverLicenseRequest, withReason: boolean): RequestDto {
    return {
      id: r.id,
      reason: withReason ? r.reason : '',
      dueOn: r.dueOn,
      requestedAt: r.requestedAt.toISOString(),
      requestedBy: r.requestedBy,
      completedByCheckId: r.completedByCheckId ?? null,
      withdrawnAt: iso(r.withdrawnAt),
      withdrawReason: withReason ? (r.withdrawReason ?? null) : null,
    };
  }

  private tokenDto(t: DriverLicenseToken): TokenDto {
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

  /** Persons of the target group in the departments where the user checks licences. */
  async overview(user: AuthenticatedUser): Promise<DriverLicenseOverview> {
    const settings = await this.settings();
    const persons = await this.persons.findVisible(user, CHECK, { status: { $in: ['probation', 'active'] } });
    const em = this.em.fork();
    const records = await this.records(em, persons.map((p) => p.id));
    const asOf = today();
    const rows: DriverLicenseOverview['rows'] = [];
    for (const person of persons) {
      const status = this.status(person, records, settings, asOf);
      if (!status.monitored || !status.state) continue;
      const license = readDriverLicense(person.driverLicense);
      const checks = records.checks.get(person.id) ?? [];
      rows.push({
        personId: person.id,
        firstName: person.firstName,
        lastName: person.lastName,
        primaryDepartmentId: primaryDepartment(person),
        departmentIds: departmentsOf(person),
        classes: license.classes,
        nextExpiry: status.nextExpiry,
        lastCheck: this.lastCheck(checks),
        token: records.activeTokens.has(person.id),
        state: status.state,
        dueOn: status.dues[0]?.dueOn ?? null,
        requestDueOn: records.openRequests.get(person.id)?.[0]?.dueOn ?? null,
        expiryToVerify: license.expiryToVerify,
        documentExpired: Boolean(license.documentExpiresOn && license.documentExpiresOn < asOf),
      });
    }
    return { mode: settings.mode, leadDays: settings.leadDays, monitoredClasses: settings.monitoredClasses, driverQualifications: settings.driverQualifications, rows };
  }

  /** "Mein Bereich": the licence of the person linked to the user. */
  async mine(user: AuthenticatedUser): Promise<MyDriverLicense> {
    const em = this.em.fork();
    const person = user.personId ? await em.findOne(Person, user.personId, { populate: ['memberships.department', 'qualifications'] }) : null;
    if (!person) throw new NotFoundException({ code: 'masterdata.noPerson' });
    const [settings, records] = await Promise.all([this.settings(), this.records(em, [person.id])]);
    const status = this.status(person, records, settings);
    return {
      license: readDriverLicense(person.driverLicense),
      mode: settings.mode,
      monitored: status.monitored,
      state: status.state,
      lastCheck: this.lastCheck(records.checks.get(person.id) ?? []),
      next: status.dues[0] ?? null,
    };
  }

  /** Recomputes the date and method of the latest valid check kept with the person. */
  private async refreshLastCheck(em: EntityManager, person: Person, license: DriverLicense): Promise<DriverLicense> {
    const checks = await em.find(DriverLicenseCheck, { person, cancelledAt: null }, { orderBy: { checkedOn: 'desc', recordedAt: 'desc' }, limit: 1 });
    const last = checks[0];
    const legacy = license.legacyCheckedOn && (!last || license.legacyCheckedOn > last.checkedOn) ? license.legacyCheckedOn : null;
    return {
      ...license,
      lastCheckedOn: legacy ?? last?.checkedOn ?? null,
      lastCheckMethod: legacy ? 'legacy' : (last?.method ?? null),
    };
  }

  /**
   * Records a check with the original. Its classes replace those of the person (the dialog is also where the classes
   * are kept); open requests are settled. A check date of old data becomes a check of the method `legacy` first.
   */
  async recordCheck(user: AuthenticatedUser, id: string, input: CheckInput): Promise<DriverLicenseFile> {
    if (input.checkedOn > today()) throw new BadRequestException({ code: 'masterdata.checkInFuture' });
    const em = this.em.fork();
    const person = await this.person(em, id, user, CHECK);
    const examiner = await em.findOne(Person, input.checkedById);
    if (!examiner || examiner.anonymizedAt) throw new BadRequestException({ code: 'masterdata.unknownExaminer' });
    // The sticker is checked before the check is saved, so a refused sticker leaves nothing behind.
    if (input.token) await this.assertTokenFree(em, person, input.token.code);
    const license = readDriverLicense(person.driverLicense);
    if (license.legacyCheckedOn) {
      em.create(DriverLicenseCheck, {
        person,
        checkedOn: license.legacyCheckedOn,
        method: 'legacy',
        checkedBy: null,
        originalPresented: false,
        classes: license.classes,
        terminalId: null,
        requestId: null,
        recordedAt: new Date(),
        cancelledAt: null,
        cancelledBy: null,
        cancelReason: null,
        note: '',
        selfDeclaration: '',
        device: '',
      });
    }
    const open = await em.find(DriverLicenseRequest, { person, completedByCheckId: null, withdrawnAt: null }, { orderBy: { dueOn: 'asc' } });
    const check = em.create(DriverLicenseCheck, {
      person,
      checkedOn: input.checkedOn,
      method: 'in-person',
      checkedBy: examiner,
      originalPresented: true,
      classes: input.classes,
      terminalId: null,
      requestId: open[0]?.id ?? null,
      note: input.note,
      recordedAt: new Date(),
      cancelledAt: null,
      cancelledBy: null,
      cancelReason: null,
      selfDeclaration: '',
      device: '',
    });
    for (const request of open) request.completedByCheckId = check.id;
    await em.flush();
    const next = await this.refreshLastCheck(em, person, { ...license, classes: input.classes, documentExpiresOn: input.documentExpiresOn, legacyCheckedOn: null, expiryToVerify: false });
    person.driverLicense = next;
    await em.flush();
    if (input.token) await this.registerToken(user, person.id, input.token);
    return this.file(user, person.id);
  }

  async cancelCheck(user: AuthenticatedUser, id: string, checkId: string, reason: string): Promise<DriverLicenseFile> {
    const em = this.em.fork();
    const person = await this.person(em, id, user, CHECK);
    const check = await em.findOne(DriverLicenseCheck, { id: checkId, person });
    if (!check) throw new NotFoundException();
    if (check.cancelledAt) throw new ConflictException({ code: 'masterdata.checkCancelled' });
    em.assign(check, { cancelledAt: new Date(), cancelledBy: user.displayName, cancelReason: reason });
    await em.flush();
    person.driverLicense = await this.refreshLastCheck(em, person, readDriverLicense(person.driverLicense));
    await em.flush();
    return this.file(user, person.id);
  }

  async request(user: AuthenticatedUser, id: string, input: RequestInput): Promise<DriverLicenseFile> {
    const em = this.em.fork();
    const person = await this.person(em, id, user, CHECK);
    em.create(DriverLicenseRequest, {
      person,
      reason: input.reason,
      dueOn: input.dueOn,
      requestedAt: new Date(),
      requestedBy: user.displayName,
      completedByCheckId: null,
      withdrawnAt: null,
      withdrawnBy: null,
      withdrawReason: null,
    });
    await em.flush();
    return this.file(user, person.id);
  }

  async withdraw(user: AuthenticatedUser, id: string, requestId: string, reason: string): Promise<DriverLicenseFile> {
    const em = this.em.fork();
    const person = await this.person(em, id, user, CHECK);
    const request = await em.findOne(DriverLicenseRequest, { id: requestId, person });
    if (!request) throw new NotFoundException();
    if (request.completedByCheckId || request.withdrawnAt) throw new ConflictException({ code: 'masterdata.requestClosed' });
    em.assign(request, { withdrawnAt: new Date(), withdrawnBy: user.displayName, withdrawReason: reason });
    await em.flush();
    return this.file(user, person.id);
  }

  /**
   * Registers a sticker after the examiner saw the original; the previous active sticker of the person is revoked.
   * The same ID at another person: `409 masterdata.tokenTaken`; without `FORGA_SECRET_KEY`: `503 masterdata.noSecretKey`.
   */
  async registerToken(user: AuthenticatedUser, id: string, input: z.output<typeof DriverLicenseTokenInput>): Promise<DriverLicenseFile> {
    const em = this.em.fork();
    const person = await this.person(em, id, user, CHECK);
    const { codeHash, taken } = await this.assertTokenFree(em, person, input.code);
    if (taken) return this.file(user, person.id);
    const previous = await em.find(DriverLicenseToken, { person, revokedAt: null });
    for (const token of previous) em.assign(token, { revokedAt: new Date(), revokedBy: user.displayName, revokeReason: 'replaced' });
    const normalized = normalizeRfid(input.code);
    const token = em.create(DriverLicenseToken, {
      person,
      kind: input.kind,
      codeHash,
      suffix: normalized.slice(-4),
      registeredAt: new Date(),
      registeredBy: user.displayName,
      revokedAt: null,
      revokedBy: null,
      revokeReason: null,
    });
    await em.flush();
    await this.audit.log('masterdata.license-token-registered', { personId: person.id, tokenId: token.id, kind: token.kind, suffix: token.suffix, replaced: previous.map((t) => t.id) });
    return this.file(user, person.id);
  }

  /** The hash of a sticker ID that is free or already the person's own active sticker (`taken`). */
  private async assertTokenFree(em: EntityManager, person: Person, code: string): Promise<{ codeHash: string; taken: boolean }> {
    if (!normalizeRfid(code)) throw new BadRequestException({ code: 'validation.failed' });
    const codeHash = tokenHash(code);
    if (!codeHash) throw new HttpException({ code: 'masterdata.noSecretKey' }, HttpStatus.SERVICE_UNAVAILABLE);
    const active = await em.findOne(DriverLicenseToken, { codeHash, revokedAt: null });
    if (active && active.person.id !== person.id) throw new ConflictException({ code: 'masterdata.tokenTaken' });
    return { codeHash, taken: Boolean(active) };
  }

  async revokeToken(user: AuthenticatedUser, id: string, tokenId: string, reason: string): Promise<DriverLicenseFile> {
    const em = this.em.fork();
    const person = await this.person(em, id, user, CHECK);
    const token = await em.findOne(DriverLicenseToken, { id: tokenId, person });
    if (!token) throw new NotFoundException();
    if (!token.revokedAt) {
      em.assign(token, { revokedAt: new Date(), revokedBy: user.displayName, revokeReason: reason });
      await em.flush();
      await this.audit.log('masterdata.license-token-revoked', { personId: person.id, tokenId: token.id, suffix: token.suffix, reason });
    }
    return this.file(user, person.id);
  }

  /** The active sticker with the code, with its person (memberships and qualifications populated). */
  async activeToken(em: EntityManager, code: string): Promise<DriverLicenseToken | null> {
    const codeHash = tokenHash(code);
    if (!codeHash || !normalizeRfid(code)) return null;
    const token = await em.findOne(DriverLicenseToken, { codeHash, revokedAt: null }, { populate: ['person.memberships.department', 'person.qualifications'] });
    return token && token.person.status !== 'left' && !token.person.anonymizedAt ? token : null;
  }

  /** Records a confirmed self-check; the caller checked that it is allowed. */
  async recordSelfCheck(em: EntityManager, token: DriverLicenseToken, origin: { terminalId: string; device: string; declaration: string }): Promise<DriverLicenseCheck> {
    const person = token.person;
    const check = em.create(DriverLicenseCheck, {
      person,
      checkedOn: today(),
      method: token.kind === 'nfc' ? 'transponder' : 'barcode',
      checkedBy: null,
      originalPresented: false,
      classes: [],
      selfDeclaration: origin.declaration,
      terminalId: origin.terminalId,
      device: origin.device,
      requestId: null,
      note: '',
      recordedAt: new Date(),
      cancelledAt: null,
      cancelledBy: null,
      cancelReason: null,
    });
    await em.flush();
    person.driverLicense = await this.refreshLastCheck(em, person, readDriverLicense(person.driverLicense));
    await em.flush();
    return check;
  }
}
