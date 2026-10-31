import { Controller, ForbiddenException, Get, HttpCode, Post, Req, Res, UseGuards, Body } from '@nestjs/common';
import type { Response } from 'express';
import { CSRF_HEADER, Public, ZodPipe } from '@forga/core-api';
import { KioskSessionInput, PERSONAL_COOKIE, type PersonalView } from '@forga/personal-contracts';
import { AccessAuth, AccessGuard, CurrentLink, type KioskRequest } from './access-auth.js';
import { LinksService } from '../links/links.service.js';
import type { AccessLinkEntity } from '../personal.entities.js';

/**
 * The personal view (`/personal`). Public for the global guard; the access cookie authenticates instead.
 * The key from the link is exchanged once and is not written to the server log (it arrives in the body, not the URL).
 */
@Controller('personal/kiosk')
@Public()
export class KioskController {
  constructor(
    private readonly links: LinksService,
    private readonly auth: AccessAuth,
  ) {}

  @Post('session')
  @HttpCode(200)
  async open(@Body(new ZodPipe(KioskSessionInput)) input: KioskSessionInput, @Req() req: KioskRequest, @Res({ passthrough: true }) res: Response): Promise<{ ok: true }> {
    if (req.headers[CSRF_HEADER] !== '1') throw new ForbiddenException({ code: 'auth.csrf' });
    await this.auth.authenticate(input.key, req.ip ?? '');
    res.cookie(PERSONAL_COOKIE, input.key, await this.auth.cookieOptions(req));
    return { ok: true };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: KioskRequest, @Res({ passthrough: true }) res: Response): Promise<{ ok: true }> {
    if (req.headers[CSRF_HEADER] !== '1') throw new ForbiddenException({ code: 'auth.csrf' });
    const options = await this.auth.cookieOptions(req);
    res.clearCookie(PERSONAL_COOKIE, { path: options.path, httpOnly: true, sameSite: 'strict', secure: options.secure });
    return { ok: true };
  }

  @Get('file')
  @UseGuards(AccessGuard)
  file(@CurrentLink() link: AccessLinkEntity): Promise<PersonalView> {
    return this.links.view(link);
  }
}
