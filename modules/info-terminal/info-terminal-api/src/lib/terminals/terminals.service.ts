import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { v7 as uuidv7 } from 'uuid';
import { assertVersion, Audit, type AuthenticatedUser, SettingsService, User } from '@forga/core-api';
import type { BrigadeSettings } from '@forga/core-contracts';
import { INFO_TERMINAL_MANAGE, INFO_TERMINAL_READ, type Terminal, TerminalInput, type TerminalLink, TerminalUpdate } from '@forga/info-terminal-contracts';
import { ORGANIZATION, type Organization, type Station } from '@forga/masterdata-contracts';
import type { z } from 'zod';
import { TerminalEntity } from '../info-terminal.entities.js';
import { decryptDeviceKey, encryptDeviceKey, generateDeviceKey, hashDeviceKey, serverKey } from '../security/device-keys.js';

export type ParsedInput = z.output<typeof TerminalInput>;
export type ParsedUpdate = z.output<typeof TerminalUpdate>;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function toTerminalDto(t: TerminalEntity, linkAvailable: boolean): Terminal {
  return {
    id: t.id,
    stationId: t.stationId,
    name: t.name,
    departmentIds: t.departmentIds,
    allowNewIncident: t.allowNewIncident,
    allowTraining: t.allowTraining,
    language: t.language,
    keyPrefix: t.keyPrefix,
    createdAt: t.createdAt.toISOString(),
    createdBy: t.createdBy,
    revokedAt: iso(t.revokedAt),
    revokedBy: t.revokedBy ?? null,
    lastSeenAt: iso(t.lastSeenAt),
    linkAvailable,
    version: t.version,
  };
}

/** The departments of a terminal that still exist; a deleted one drops out. */
function withoutDeleted(terminal: TerminalEntity, known: ReadonlySet<string>): string[] {
  const kept = terminal.departmentIds.filter((d) => known.has(d));
  return kept.length === terminal.departmentIds.length ? terminal.departmentIds : kept;
}

/** Name of the technical user of a terminal, shown in the history: "Infoterminal <station> · <device>". */
const technicalName = (station: Station, name: string) => `Infoterminal ${station.name} · ${name}`;

/**
 * Administration of the info terminals. Managing a terminal needs `info-terminal.manage` for all its departments
 * (also those added), so nobody unlocks a terminal for a department of others.
 */
@Injectable()
export class TerminalsService {
  constructor(
    private readonly em: EntityManager,
    private readonly audit: Audit,
    private readonly settings: SettingsService,
    @Inject(ORGANIZATION) private readonly organization: Organization,
  ) {}

  /** Terminals one of whose departments the user may read (or manage); brigade-wide grants see all. */
  async list(user: AuthenticatedUser, includeRevoked: boolean): Promise<Terminal[]> {
    const terminals = await this.em.fork().find(TerminalEntity, includeRevoked ? {} : { revokedAt: null }, { populate: ['keyEncrypted'], orderBy: { createdAt: 'asc' } });
    const known = await this.knownDepartments();
    for (const t of terminals) t.departmentIds = withoutDeleted(t, known);
    return terminals
      .filter((t) => t.departmentIds.some((d) => user.can(INFO_TERMINAL_READ, d) || user.can(INFO_TERMINAL_MANAGE, d)))
      .map((t) => toTerminalDto(t, Boolean(t.keyEncrypted) && !t.revokedAt));
  }

  private async knownDepartments(): Promise<Set<string>> {
    return new Set((await this.organization.departments()).map((d) => d.id));
  }

  private assertManage(user: AuthenticatedUser, departmentIds: readonly string[]): void {
    const missing = departmentIds.filter((d) => !user.can(INFO_TERMINAL_MANAGE, d));
    if (missing.length) throw new ForbiddenException({ code: 'auth.forbidden', permissions: [INFO_TERMINAL_MANAGE] });
  }

  /** Address of f.orga for the link (brigade settings or `FORGA_PUBLIC_URL`). */
  private async publicUrl(): Promise<string> {
    const brigade = await this.settings.get<BrigadeSettings>('brigade');
    const base = (brigade?.publicUrl || process.env['FORGA_PUBLIC_URL'] || '').replace(/\/$/, '');
    if (!/^https?:\/\//.test(base)) throw new ServiceUnavailableException({ code: 'info-terminal.noPublicUrl' });
    return base;
  }

  private key(): Buffer {
    const key = serverKey();
    if (!key) throw new ServiceUnavailableException({ code: 'info-terminal.noSecretKey' });
    return key;
  }

  /** The station's department first, then the other departments (existing ones only, without duplicates). */
  private async departments(station: Station, requested: readonly string[]): Promise<string[]> {
    const known = new Set((await this.organization.departments()).map((d) => d.id));
    const unknown = requested.filter((d) => !known.has(d));
    if (unknown.length) throw new BadRequestException({ code: 'masterdata.unknownDepartment' });
    return [...new Set([station.departmentId, ...requested])];
  }

  private async station(stationId: string): Promise<Station> {
    const station = (await this.organization.stations()).find((s) => s.id === stationId);
    if (!station) throw new BadRequestException({ code: 'info-terminal.unknownStation' });
    return station;
  }

  private link(base: string, key: string): string {
    return `${base}/terminal#k=${key}`;
  }

  async create(user: AuthenticatedUser, input: ParsedInput): Promise<TerminalLink> {
    const station = await this.station(input.stationId);
    const departmentIds = await this.departments(station, input.departmentIds);
    this.assertManage(user, departmentIds);
    const base = await this.publicUrl();
    const secret = this.key();
    const em = this.em.fork();
    const key = generateDeviceKey();
    const technical = em.create(User, { id: uuidv7(), username: `info-terminal-${uuidv7()}`, displayName: technicalName(station, input.name), technical: true });
    const terminal = em.create(TerminalEntity, {
      stationId: station.id,
      name: input.name,
      departmentIds,
      allowNewIncident: input.allowNewIncident,
      allowTraining: input.allowTraining,
      language: input.language,
      keyHash: hashDeviceKey(key),
      keyPrefix: key.slice(0, 10),
      keyEncrypted: encryptDeviceKey(key, secret),
      userId: technical.id,
      createdAt: new Date(),
      createdBy: user.displayName,
    });
    await em.flush();
    await this.audit.log('info-terminal.created', { terminalId: terminal.id, stationId: station.id, name: terminal.name, departmentIds });
    return { terminal: toTerminalDto(terminal, true), url: this.link(base, key) };
  }

  private async load(em: EntityManager, user: AuthenticatedUser, id: string): Promise<TerminalEntity> {
    const terminal = /^[0-9a-f-]{36}$/i.test(id) ? await em.findOne(TerminalEntity, id, { populate: ['keyEncrypted'] }) : null;
    // A deleted department drops out of the terminal (the department of the station stays first while it exists).
    if (terminal) terminal.departmentIds = withoutDeleted(terminal, await this.knownDepartments());
    if (!terminal || !terminal.departmentIds.some((d) => user.can(INFO_TERMINAL_READ, d) || user.can(INFO_TERMINAL_MANAGE, d))) throw new NotFoundException();
    return terminal;
  }

  private assertActive(terminal: TerminalEntity): void {
    if (terminal.revokedAt) throw new ConflictException({ code: 'info-terminal.revoked' });
  }

  async update(user: AuthenticatedUser, id: string, input: ParsedUpdate): Promise<Terminal> {
    const em = this.em.fork();
    const terminal = await this.load(em, user, id);
    this.assertActive(terminal);
    assertVersion(terminal, input.version);
    const station = await this.station(terminal.stationId);
    const departmentIds = await this.departments(station, input.departmentIds);
    // The permission is needed for the departments before and after the change.
    this.assertManage(user, [...terminal.departmentIds, ...departmentIds]);
    const before = terminal.departmentIds;
    Object.assign(terminal, { name: input.name, departmentIds, allowNewIncident: input.allowNewIncident, allowTraining: input.allowTraining, language: input.language });
    const technical = await em.findOne(User, terminal.userId);
    if (technical) technical.displayName = technicalName(station, input.name);
    await em.flush();
    await this.audit.log('info-terminal.changed', { terminalId: terminal.id, name: terminal.name, departmentsBefore: before, departmentsAfter: departmentIds });
    return toTerminalDto(terminal, Boolean(terminal.keyEncrypted));
  }

  /** Shows the link again (also to copy or open it); every time in the audit log. */
  async showLink(user: AuthenticatedUser, id: string, purpose: 'show' | 'copy' | 'open'): Promise<TerminalLink> {
    const em = this.em.fork();
    const terminal = await this.load(em, user, id);
    this.assertManage(user, terminal.departmentIds);
    this.assertActive(terminal);
    const base = await this.publicUrl();
    const key = terminal.keyEncrypted ? decryptDeviceKey(terminal.keyEncrypted, this.key()) : null;
    // E.g. the server key was changed: the device keeps working (hash), a new link is needed to show it again.
    if (!key) throw new ConflictException({ code: 'info-terminal.linkUnavailable' });
    await this.audit.log('info-terminal.link-shown', { terminalId: terminal.id, name: terminal.name, purpose });
    return { terminal: toTerminalDto(terminal, true), url: this.link(base, key) };
  }

  /** A new key; the old one stops working at once. */
  async rotate(user: AuthenticatedUser, id: string): Promise<TerminalLink> {
    const em = this.em.fork();
    const terminal = await this.load(em, user, id);
    this.assertManage(user, terminal.departmentIds);
    this.assertActive(terminal);
    const base = await this.publicUrl();
    const key = generateDeviceKey();
    Object.assign(terminal, { keyHash: hashDeviceKey(key), keyPrefix: key.slice(0, 10), keyEncrypted: encryptDeviceKey(key, this.key()) });
    await em.flush();
    await this.audit.log('info-terminal.key-rotated', { terminalId: terminal.id, name: terminal.name });
    return { terminal: toTerminalDto(terminal, true), url: this.link(base, key) };
  }

  /** Revoked at once and for good: the encrypted key is deleted, the technical user deactivated; bookings stay. */
  async revoke(user: AuthenticatedUser, id: string): Promise<Terminal> {
    const em = this.em.fork();
    const terminal = await this.load(em, user, id);
    this.assertManage(user, terminal.departmentIds);
    this.assertActive(terminal);
    Object.assign(terminal, { revokedAt: new Date(), revokedBy: user.displayName, keyEncrypted: null });
    const technical = await em.findOne(User, terminal.userId);
    if (technical) technical.active = false;
    await em.flush();
    await this.audit.log('info-terminal.revoked', { terminalId: terminal.id, name: terminal.name });
    return toTerminalDto(terminal, false);
  }
}
