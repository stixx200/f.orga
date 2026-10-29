import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { CSRF_HEADER, Public, ZodPipe } from '@forga/core-api';
import { TerminalBookingInput } from '@forga/incidents-contracts';
import {
  KioskDriverLicenseInput,
  type KioskDriverLicense,
  KioskIncidentInput,
  type KioskEntry,
  type KioskMatch,
  type KioskOverview,
  type KioskPerson,
  type KioskReport,
  type KioskSessionDetail,
  KioskSessionInput,
  type KioskTerminal,
  TERMINAL_COOKIE,
} from '@forga/info-terminal-contracts';
import { TerminalCheckInInput } from '@forga/training-contracts';
import type { TerminalEntity } from '../info-terminal.entities.js';
import { KioskService } from './kiosk.service.js';
import { CurrentTerminal, type KioskRequest, TerminalAuth, TerminalGuard } from './terminal-auth.js';

const DepartmentBody = z.object({ departmentId: z.uuid() });
const Booking = TerminalBookingInput.and(DepartmentBody);
const CheckIn = TerminalCheckInInput.and(DepartmentBody);

/**
 * Endpoints of the info terminal (kiosk page `/terminal`). Public for the global guard; the device cookie
 * authenticates instead (`TerminalGuard`). Every request names the department of the view, which must be one of the
 * terminal's. There is no endpoint that hands out a report or a session as a whole.
 */
@Controller('info-terminal/kiosk')
@Public()
export class KioskController {
  constructor(
    private readonly kiosk: KioskService,
    private readonly auth: TerminalAuth,
  ) {}

  /** Exchanges the key from the link (fragment `#k=…`) for the device cookie. */
  @Post('session')
  @HttpCode(200)
  async open(@Body(new ZodPipe(KioskSessionInput)) input: KioskSessionInput, @Req() req: KioskRequest, @Res({ passthrough: true }) res: Response): Promise<KioskTerminal> {
    // Like every request from the UI: no other site can make a browser open a terminal.
    if (req.headers[CSRF_HEADER] !== '1') throw new ForbiddenException({ code: 'auth.csrf' });
    const terminal = await this.auth.authenticate(input.key, req.ip ?? '');
    res.cookie(TERMINAL_COOKIE, input.key, await this.auth.cookieOptions(req));
    return this.kiosk.terminal(terminal);
  }

  @Get('terminal')
  @UseGuards(TerminalGuard)
  terminal(@CurrentTerminal() terminal: TerminalEntity): Promise<KioskTerminal> {
    return this.kiosk.terminal(terminal);
  }

  @Get('overview')
  @UseGuards(TerminalGuard)
  overview(@CurrentTerminal() terminal: TerminalEntity, @Query('departmentId') departmentId?: string): Promise<KioskOverview> {
    return this.kiosk.overview(terminal, departmentId);
  }

  /** Name tiles of the department. */
  @Get('members')
  @UseGuards(TerminalGuard)
  members(@CurrentTerminal() terminal: TerminalEntity, @Query('departmentId') departmentId?: string): Promise<KioskPerson[]> {
    return this.kiosk.members(terminal, departmentId);
  }

  @Get('persons')
  @UseGuards(TerminalGuard)
  search(@CurrentTerminal() terminal: TerminalEntity, @Query('departmentId') departmentId?: string, @Query('q') q = ''): Promise<KioskPerson[]> {
    return this.kiosk.search(terminal, departmentId, q);
  }

  @Get('reports/:reportId')
  @UseGuards(TerminalGuard)
  report(@CurrentTerminal() terminal: TerminalEntity, @Param('reportId') reportId: string, @Query('departmentId') departmentId?: string): Promise<KioskReport> {
    return this.kiosk.report(terminal, departmentId, reportId);
  }

  /** Books the person or changes the own booking (`personId` of the body is the one of the path). */
  @Put('reports/:reportId/entries/:personId')
  @UseGuards(TerminalGuard)
  book(
    @CurrentTerminal() terminal: TerminalEntity,
    @Param('reportId') reportId: string,
    @Param('personId') personId: string,
    @Body(new ZodPipe(Booking)) input: z.output<typeof Booking>,
  ): Promise<KioskEntry> {
    return this.kiosk.book(terminal, input.departmentId, reportId, { ...input, personId });
  }

  @Delete('reports/:reportId/entries/:personId')
  @HttpCode(204)
  @UseGuards(TerminalGuard)
  async cancel(
    @CurrentTerminal() terminal: TerminalEntity,
    @Param('reportId') reportId: string,
    @Param('personId') personId: string,
    @Query('departmentId') departmentId?: string,
  ): Promise<void> {
    await this.kiosk.cancel(terminal, departmentId, reportId, personId);
  }

  @Get('keywords')
  @UseGuards(TerminalGuard)
  keywords(@CurrentTerminal() terminal: TerminalEntity) {
    return this.kiosk.keywords(terminal);
  }

  /** "Weiter" of "Neuer Einsatz": incidents that may be the same, with minimal data. */
  @Post('incidents/matches')
  @HttpCode(200)
  @UseGuards(TerminalGuard)
  matches(@CurrentTerminal() terminal: TerminalEntity, @Body(new ZodPipe(KioskIncidentInput)) input: z.output<typeof KioskIncidentInput>): Promise<KioskMatch[]> {
    return this.kiosk.matches(terminal, input);
  }

  /** Creates the incident with the report of the department, or adds the report to `joinIncidentId`. */
  @Post('incidents')
  @UseGuards(TerminalGuard)
  createIncident(@CurrentTerminal() terminal: TerminalEntity, @Body(new ZodPipe(KioskIncidentInput)) input: z.output<typeof KioskIncidentInput>): Promise<{ reportId: string }> {
    return this.kiosk.createIncident(terminal, input);
  }

  @Get('sessions/:sessionId')
  @UseGuards(TerminalGuard)
  session(@CurrentTerminal() terminal: TerminalEntity, @Param('sessionId') sessionId: string, @Query('departmentId') departmentId?: string): Promise<KioskSessionDetail> {
    return this.kiosk.sessionDetail(terminal, departmentId, sessionId);
  }

  @Put('sessions/:sessionId/attendance/:personId')
  @HttpCode(204)
  @UseGuards(TerminalGuard)
  async checkIn(
    @CurrentTerminal() terminal: TerminalEntity,
    @Param('sessionId') sessionId: string,
    @Param('personId') personId: string,
    @Body(new ZodPipe(CheckIn)) input: z.output<typeof CheckIn>,
  ): Promise<void> {
    await this.kiosk.checkIn(terminal, input.departmentId, sessionId, { ...input, personId });
  }

  @Delete('sessions/:sessionId/attendance/:personId')
  @HttpCode(204)
  @UseGuards(TerminalGuard)
  async cancelCheckIn(
    @CurrentTerminal() terminal: TerminalEntity,
    @Param('sessionId') sessionId: string,
    @Param('personId') personId: string,
    @Query('departmentId') departmentId?: string,
  ): Promise<void> {
    await this.kiosk.cancelCheckIn(terminal, departmentId, sessionId, personId);
  }

  /**
   * Self-check of a driving licence with a registered sticker: without `confirm` name, classes and whether a
   * self-check is possible; with `confirm` the check is recorded. Unknown codes: `404 info-terminal.licenseNotRegistered`.
   */
  @Post('driver-license')
  @HttpCode(200)
  @UseGuards(TerminalGuard)
  driverLicense(@CurrentTerminal() terminal: TerminalEntity, @Body(new ZodPipe(KioskDriverLicenseInput)) input: z.output<typeof KioskDriverLicenseInput>): Promise<KioskDriverLicense> {
    return this.kiosk.driverLicense(terminal, input);
  }
}
