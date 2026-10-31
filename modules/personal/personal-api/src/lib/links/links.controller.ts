import { Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { type AuthenticatedUser, CurrentUser, RequirePermissions } from '@forga/core-api';
import { PERSONAL_MANAGE, PERSONAL_READ } from '@forga/personal-contracts';
import { LinksService } from './links.service.js';

/** Administration of personal access links. The person file shows the same endpoints for one person. */
@Controller('personal')
export class LinksController {
  constructor(private readonly links: LinksService) {}

  @Get('links')
  @RequirePermissions(PERSONAL_READ)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.links.list(user);
  }

  @Get('persons/:personId/link')
  @RequirePermissions(PERSONAL_READ)
  current(@CurrentUser() user: AuthenticatedUser, @Param('personId') personId: string) {
    return this.links.current(user, personId);
  }

  @Post('persons/:personId/link')
  @RequirePermissions(PERSONAL_MANAGE)
  create(@CurrentUser() user: AuthenticatedUser, @Param('personId') personId: string) {
    return this.links.create(user, personId);
  }

  @Post('persons/:personId/link/show')
  @RequirePermissions(PERSONAL_MANAGE)
  show(@CurrentUser() user: AuthenticatedUser, @Param('personId') personId: string) {
    return this.links.show(user, personId);
  }

  @Post('persons/:personId/link/mail')
  @RequirePermissions(PERSONAL_MANAGE)
  mail(@CurrentUser() user: AuthenticatedUser, @Param('personId') personId: string) {
    return this.links.mail(user, personId);
  }

  @Delete('persons/:personId/link')
  @RequirePermissions(PERSONAL_MANAGE)
  revoke(@CurrentUser() user: AuthenticatedUser, @Param('personId') personId: string) {
    return this.links.revoke(user, personId);
  }
}
