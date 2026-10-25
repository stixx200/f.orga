import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Injectable,
  NotFoundException,
  Param,
  Put,
} from '@nestjs/common';
import { defineEntity, EntityManager, p } from '@mikro-orm/core';
import type { z } from 'zod';
import { CORE_SETTINGS, SECRET_SETTING_FIELDS } from '@forga/core-contracts';
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

  constructor(
    private readonly em: EntityManager,
    @Inject(FORGA_CORE_OPTIONS) options: ForgaCoreOptions,
  ) {
    // A Map, so names like `constructor` or `__proto__` are unknown sections instead of object internals.
    this.schemas = new Map(Object.entries(Object.assign({}, CORE_SETTINGS, ...options.modules.map((m) => m.settings)) as Record<string, z.ZodType>));
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
    const result = schema.safeParse(stored?.value ?? {});
    return result.success ? (result.data as T) : null;
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

  /** The value as the UI may see it: without write-only fields. */
  async getPublic(section: string): Promise<Record<string, unknown> | null> {
    const value = await this.get(section);
    if (!value) return null;
    const visible = { ...value };
    for (const field of SECRET_SETTING_FIELDS[section] ?? []) delete visible[field];
    return visible;
  }
}

@Controller('core/settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** Every authenticated user may read settings (e.g. the brigade name for the header). */
  @Get(':section')
  get(@Param('section') section: string) {
    return this.settings.getPublic(section);
  }

  /** `core.settings.manage` for every section; `<module>.settings.manage` for the sections of that module. */
  @Put(':section')
  async set(@Param('section') section: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const module = section.includes('.') ? section.slice(0, section.indexOf('.')) : null;
    const permissions = ['core.settings.manage', ...(module && module !== 'core' ? [`${module}.settings.manage`] : [])];
    if (!permissions.some((permission) => user.can(permission))) throw new ForbiddenException({ code: 'auth.forbidden', permissions });
    const value = new ZodPipe(this.settings.schema(section)).transform(body) as Record<string, unknown>;
    await this.settings.set(section, value);
    return this.settings.getPublic(section);
  }
}
