import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { type AuthenticatedUser, CurrentUser, RequirePermissions, ZodPipe } from '@forga/core-api';
import {
  CancelInput,
  DriverLicenseCheckInput,
  type DriverLicenseFile,
  type DriverLicenseOverview,
  DriverLicenseRequestInput,
  DriverLicenseTokenInput,
  type MyDriverLicense,
} from '@forga/masterdata-contracts';
import type { z } from 'zod';
import { CHECK, DriverLicensesService } from './driver-licenses.service.js';

const BASE = 'persons/:id/driver-license';

/**
 * Driving licence checks. Reading the licence of a person needs `masterdata.persons.read` or
 * `masterdata.licenses.check` for one of the person's departments; everything else `masterdata.licenses.check`.
 */
@Controller('masterdata')
export class DriverLicensesController {
  constructor(private readonly licenses: DriverLicensesService) {}

  /** Persons of the target group with their state ("Führerscheinkontrollen"). */
  @Get('driver-licenses')
  @RequirePermissions(CHECK)
  overview(@CurrentUser() user: AuthenticatedUser): Promise<DriverLicenseOverview> {
    return this.licenses.overview(user);
  }

  @Get('me/driver-license')
  @RequirePermissions('masterdata.self')
  mine(@CurrentUser() user: AuthenticatedUser): Promise<MyDriverLicense> {
    return this.licenses.mine(user);
  }

  @Get(BASE)
  @RequirePermissions()
  file(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<DriverLicenseFile> {
    return this.licenses.file(user, id);
  }

  @Post(`${BASE}/checks`)
  @RequirePermissions(CHECK)
  record(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body(new ZodPipe(DriverLicenseCheckInput)) input: z.output<typeof DriverLicenseCheckInput>): Promise<DriverLicenseFile> {
    return this.licenses.recordCheck(user, id, input);
  }

  @Post(`${BASE}/checks/:checkId/cancel`)
  @HttpCode(200)
  @RequirePermissions(CHECK)
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Param('checkId') checkId: string, @Body(new ZodPipe(CancelInput)) input: z.output<typeof CancelInput>): Promise<DriverLicenseFile> {
    return this.licenses.cancelCheck(user, id, checkId, input.reason);
  }

  @Post(`${BASE}/requests`)
  @RequirePermissions(CHECK)
  request(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body(new ZodPipe(DriverLicenseRequestInput)) input: z.output<typeof DriverLicenseRequestInput>): Promise<DriverLicenseFile> {
    return this.licenses.request(user, id, input);
  }

  @Post(`${BASE}/requests/:requestId/withdraw`)
  @HttpCode(200)
  @RequirePermissions(CHECK)
  withdraw(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Param('requestId') requestId: string, @Body(new ZodPipe(CancelInput)) input: z.output<typeof CancelInput>): Promise<DriverLicenseFile> {
    return this.licenses.withdraw(user, id, requestId, input.reason);
  }

  @Post(`${BASE}/tokens`)
  @RequirePermissions(CHECK)
  registerToken(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body(new ZodPipe(DriverLicenseTokenInput)) input: z.output<typeof DriverLicenseTokenInput>): Promise<DriverLicenseFile> {
    return this.licenses.registerToken(user, id, input);
  }

  @Post(`${BASE}/tokens/:tokenId/revoke`)
  @HttpCode(200)
  @RequirePermissions(CHECK)
  revokeToken(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Param('tokenId') tokenId: string, @Body(new ZodPipe(CancelInput)) input: z.output<typeof CancelInput>): Promise<DriverLicenseFile> {
    return this.licenses.revokeToken(user, id, tokenId, input.reason);
  }
}
