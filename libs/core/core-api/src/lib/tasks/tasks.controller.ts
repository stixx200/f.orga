import { Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import type { Deadline } from '@forga/core-contracts';
import type { AuthenticatedUser } from '../security/authenticated-user.js';
import { CurrentUser, RequirePermissions } from '../security/decorators.js';
import { DeadlineRegistry } from './deadline-registry.js';
import { DigestService } from './digest.service.js';

function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
}

@Controller('core/tasks')
export class TasksController {
  constructor(
    private readonly deadlines: DeadlineRegistry,
    private readonly digest: DigestService,
  ) {}

  /** Deadlines of the current user. `asOf` (YYYY-MM-DD) is for previews; default today. */
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query('asOf') asOf?: string): Promise<Deadline[]> {
    return this.deadlines.forUser(user, asOf && /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? asOf : today());
  }

  /** Sends the weekly digest immediately, e.g. to test the SMTP settings. */
  @Post('digest')
  @HttpCode(200)
  @RequirePermissions('core.settings.manage')
  async sendDigest(): Promise<{ sent: number }> {
    return { sent: await this.digest.send(today(), { resend: true }) };
  }
}
