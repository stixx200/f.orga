import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { type AuthenticatedUser, CurrentUser, RequirePermissions, ZodPipe } from '@forga/core-api';
import { CancelInput, type PersonDeviceToken, PersonDeviceTokenInput } from '@forga/masterdata-contracts';
import type { z } from 'zod';
import { PersonDevicesService } from './person-devices.service.js';
import { READ, WRITE } from '../persons/persons.service.js';

const BASE = 'persons/:id/device-tokens';

/**
 * Devices of a person for the info terminal. Listing needs `masterdata.persons.read` in the departments of the person,
 * registering and revoking `masterdata.persons.write` (as editing the person).
 */
@Controller('masterdata')
export class PersonDevicesController {
  constructor(private readonly devices: PersonDevicesService) {}

  @Get(BASE)
  @RequirePermissions(READ)
  list(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<PersonDeviceToken[]> {
    return this.devices.list(user, id);
  }

  @Post(BASE)
  @RequirePermissions(WRITE)
  register(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body(new ZodPipe(PersonDeviceTokenInput)) input: z.output<typeof PersonDeviceTokenInput>): Promise<PersonDeviceToken[]> {
    return this.devices.register(user, id, input);
  }

  @Post(`${BASE}/:tokenId/revoke`)
  @HttpCode(200)
  @RequirePermissions(WRITE)
  revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('tokenId') tokenId: string,
    @Body(new ZodPipe(CancelInput)) input: z.output<typeof CancelInput>,
  ): Promise<PersonDeviceToken[]> {
    return this.devices.revoke(user, id, tokenId, input.reason);
  }
}
