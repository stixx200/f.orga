import { BadRequestException, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import type { MySession } from '@forga/core-contracts';
import { Audit } from '../audit/audit.js';
import type { AuthenticatedUser } from './authenticated-user.js';
import { CurrentUser } from './decorators.js';
import { Session } from './security.entities.js';

/** Own sessions only, never during an impersonation (the administrator would see and end the user's devices). */
function assertOwn(user: AuthenticatedUser): void {
  if (user.via !== 'session') throw new ForbiddenException({ code: 'auth.sessionRequired' });
  if (user.impersonator) throw new ForbiddenException({ code: 'auth.impersonationNotAllowed' });
}

/** „Angemeldete Geräte“ in the profile (L16): the user's sessions with browser, address and last activity. */
@Controller('core/me/sessions')
export class MySessionsController {
  constructor(
    private readonly em: EntityManager,
    private readonly audit: Audit,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser): Promise<MySession[]> {
    assertOwn(user);
    const sessions = await this.em.fork().find(Session, { user: user.id, impersonator: null, expiresAt: { $gt: new Date() } }, { orderBy: { lastActivityAt: 'desc' } });
    return sessions.map((s) => ({
      id: s.ref,
      browser: s.userAgent ?? null,
      address: s.address ?? null,
      createdAt: s.createdAt.toISOString(),
      lastActivityAt: s.lastActivityAt.toISOString(),
      persistent: s.persistent,
      current: s.id === user.sessionId,
    }));
  }

  /** Signs out one other device; the own session ends with „Abmelden“. */
  @Delete(':id')
  @HttpCode(204)
  async end(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    assertOwn(user);
    const em = this.em.fork();
    const session = await em.findOne(Session, { ref: id, user: user.id, impersonator: null });
    if (!session) throw new NotFoundException({ code: 'auth.sessionNotFound' });
    if (session.id === user.sessionId) throw new BadRequestException({ code: 'auth.sessionCurrent' });
    await em.nativeDelete(Session, { id: session.id });
    await this.audit.log('auth.session-ended', { browser: session.userAgent ?? null });
  }

  /** „Alle anderen abmelden“: every session of the user except this one. */
  @Post('end-others')
  @HttpCode(200)
  async endOthers(@CurrentUser() user: AuthenticatedUser): Promise<{ ended: number }> {
    assertOwn(user);
    const ended = await this.em.fork().nativeDelete(Session, { user: user.id, impersonator: null, id: { $ne: user.sessionId ?? '' } });
    await this.audit.log('auth.other-sessions-ended', { count: ended });
    return { ended };
  }
}
