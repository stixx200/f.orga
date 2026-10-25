import { Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import type { Deadline } from '@forga/core-contracts';
import { User } from '../security/security.entities.js';
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
    private readonly em: EntityManager,
  ) {}

  /**
   * Deadlines of the current user, without the modules and kinds he hid in his profile (`all=true` includes them,
   * e.g. to choose what to hide). `asOf` (YYYY-MM-DD) is for previews; default today.
   */
  @Get()
  async list(@CurrentUser() user: AuthenticatedUser, @Query('asOf') asOf?: string, @Query('all') all?: string): Promise<Deadline[]> {
    const tasks = await this.deadlines.forUser(user, asOf && /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? asOf : today());
    if (all === 'true') return tasks;
    const hidden = new Set((await this.em.fork().findOne(User, user.id))?.hiddenTasks ?? []);
    return hidden.size ? tasks.filter((t) => !hidden.has(t.module) && !hidden.has(`${t.module}:${t.kind}`)) : tasks;
  }

  /** Sends the weekly digest immediately, e.g. to test the SMTP settings. */
  @Post('digest')
  @HttpCode(200)
  @RequirePermissions('core.settings.manage')
  async sendDigest(): Promise<{ sent: number }> {
    return { sent: await this.digest.send(today(), { resend: true }) };
  }
}
