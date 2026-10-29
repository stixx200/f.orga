import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  Param,
  Put,
} from '@nestjs/common';
import { defineEntity, EntityManager, p } from '@mikro-orm/core';
import type { z } from 'zod';
import { CORE_SETTINGS, CORE_SETTINGS_ACCESS, SECRET_SETTING_FIELDS, type SettingsAccess } from '@forga/core-contracts';
import { FORGA_CORE_OPTIONS, type ForgaCoreOptions } from '../options.js';
import type { AuthenticatedUser } from '../security/authenticated-user.js';
import { CurrentUser } from '../security/decorators.js';
import { decryptSecret, encryptSecret, serverKey } from '../security/server-key.js';
import { ZodPipe } from '../zod.pipe.js';

/**
 * Write-only fields stored encrypted with `FORGA_SECRET_KEY` (AES-256-GCM, prefix `enc:`): the SMTP password and the
 * client secret of the OIDC provider. Without the server key they stay as they are (the register warns).
 */
export const ENCRYPTED_SETTING_FIELDS: Record<string, string[]> = {
  smtp: ['password'],
  oidc: ['clientSecret'],
};
const ENCRYPTED_PREFIX = 'enc:';

/** How a write-only field is stored: encrypted, in plain text (no server key yet), not readable (other key) or empty. */
export type SecretState = 'encrypted' | 'plain' | 'unreadable' | 'none';

/** One settings section (e.g. `brigade`, `smtp`, `incidents.compensation`) stored as JSON. */
export const SettingSchema = defineEntity({
  name: 'Setting',
  schema: 'core',
  tableName: 'setting',
  properties: {
    section: p.string().primary(),
    value: p.json<Record<string, unknown>>(),
    version: p.integer().version(),
  },
});
export class Setting extends SettingSchema.class {}
SettingSchema.setClass(Setting);

@Injectable()
export class SettingsService implements OnApplicationBootstrap {
  private readonly schemas: Map<string, z.ZodType>;
  private readonly access: Map<string, SettingsAccess>;
  private readonly logger = new Logger('Settings');

  constructor(
    private readonly em: EntityManager,
    @Inject(FORGA_CORE_OPTIONS) options: ForgaCoreOptions,
  ) {
    // A Map, so names like `constructor` or `__proto__` are unknown sections instead of object internals.
    this.schemas = new Map(Object.entries(Object.assign({}, CORE_SETTINGS, ...options.modules.map((m) => m.settings)) as Record<string, z.ZodType>));
    this.access = new Map(Object.entries(Object.assign({}, CORE_SETTINGS_ACCESS, ...options.modules.map((m) => m.settingsAccess)) as Record<string, SettingsAccess>));
  }

  /**
   * Managers of a section: `core.settings.manage`, or `<module>.settings.manage` for the sections of that module, unless
   * the section names its own (`SettingsAccess.managers`, e.g. `core.privacy.manage`).
   */
  managerPermissions(section: string): string[] {
    const managers = this.access.get(section)?.managers;
    if (managers) return managers;
    const module = section.includes('.') ? section.slice(0, section.indexOf('.')) : null;
    return ['core.settings.manage', ...(module && module !== 'core' ? [`${module}.settings.manage`] : [])];
  }

  isManager(user: AuthenticatedUser, section: string): boolean {
    return this.managerPermissions(section).some((permission) => user.can(permission));
  }

  schema(section: string): z.ZodType {
    const schema = this.schemas.get(section);
    if (!schema) throw new NotFoundException({ code: 'settings.unknownSection', section });
    return schema;
  }

  /**
   * Encrypts write-only fields stored in plain text (before the server key was set, or by an older version), without
   * history: the history shows such fields only masked anyway.
   */
  async onApplicationBootstrap(): Promise<void> {
    const key = serverKey();
    if (!key) return;
    const em = this.em.fork();
    for (const [section, fields] of Object.entries(ENCRYPTED_SETTING_FIELDS)) {
      const stored = await em.findOne(Setting, { section });
      if (!stored) continue;
      const plain = fields.filter((field) => typeof stored.value[field] === 'string' && stored.value[field] && !(stored.value[field] as string).startsWith(ENCRYPTED_PREFIX));
      if (!plain.length) continue;
      const value = { ...stored.value, ...Object.fromEntries(plain.map((field) => [field, ENCRYPTED_PREFIX + encryptSecret(stored.value[field] as string, key)])) };
      await em.nativeUpdate(Setting, { section }, { value });
      this.logger.log(`Encrypted the stored ${plain.join(', ')} of the settings section ${section}.`);
    }
  }

  /** The stored value of an encrypted field in plain text; `''` if it cannot be decrypted (other server key). */
  private decrypted(value: unknown): unknown {
    if (typeof value !== 'string' || !value.startsWith(ENCRYPTED_PREFIX)) return value;
    const key = serverKey();
    return (key && decryptSecret(value.slice(ENCRYPTED_PREFIX.length), key)) || '';
  }

  /** How a write-only field is stored (technical measures of the register). */
  async secretState(section: string, field: string): Promise<SecretState> {
    const stored = (await this.em.fork().findOne(Setting, { section }))?.value[field];
    if (typeof stored !== 'string' || !stored) return 'none';
    if (!stored.startsWith(ENCRYPTED_PREFIX)) return 'plain';
    return this.decrypted(stored) ? 'encrypted' : 'unreadable';
  }

  /** The stored value with defaults applied, or `null` if it is incomplete (e.g. before setup). */
  async get<T = Record<string, unknown>>(section: string): Promise<T | null> {
    const schema = this.schema(section);
    const stored = await this.em.fork().findOne(Setting, { section });
    const raw = stored?.value ?? {};
    const value = ENCRYPTED_SETTING_FIELDS[section] ? Object.fromEntries(Object.entries(raw).map(([field, v]) => [field, ENCRYPTED_SETTING_FIELDS[section].includes(field) ? this.decrypted(v) : v])) : raw;
    const result = schema.safeParse(value);
    if (result.success) return result.data as T;
    // A field stored before a stricter rule existed (e.g. an invalid address) falls back to its default
    // instead of losing the whole section.
    const invalid = new Set(result.error.issues.map((issue) => String(issue.path[0] ?? '')));
    if (invalid.has('')) return null;
    const retry = schema.safeParse(Object.fromEntries(Object.entries(value).filter(([key]) => !invalid.has(key))));
    return retry.success ? (retry.data as T) : null;
  }

  /** Changes of a section notify its listeners after the commit, e.g. a new version of the privacy notice. */
  private readonly listeners = new Map<string, ((section: string) => Promise<void>)[]>();

  onChange(sections: readonly string[], listener: (section: string) => Promise<void>): void {
    for (const section of sections) this.listeners.set(section, [...(this.listeners.get(section) ?? []), listener]);
  }

  /** Is the section changed only through its own endpoint? */
  isDedicated(section: string): boolean {
    return Boolean(this.access.get(section)?.dedicatedEndpoint);
  }

  async set(section: string, value: Record<string, unknown>): Promise<void> {
    const em = this.em.fork();
    const stored = await em.findOne(Setting, { section });
    const next = { ...value };
    // Write-only fields keep their stored value when left empty.
    for (const field of SECRET_SETTING_FIELDS[section] ?? []) {
      if (!next[field] && stored?.value[field]) next[field] = stored.value[field];
    }
    const key = serverKey();
    for (const field of ENCRYPTED_SETTING_FIELDS[section] ?? []) {
      const plain = next[field];
      if (key && typeof plain === 'string' && plain && !plain.startsWith(ENCRYPTED_PREFIX)) next[field] = ENCRYPTED_PREFIX + encryptSecret(plain, key);
    }
    if (stored) stored.value = next;
    else em.create(Setting, { section, value: next });
    await em.flush();
    for (const listener of this.listeners.get(section) ?? []) await listener(section);
  }

  /**
   * The value as the user may see it: never write-only fields; sections and fields reserved for the managers
   * only for them.
   */
  async getVisible(section: string, user: AuthenticatedUser): Promise<Record<string, unknown> | null> {
    this.schema(section);
    if (!this.mayRead(user, section)) throw user.denied(this.managerPermissions(section));
    const value = await this.get(section);
    return value && this.redact(section, value, user);
  }

  /** Sections reserved for the managers (e.g. SMTP account, OIDC client) only for them. */
  mayRead(user: AuthenticatedUser, section: string): boolean {
    return !this.access.get(section)?.managersOnly || this.isManager(user, section);
  }

  /**
   * A value without write-only fields and, unless the user manages the section, without the managers' fields
   * (e.g. the secret part of a calendar feed address). Callers check `mayRead` first.
   */
  redact(section: string, value: Record<string, unknown>, user: AuthenticatedUser): Record<string, unknown> {
    const visible = { ...value };
    for (const field of SECRET_SETTING_FIELDS[section] ?? []) delete visible[field];
    if (!this.isManager(user, section)) for (const field of this.access.get(section)?.managerFields ?? []) delete visible[field];
    return visible;
  }
}

@Controller('core/settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /**
   * Authenticated users may read the sections module UIs need (e.g. the brigade name for the header, incident settings);
   * sections with server addresses and accounts (SMTP, OIDC, privacy, reminders) and fields such as the calendar
   * feed token only the managers of the section.
   */
  @Get(':section')
  get(@Param('section') section: string, @CurrentUser() user: AuthenticatedUser) {
    return this.settings.getVisible(section, user);
  }

  /** `core.settings.manage` for every section; `<module>.settings.manage` for the sections of that module. */
  @Put(':section')
  async set(@Param('section') section: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    if (!this.settings.isManager(user, section)) throw user.denied(this.settings.managerPermissions(section));
    if (this.settings.isDedicated(section)) throw new BadRequestException({ code: 'settings.dedicatedEndpoint', section });
    const value = new ZodPipe(this.settings.schema(section)).transform(body) as Record<string, unknown>;
    await this.settings.set(section, value);
    return this.settings.getVisible(section, user);
  }
}
