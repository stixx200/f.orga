import {
  Body,
  Controller,
  Get,
  Inject,
  Injectable,
  NotFoundException,
  Param,
  Put,
} from '@nestjs/common';
import { defineEntity, EntityManager, p } from '@mikro-orm/core';
import type { z } from 'zod';
import { CORE_SETTINGS, CORE_SETTINGS_ACCESS, SECRET_SETTING_FIELDS, type SettingsAccess } from '@forga/core-contracts';
import { FORGA_CORE_OPTIONS, type ForgaCoreOptions } from '../options.js';
import type { AuthenticatedUser } from '../security/authenticated-user.js';
import { CurrentUser } from '../security/decorators.js';
import { ZodPipe } from '../zod.pipe.js';

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
export class SettingsService {
  private readonly schemas: Map<string, z.ZodType>;
  private readonly access: Map<string, SettingsAccess>;

  constructor(
    private readonly em: EntityManager,
    @Inject(FORGA_CORE_OPTIONS) options: ForgaCoreOptions,
  ) {
    // A Map, so names like `constructor` or `__proto__` are unknown sections instead of object internals.
    this.schemas = new Map(Object.entries(Object.assign({}, CORE_SETTINGS, ...options.modules.map((m) => m.settings)) as Record<string, z.ZodType>));
    this.access = new Map(Object.entries(Object.assign({}, CORE_SETTINGS_ACCESS, ...options.modules.map((m) => m.settingsAccess)) as Record<string, SettingsAccess>));
  }

  /** Managers of a section: `core.settings.manage`, or `<module>.settings.manage` for the sections of that module. */
  managerPermissions(section: string): string[] {
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

  /** The stored value with defaults applied, or `null` if it is incomplete (e.g. before setup). */
  async get<T = Record<string, unknown>>(section: string): Promise<T | null> {
    const schema = this.schema(section);
    const stored = await this.em.fork().findOne(Setting, { section });
    const value = stored?.value ?? {};
    const result = schema.safeParse(value);
    if (result.success) return result.data as T;
    // A field stored before a stricter rule existed (e.g. an invalid address) falls back to its default
    // instead of losing the whole section.
    const invalid = new Set(result.error.issues.map((issue) => String(issue.path[0] ?? '')));
    if (invalid.has('')) return null;
    const retry = schema.safeParse(Object.fromEntries(Object.entries(value).filter(([key]) => !invalid.has(key))));
    return retry.success ? (retry.data as T) : null;
  }

  async set(section: string, value: Record<string, unknown>): Promise<void> {
    const em = this.em.fork();
    const stored = await em.findOne(Setting, { section });
    const next = { ...value };
    // Write-only fields keep their stored value when left empty.
    for (const field of SECRET_SETTING_FIELDS[section] ?? []) {
      if (!next[field] && stored?.value[field]) next[field] = stored.value[field];
    }
    if (stored) stored.value = next;
    else em.create(Setting, { section, value: next });
    await em.flush();
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
    const value = new ZodPipe(this.settings.schema(section)).transform(body) as Record<string, unknown>;
    await this.settings.set(section, value);
    return this.settings.getVisible(section, user);
  }
}
