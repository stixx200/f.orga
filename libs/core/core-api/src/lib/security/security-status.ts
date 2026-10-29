import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { SecurityStatus } from '@forga/core-contracts';
import { forgaStage } from '../stage.js';
import { CookiePolicy } from './cookie-policy.js';
import { RequirePermissions } from './decorators.js';

/** "Settings → Data protection → Security": HTTPS, address and cookies as this request sees them, and the stage. */
@Controller('core/security')
export class SecurityStatusController {
  constructor(private readonly cookies: CookiePolicy) {}

  @Get('status')
  @RequirePermissions('core.settings.manage')
  async status(@Req() req: Request): Promise<SecurityStatus> {
    return {
      stage: forgaStage(),
      https: req.secure,
      publicUrlHttps: await this.cookies.publicUrlHttps(),
      secureCookies: await this.cookies.secure(req),
    };
  }
}
