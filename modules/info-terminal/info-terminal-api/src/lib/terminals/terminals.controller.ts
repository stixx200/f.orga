import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { type AuthenticatedUser, CurrentUser, RequirePermissions, ZodPipe } from '@forga/core-api';
import { INFO_TERMINAL_MANAGE, INFO_TERMINAL_READ, type Terminal, TerminalInput, type TerminalLink, TerminalUpdate } from '@forga/info-terminal-contracts';
import { type ParsedInput, type ParsedUpdate, TerminalsService } from './terminals.service.js';

const LinkRequest = z.object({ purpose: z.enum(['show', 'copy', 'open']).default('show') });

/** Administration of the info terminals ("Verwaltung → Infoterminals" and the card of the station). */
@Controller('info-terminal/terminals')
export class TerminalsController {
  constructor(private readonly terminals: TerminalsService) {}

  /** Terminals of the user's departments, without key or link; `includeRevoked=true` also the revoked ones. */
  @Get()
  @RequirePermissions(INFO_TERMINAL_READ)
  list(@CurrentUser() user: AuthenticatedUser, @Query('includeRevoked') includeRevoked?: string): Promise<Terminal[]> {
    return this.terminals.list(user, includeRevoked === 'true');
  }

  /** Creates a terminal and returns its link once with it (it can be shown again later). */
  @Post()
  @RequirePermissions(INFO_TERMINAL_MANAGE)
  create(@Body(new ZodPipe(TerminalInput)) input: ParsedInput, @CurrentUser() user: AuthenticatedUser): Promise<TerminalLink> {
    return this.terminals.create(user, input);
  }

  @Put(':id')
  @RequirePermissions(INFO_TERMINAL_MANAGE)
  update(@Param('id') id: string, @Body(new ZodPipe(TerminalUpdate)) input: ParsedUpdate, @CurrentUser() user: AuthenticatedUser): Promise<Terminal> {
    return this.terminals.update(user, id, input);
  }

  /** The link again (to show, copy or open it); recorded in the audit log (`info-terminal.link-shown`). */
  @Post(':id/link')
  @HttpCode(200)
  @RequirePermissions(INFO_TERMINAL_MANAGE)
  link(@Param('id') id: string, @Body(new ZodPipe(LinkRequest)) input: z.output<typeof LinkRequest>, @CurrentUser() user: AuthenticatedUser): Promise<TerminalLink> {
    return this.terminals.showLink(user, id, input.purpose);
  }

  /** A new link; the old one stops working at once. */
  @Post(':id/rotate')
  @HttpCode(200)
  @RequirePermissions(INFO_TERMINAL_MANAGE)
  rotate(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<TerminalLink> {
    return this.terminals.rotate(user, id);
  }

  @Post(':id/revoke')
  @HttpCode(200)
  @RequirePermissions(INFO_TERMINAL_MANAGE)
  revoke(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<Terminal> {
    return this.terminals.revoke(user, id);
  }
}
