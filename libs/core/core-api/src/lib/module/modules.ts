import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Injectable,
  NotFoundException,
  type OnApplicationBootstrap,
  Param,
  Put,
  type NestMiddleware,
} from '@nestjs/common';
import { defineEntity, EntityManager, p } from '@mikro-orm/core';
import type { NextFunction, Request, Response } from 'express';
import { type ActiveModule, ModuleActivation, type ModuleStatus } from '@forga/core-contracts';
import { Audit } from '../audit/audit.js';
import { FORGA_CORE_OPTIONS, type ForgaCoreOptions } from '../options.js';
import { RequirePermissions } from '../security/decorators.js';
import { Role } from '../security/security.entities.js';
import { ZodPipe } from '../zod.pipe.js';

type GrantedTemplates = Record<string, { permissions: string[]; permissionsAllDepartments: string[] }>;

/** Activation state of an installed module; a row is created when the server first sees the module. Without a row, the module is active. */
export const ModuleStateSchema = defineEntity({
  name: 'ModuleState',
  schema: 'core',
  tableName: 'module',
  properties: {
    id: p.string().primary(),
    active: p.boolean().default(true),
    /** Permissions of the module's role templates already added to the roles, per template key. */
    grantedTemplates: p.json<GrantedTemplates>().nullable(),
    updatedAt: p.datetime().onCreate(() => new Date()).onUpdate(() => new Date()),
  },
});
export class ModuleState extends ModuleStateSchema.class {}
ModuleStateSchema.setClass(ModuleState);

@Injectable()
export class ModuleStateService implements OnApplicationBootstrap {
  private inactive?: Set<string>;

  constructor(
    private readonly em: EntityManager,
    @Inject(FORGA_CORE_OPTIONS) private readonly options: ForgaCoreOptions,
  ) {}

  /**
   * Adds permissions of a module's role templates to the existing roles created from these templates,
   * once per permission: when a module is installed and when an update brings new permissions.
   * Permissions an administrator removed later are not added again. A module known from before this
   * bookkeeping existed (row without `grantedTemplates`) only records its current template as baseline.
   */
  async onApplicationBootstrap(): Promise<void> {
    const em = this.em.fork();
    const states = new Map((await em.find(ModuleState, {})).map((s) => [s.id, s]));
    const roles = await em.find(Role, { templateKey: { $ne: null } });
    for (const { manifest } of this.installed) {
      const existing = states.get(manifest.id);
      const state = existing ?? em.create(ModuleState, { id: manifest.id, active: true, updatedAt: new Date() });
      const baseline = Boolean(existing) && !existing!.grantedTemplates;
      const granted: GrantedTemplates = { ...state.grantedTemplates };
      for (const template of manifest.roles ?? []) {
        const before = granted[template.key] ?? { permissions: [], permissionsAllDepartments: [] };
        const added = (template.permissions ?? []).filter((permission) => !before.permissions.includes(permission));
        const addedAll = (template.permissionsAllDepartments ?? []).filter((permission) => !before.permissionsAllDepartments.includes(permission));
        if (!added.length && !addedAll.length) continue;
        if (!baseline) {
          for (const role of roles.filter((r) => r.templateKey === template.key)) {
            role.permissions = [...new Set([...role.permissions, ...added])];
            role.permissionsAllDepartments = [...new Set([...role.permissionsAllDepartments, ...addedAll])];
          }
        }
        granted[template.key] = { permissions: [...before.permissions, ...added], permissionsAllDepartments: [...before.permissionsAllDepartments, ...addedAll] };
      }
      state.grantedTemplates = granted;
    }
    await em.flush();
  }

  get installed() {
    return this.options.modules;
  }

  async inactiveIds(): Promise<ReadonlySet<string>> {
    if (!this.inactive) {
      const states = await this.em.fork().find(ModuleState, { active: false });
      this.inactive = new Set(states.map((s) => s.id));
    }
    return this.inactive;
  }

  async status(): Promise<ModuleStatus[]> {
    const inactive = await this.inactiveIds();
    return this.installed.map(({ manifest }) => ({
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      active: !inactive.has(manifest.id),
      requires: manifest.requires ?? [],
      optional: manifest.optional ?? [],
    }));
  }

  /** Activating needs active requirements; deactivating needs no active module depending on it. */
  async setActive(id: string, active: boolean): Promise<void> {
    const module = this.installed.find((m) => m.manifest.id === id);
    if (!module) throw new NotFoundException();
    const inactive = new Set(await this.inactiveIds());

    if (active) {
      const missing = (module.manifest.requires ?? []).filter((r) => inactive.has(r));
      if (missing.length) throw new BadRequestException({ code: 'modules.requirementsInactive', modules: missing });
      inactive.delete(id);
    } else {
      const dependents = this.installed
        .filter((m) => !inactive.has(m.manifest.id) && (m.manifest.requires ?? []).includes(id))
        .map((m) => m.manifest.id);
      if (dependents.length) throw new BadRequestException({ code: 'modules.requiredByActive', modules: dependents });
      inactive.add(id);
    }

    const em = this.em.fork();
    await em.upsert(ModuleState, { id, active, updatedAt: new Date() });
    this.inactive = inactive;
  }
}

/** Answers requests to routes of inactive modules with 404. Module routes start with `/api/<module-id>/`. */
@Injectable()
export class ModuleGateMiddleware implements NestMiddleware {
  constructor(private readonly modules: ModuleStateService) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    // Express matches routes case-insensitively and decoded, so the gate compares the same way
    // (`/api/Cost-Recovery/…` must not bypass a deactivated module).
    const raw = /^\/+api\/+([^/?#]+)/i.exec(req.originalUrl)?.[1];
    let segment = raw;
    try {
      segment = raw && decodeURIComponent(raw);
    } catch {
      // Malformed escapes: Express answers 400 anyway; compare the raw segment.
    }
    segment = segment?.toLowerCase();
    if (segment && (await this.modules.inactiveIds()).has(segment)) {
      res.status(404).json({ code: 'modules.inactive', module: segment });
      return;
    }
    next();
  }
}

@Controller('core/modules')
export class ModulesController {
  constructor(
    private readonly modules: ModuleStateService,
    private readonly audit: Audit,
    @Inject(FORGA_CORE_OPTIONS) private readonly options: ForgaCoreOptions,
  ) {}

  /** Active modules with navigation and federation entry, for the shell. */
  @Get()
  async active(): Promise<ActiveModule[]> {
    const inactive = await this.modules.inactiveIds();
    return this.options.modules
      .filter((m) => !inactive.has(m.manifest.id))
      .map(({ manifest }) => ({
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        navigation: manifest.navigation ?? [],
        frontend: manifest.frontend && { ...manifest.frontend, entry: this.options.frontendEntry(manifest.id) },
      }));
  }

  @Get('status')
  @RequirePermissions('core.modules.manage')
  status(): Promise<ModuleStatus[]> {
    return this.modules.status();
  }

  @Put(':id')
  @RequirePermissions('core.modules.manage')
  async setActive(@Param('id') id: string, @Body(new ZodPipe(ModuleActivation)) input: ModuleActivation) {
    await this.modules.setActive(id, input.active);
    await this.audit.log(input.active ? 'modules.activated' : 'modules.deactivated', { moduleId: id });
    return this.modules.status();
  }
}
