import { Body, Controller, Get, NotFoundException, Put } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { assertVersion, type AuthenticatedUser, CurrentUser, RequirePermissions, ZodPipe } from '@forga/core-api';
import { type Person as PersonDto, SelfContactInput } from '@forga/masterdata-contracts';
import { Person } from '../masterdata.entities.js';
import { PersonsService } from '../persons/persons.service.js';

const SELF = 'masterdata.self';
const POPULATE = ['memberships.department', 'qualifications', 'ranks', 'honors', 'offices', 'restPeriods'] as const;

/** "My area": the person linked to the user sees the own file and changes contact details and bank account. */
@Controller('masterdata/me')
export class SelfController {
  constructor(
    private readonly em: EntityManager,
    private readonly persons: PersonsService,
  ) {}

  private async own(em: EntityManager, user: AuthenticatedUser): Promise<Person> {
    const person = user.personId ? await em.findOne(Person, user.personId, { populate: POPULATE }) : null;
    if (!person) throw new NotFoundException({ code: 'masterdata.noPerson' });
    return person;
  }

  @Get()
  @RequirePermissions(SELF)
  async get(@CurrentUser() user: AuthenticatedUser): Promise<PersonDto> {
    return this.persons.toDto(await this.own(this.em.fork(), user), user, { self: true });
  }

  @Put()
  @RequirePermissions(SELF)
  async update(@CurrentUser() user: AuthenticatedUser, @Body(new ZodPipe(SelfContactInput)) input: ReturnType<typeof SelfContactInput.parse>): Promise<PersonDto> {
    const em = this.em.fork();
    const person = await this.own(em, user);
    assertVersion(person, input.version);
    const { version: _version, bank, ...contact } = input;
    em.assign(person, { ...contact, ...(bank ? { bank } : {}) });
    await em.flush();
    return this.persons.toDto(person, user, { self: true });
  }
}
