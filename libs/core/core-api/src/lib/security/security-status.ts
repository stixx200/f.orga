import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { PRIVACY_PERMISSION, type SecurityStatus } from '@forga/core-contracts';
import type { AuthenticatedUser } from './authenticated-user.js';
import { forgaStage } from '../stage.js';
import { CookiePolicy } from './cookie-policy.js';
import { CurrentUser } from './decorators.js';

/** "Settings → Data protection → Security": HTTPS, address and cookies as this request sees them, and the stage. */
@Controller('core/security')
export class SecurityStatusController {
  constructor(private readonly cookies: CookiePolicy) {}

  /** For the managers of the settings and of data protection (the page moved to „Verwaltung → Datenschutz“). */
  @Get('status')
  async status(@Req() req: Request, @CurrentUser() user: AuthenticatedUser): Promise<SecurityStatus> {
    if (!user.can('core.settings.manage') && !user.can(PRIVACY_PERMISSION)) throw user.denied(['core.settings.manage', PRIVACY_PERMISSION]);
    return {
      stage: forgaStage(),
      https: req.secure,
      publicUrlHttps: await this.cookies.publicUrlHttps(),
      secureCookies: await this.cookies.secure(req),
    };
  }
}
