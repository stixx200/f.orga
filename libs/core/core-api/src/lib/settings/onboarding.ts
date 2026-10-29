import { Controller, ForbiddenException, Get, Inject, Req } from '@nestjs/common';
import type { Request } from 'express';
import { EntityManager } from '@mikro-orm/core';
import type { BrigadeSettings, OnboardingItem, SmtpSettings } from '@forga/core-contracts';
import { ModuleStateService } from '../module/modules.js';
import { FORGA_CORE_OPTIONS, type ForgaCoreOptions } from '../options.js';
import type { AuthenticatedUser } from '../security/authenticated-user.js';
import { CurrentUser } from '../security/decorators.js';
import { OrganizationDirectory } from '../security/organization-directory.js';
import { User } from '../security/security.entities.js';
import { forgaStage } from '../stage.js';
import { Setting, SettingsService } from './settings.js';

/**
 * What an administrator still has to set up on a new installation: HTTPS, public address, e-mail, departments, catalogs,
 * the settings of each active module (statute values such as compensation rates) and further users.
 */
@Controller('core/onboarding')
export class OnboardingController {
  constructor(
    private readonly em: EntityManager,
    private readonly settings: SettingsService,
    private readonly organization: OrganizationDirectory,
    private readonly modules: ModuleStateService,
    @Inject(FORGA_CORE_OPTIONS) private readonly options: ForgaCoreOptions,
  ) {}

  @Get()
  async items(@CurrentUser() user: AuthenticatedUser, @Req() req: Request): Promise<OnboardingItem[]> {
    if (!user.can('core.settings.manage') && !user.can('core.users.manage')) {
      throw new ForbiddenException({ code: 'auth.forbidden', permissions: ['core.settings.manage', 'core.users.manage'] });
    }
    const em = this.em.fork();
    const brigade = await this.settings.get<BrigadeSettings>('brigade');
    const smtp = await this.settings.get<SmtpSettings>('smtp');
    const items: OnboardingItem[] = [
      { key: 'publicUrl', done: Boolean(brigade?.publicUrl || process.env.FORGA_PUBLIC_URL), to: '/admin/settings' },
      { key: 'smtp', done: process.env.FORGA_MAIL_TRANSPORT === 'memory' || Boolean(smtp?.host && smtp.sender), to: '/admin/settings?tab=smtp' },
    ];
    // Passwords, sessions and health data only encrypted: warns while f.orga is opened over plain HTTP (not on the
    // developer's machine). Behind a TLS proxy this needs `FORGA_TRUST_PROXY`, so the request counts as HTTPS.
    if (forgaStage() !== 'development') items.unshift({ key: 'https', done: req.secure, to: '/admin/settings?tab=security' });
    const inactive = await this.modules.inactiveIds();
    if (this.organization.available && !inactive.has('masterdata')) {
      items.push({ key: 'departments', done: (await this.organization.departments()).length > 0, to: '/masterdata/organization' });
      items.push({ key: 'catalogs', done: ((await this.organization.catalogEntries()) ?? 0) > 0, to: '/masterdata/catalogs' });
    }
    const stored = new Set((await em.find(Setting, {}, { fields: ['section'] })).map((s) => s.section));
    for (const { manifest, settings } of this.options.modules) {
      if (inactive.has(manifest.id) || !Object.keys(settings).length) continue;
      const page = (manifest.navigation ?? []).find((n) => n.section === 'settings' && n.path === 'settings');
      if (!page || page.onboarding === false) continue;
      items.push({
        key: `module:${manifest.id}`,
        done: Object.keys(settings).some((section) => stored.has(section)),
        to: `/${manifest.id}/settings`,
        label: page.label,
      });
    }
    items.push({ key: 'users', done: (await em.count(User, { technical: false })) > 1, to: '/admin/users' });
    return items;
  }
}
