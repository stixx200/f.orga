import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { EntityManager } from '@mikro-orm/core';
import { assertVersion, type AuthenticatedUser, berlinDate, brigadeLogoDataUrl, type Certificate, CurrentUser, DomainEvents, renderCertificatesPdf, RequirePermissions, SettingsService, ZodPipe } from '@forga/core-api';
import type { BrigadeSettings } from '@forga/core-contracts';
import {
  Admission,
  CertificateSettings,
  CreatePersonInput,
  HonorAwardInput,
  Leave,
  MASTERDATA_EVENTS,
  MembershipInput,
  type MembershipSettings,
  OfficeAssignmentInput,
  RestPeriodInput,
  type Person as PersonDto,
  PersonInput,
  PersonQualificationInput,
  type PersonLeftEvent,
  type PersonSummary,
  ProbationChange,
  probationEnd,
  type QualificationChangedEvent,
  RankAssignmentInput,
  StatusChange,
  TransferToOperational,
  TransferToVeterans,
} from '@forga/masterdata-contracts';
import { z } from 'zod';
import { CatalogEntry, CatalogService } from '../catalog/catalog.js';
import { Department, HonorAward, Membership, OfficeAssignment, Person, PersonQualification, RankAssignment, RestPeriod } from '../masterdata.entities.js';
import { requireDepartment, today } from '../shared/access.js';
import { addDays, addMonths, ageOn } from '../shared/dates.js';
import { PersonHoldingsRegistry } from './holdings.js';
import { activeMemberships, PersonsService, READ, SENSITIVE, WRITE } from './persons.service.js';

type ParsedPerson = ReturnType<typeof PersonInput.parse>;
type ParsedCreate = ReturnType<typeof CreatePersonInput.parse>;
type ParsedMembership = ReturnType<typeof MembershipInput.parse>;

const Memberships = z.array(MembershipInput);
const IsoDate = z.iso.date();
const germanDate = (value: string) => value.split('-').toReversed().join('.');

@Controller('masterdata/persons')
@RequirePermissions(READ)
export class PersonsController {
  constructor(
    private readonly em: EntityManager,
    private readonly persons: PersonsService,
    private readonly catalogs: CatalogService,
    private readonly settings: SettingsService,
    private readonly events: DomainEvents,
    private readonly holdings: PersonHoldingsRegistry,
  ) {}

  /** With `masterdata.persons.read` the summaries, with only `masterdata.persons.directory` restricted entries. */
  @Get()
  @RequirePermissions()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') query?: string,
    @Query('departmentId') departmentId?: string,
    @Query('status') status?: string,
    @Query('qualification') qualification?: string,
    @Query('includeLeft') includeLeft?: string,
  ): Promise<PersonSummary[]> {
    return this.persons.list(user, { query, departmentId, status, qualification, includeLeft: includeLeft === 'true' });
  }

  @Get(':id')
  async get(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<PersonDto> {
    const person = await this.persons.load(this.em.fork(), id, user, READ);
    return this.persons.toDto(person, user);
  }

  /** New persons start in probation unless another status is given; the probation end follows the settings. */
  @Post()
  @RequirePermissions(WRITE)
  async create(
    @Body(new ZodPipe(CreatePersonInput)) input: ParsedCreate,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PersonDto> {
    for (const m of input.memberships) requireDepartment(user, WRITE, m.departmentId);
    const em = this.em.fork();
    await this.assertPersonnelNumberFree(em, input.personnelNumber, null);

    const { memberships, status, ...fields } = input;
    const start = input.joinedOn ?? memberships.map((m) => m.from).toSorted()[0];
    const rules = await this.membershipRules();
    const person = em.create(Person, {
      ...this.masterFields(fields, user, null),
      status,
      joinedOn: input.joinedOn ?? start,
      probationEndsOn: status === 'probation' ? probationEnd(start, rules.probationMonths) : null,
    });
    await this.replaceMemberships(em, person, memberships);
    await em.flush();
    return this.persons.toDto(person, user);
  }

  @Put(':id')
  @RequirePermissions(WRITE)
  async update(
    @Param('id') id: string,
    @Body(new ZodPipe(PersonInput)) input: ParsedPerson,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PersonDto> {
    const em = this.em.fork();
    const person = await this.persons.load(em, id, user, WRITE);
    assertVersion(person, input.version);
    await this.assertPersonnelNumberFree(em, input.personnelNumber, person.id);
    em.assign(person, this.masterFields(input, user, person));
    await em.flush();
    return this.persons.toDto(person, user);
  }

  /**
   * Replaces the memberships in the departments the user may edit. Memberships in other departments
   * (also past or future ones) are kept as they are; sending them changed is forbidden.
   */
  @Put(':id/memberships')
  @RequirePermissions(WRITE)
  async setMemberships(
    @Param('id') id: string,
    @Body(new ZodPipe(Memberships)) memberships: ParsedMembership[],
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PersonDto> {
    const em = this.em.fork();
    const person = await this.persons.load(em, id, user, WRITE);
    const foreign = person.memberships.getItems().filter((m) => !user.can(WRITE, m.department.id));
    const same = (a: ParsedMembership, b: Membership) => a.departmentId === b.department.id && a.from === b.from && (a.to ?? null) === (b.to ?? null) && a.primary === b.primary;
    for (const m of memberships) {
      if (!user.can(WRITE, m.departmentId) && !foreign.some((f) => same(m, f))) requireDepartment(user, WRITE, m.departmentId);
    }
    const kept = foreign.map((f) => ({ departmentId: f.department.id, from: f.from, to: f.to ?? null, primary: f.primary }));
    await this.replaceMemberships(em, person, [...memberships.filter((m) => user.can(WRITE, m.departmentId)), ...kept]);
    await em.flush();
    return this.persons.toDto(person, user);
  }

  @Post(':id/qualifications')
  @RequirePermissions(WRITE)
  async addQualification(
    @Param('id') id: string,
    @Body(new ZodPipe(PersonQualificationInput)) input: ReturnType<typeof PersonQualificationInput.parse>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PersonDto> {
    const em = this.em.fork();
    const person = await this.persons.load(em, id, user, WRITE);
    const entry = await this.catalogs.requireKey('qualification', input.qualification, em);
    const months = entry.attributes['validityMonths'] as number | null | undefined;
    person.qualifications.add(
      em.create(PersonQualification, {
        person,
        qualification: input.qualification,
        acquiredOn: input.acquiredOn,
        validUntil: input.validUntil ?? (months ? addMonths(input.acquiredOn, months) : null),
        notes: input.notes,
      }),
    );
    await em.flush();
    await this.events.publish<QualificationChangedEvent>(MASTERDATA_EVENTS.qualificationChanged, {
      personId: person.id,
      qualification: input.qualification,
    });
    return this.persons.toDto(person, user);
  }

  @Delete(':id/qualifications/:entryId')
  @RequirePermissions(WRITE)
  async removeQualification(
    @Param('id') id: string,
    @Param('entryId') entryId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PersonDto> {
    const em = this.em.fork();
    const person = await this.persons.load(em, id, user, WRITE);
    const entry = person.qualifications.getItems().find((q) => q.id === entryId);
    if (!entry) throw new NotFoundException();
    person.qualifications.remove(entry);
    await em.flush();
    await this.events.publish<QualificationChangedEvent>(MASTERDATA_EVENTS.qualificationChanged, {
      personId: person.id,
      qualification: entry.qualification,
    });
    return this.persons.toDto(person, user);
  }

  @Post(':id/ranks')
  @RequirePermissions(WRITE)
  async addRank(
    @Param('id') id: string,
    @Body(new ZodPipe(RankAssignmentInput)) input: ReturnType<typeof RankAssignmentInput.parse>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PersonDto> {
    const em = this.em.fork();
    const person = await this.persons.load(em, id, user, WRITE);
    await this.catalogs.requireKey('rank', input.rank, em);
    person.ranks.add(em.create(RankAssignment, { person, ...input }));
    await em.flush();
    return this.persons.toDto(person, user);
  }

  @Delete(':id/ranks/:entryId')
  @RequirePermissions(WRITE)
  removeRank(@Param('id') id: string, @Param('entryId') entryId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.removeChild(id, user, (p) => p.ranks, entryId);
  }

  @Post(':id/offices')
  @RequirePermissions(WRITE)
  async addOffice(
    @Param('id') id: string,
    @Body(new ZodPipe(OfficeAssignmentInput)) input: z.infer<typeof OfficeAssignmentInput>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PersonDto> {
    const em = this.em.fork();
    const person = await this.persons.load(em, id, user, WRITE);
    await this.catalogs.requireKey('office', input.office, em);
    if (input.departmentId && !(await em.count(Department, input.departmentId))) throw new BadRequestException({ code: 'masterdata.unknownDepartment' });
    person.offices.add(em.create(OfficeAssignment, { person, ...input }));
    await em.flush();
    return this.persons.toDto(person, user);
  }

  /** Ends an office (sets "until") or corrects it. */
  @Put(':id/offices/:entryId')
  @RequirePermissions(WRITE)
  async updateOffice(
    @Param('id') id: string,
    @Param('entryId') entryId: string,
    @Body(new ZodPipe(OfficeAssignmentInput)) input: z.infer<typeof OfficeAssignmentInput>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PersonDto> {
    const em = this.em.fork();
    const person = await this.persons.load(em, id, user, WRITE);
    const entry = person.offices.getItems().find((o) => o.id === entryId);
    if (!entry) throw new NotFoundException();
    await this.catalogs.requireKey('office', input.office, em);
    em.assign(entry, input);
    await em.flush();
    return this.persons.toDto(person, user);
  }

  @Post(':id/rest-periods')
  @RequirePermissions(WRITE)
  async addRestPeriod(
    @Param('id') id: string,
    @Body(new ZodPipe(RestPeriodInput)) input: z.infer<typeof RestPeriodInput>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PersonDto> {
    const em = this.em.fork();
    const person = await this.persons.load(em, id, user, WRITE);
    person.restPeriods.add(em.create(RestPeriod, { person, ...input }));
    await em.flush();
    return this.persons.toDto(person, user);
  }

  @Put(':id/rest-periods/:entryId')
  @RequirePermissions(WRITE)
  async updateRestPeriod(
    @Param('id') id: string,
    @Param('entryId') entryId: string,
    @Body(new ZodPipe(RestPeriodInput)) input: z.infer<typeof RestPeriodInput>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PersonDto> {
    const em = this.em.fork();
    const person = await this.persons.load(em, id, user, WRITE);
    const entry = person.restPeriods.getItems().find((r) => r.id === entryId);
    if (!entry) throw new NotFoundException();
    em.assign(entry, input);
    await em.flush();
    return this.persons.toDto(person, user);
  }

  @Delete(':id/rest-periods/:entryId')
  @RequirePermissions(WRITE)
  removeRestPeriod(@Param('id') id: string, @Param('entryId') entryId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.removeChild(id, user, (p) => p.restPeriods, entryId);
  }

  @Delete(':id/offices/:entryId')
  @RequirePermissions(WRITE)
  removeOffice(@Param('id') id: string, @Param('entryId') entryId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.removeChild(id, user, (p) => p.offices, entryId);
  }

  /**
   * Honor certificates as serial PDF: the awards in the period (optionally of one honor), or the given award IDs.
   * Only persons the user may read.
   */
  @Get('honors/certificates.pdf')
  @RequirePermissions(READ)
  async honorCertificates(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('honor') honor?: string,
    @Query('ids') ids?: string,
  ): Promise<void> {
    const year = berlinDate().slice(0, 4);
    const period = { from: from ? IsoDate.parse(from) : `${year}-01-01`, to: to ? IsoDate.parse(to) : `${year}-12-31` };
    const wanted = ids ? new Set(ids.split(',')) : null;
    const persons = await this.persons.findVisible(user, READ, { honors: { $some: {} } });
    const awards = persons
      .flatMap((person) => person.honors.getItems().map((award) => ({ person, award })))
      .filter(({ award }) => (wanted ? wanted.has(award.id) : award.awardedOn >= period.from && award.awardedOn <= period.to && (!honor || award.honor === honor)))
      .toSorted((a, b) => a.award.awardedOn.localeCompare(b.award.awardedOn) || a.person.lastName.localeCompare(b.person.lastName, 'de'));
    if (!awards.length) throw new NotFoundException({ code: 'masterdata.noHonors' });
    const em = this.em.fork();
    const [config, brigade, catalog] = await Promise.all([
      this.settings.get('masterdata.certificates').then((v) => CertificateSettings.parse(v ?? {})),
      this.settings.get<BrigadeSettings>('brigade'),
      em.find(CatalogEntry, { kind: 'honor' }),
    ]);
    const certificates: Certificate[] = awards.map(({ person, award }) => {
      const name = `${person.firstName} ${person.lastName}`;
      const honorName = catalog.find((c) => c.key === award.honor)?.name.de ?? award.honor;
      return {
        heading: 'Urkunde',
        name,
        text: config.honorText.replaceAll('{honor}', honorName).replaceAll('{name}', name).replaceAll('{date}', germanDate(award.awardedOn)),
        placeAndDate: [config.place || brigade?.city, `den ${germanDate(award.awardedOn)}`].filter(Boolean).join(', '),
        signer: config.signer,
      };
    });
    const pdf = await renderCertificatesPdf({ brigade, logo: await brigadeLogoDataUrl(em), title: 'Urkunden Ehrungen', certificates });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="Urkunden.pdf"');
    res.send(pdf);
  }

  @Post(':id/honors')
  @RequirePermissions(WRITE)
  async addHonor(
    @Param('id') id: string,
    @Body(new ZodPipe(HonorAwardInput)) input: ReturnType<typeof HonorAwardInput.parse>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PersonDto> {
    const em = this.em.fork();
    const person = await this.persons.load(em, id, user, WRITE);
    await this.catalogs.requireKey('honor', input.honor, em);
    person.honors.add(em.create(HonorAward, { person, ...input }));
    await em.flush();
    return this.persons.toDto(person, user);
  }

  @Delete(':id/honors/:entryId')
  @RequirePermissions(WRITE)
  removeHonor(@Param('id') id: string, @Param('entryId') entryId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.removeChild(id, user, (p) => p.honors, entryId);
  }

  /** Shortens or extends the probation. The reason ends up in the history via the notes. */
  @Put(':id/probation')
  @RequirePermissions(WRITE)
  async changeProbation(
    @Param('id') id: string,
    @Body(new ZodPipe(ProbationChange)) input: ReturnType<typeof ProbationChange.parse>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PersonDto> {
    const em = this.em.fork();
    const person = await this.persons.load(em, id, user, WRITE);
    if (person.status !== 'probation') throw new BadRequestException({ code: 'masterdata.notInProbation' });
    person.probationEndsOn = input.probationEndsOn;
    person.probationDecidedOn = input.decidedOn;
    person.notes = appendNote(person.notes, `Probezeit / probation → ${input.probationEndsOn}: ${input.reason}`);
    await em.flush();
    return this.persons.toDto(person, user);
  }

  /** Final admission after the probation (decision of the body named in the settings). */
  @Post(':id/admission')
  @RequirePermissions(WRITE)
  async admit(
    @Param('id') id: string,
    @Body(new ZodPipe(Admission)) input: Admission,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PersonDto> {
    const em = this.em.fork();
    const person = await this.persons.load(em, id, user, WRITE);
    if (person.status !== 'probation') throw new BadRequestException({ code: 'masterdata.notInProbation' });
    person.status = 'active';
    person.admittedOn = input.decidedOn;
    person.probationDecidedOn = input.decidedOn;
    await em.flush();
    return this.persons.toDto(person, user);
  }

  @Post(':id/status')
  @RequirePermissions(WRITE)
  async changeStatus(
    @Param('id') id: string,
    @Body(new ZodPipe(StatusChange)) input: StatusChange,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PersonDto> {
    const em = this.em.fork();
    const person = await this.persons.load(em, id, user, WRITE);
    if (person.status === 'left' || person.status === 'probation') {
      throw new BadRequestException({ code: 'masterdata.statusChangeNotAllowed', from: person.status });
    }
    // Leaving the youth brigade and joining the veterans change memberships and probation: only via the transfers.
    if (person.status === 'youth' && input.status !== 'youth') throw new BadRequestException({ code: 'masterdata.useTransfer', transfer: 'operational' });
    if (input.status === 'veterans' && person.status !== 'veterans') throw new BadRequestException({ code: 'masterdata.useTransfer', transfer: 'veterans' });
    // The history records the change; the effective date is the day of the request.
    person.status = input.status;
    await em.flush();
    return this.persons.toDto(person, user);
  }

  /**
   * Transfer from the youth brigade into an operational department ("Übernahme in eine Einsatzabteilung", fire brigade statute).
   * The youth membership ends the day before, the new one is the primary membership; the probation (fire brigade statute)
   * runs until `probationEndsOn` or is waived (`null`), shortening and waiving need a reason.
   */
  @Post(':id/transfer-to-operational')
  @RequirePermissions(WRITE)
  async transferToOperational(
    @Param('id') id: string,
    @Body(new ZodPipe(TransferToOperational)) input: ReturnType<typeof TransferToOperational.parse>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PersonDto> {
    const em = this.em.fork();
    const person = await this.persons.load(em, id, user, WRITE);
    if (person.status !== 'youth') throw new BadRequestException({ code: 'masterdata.transferNotAllowed', from: person.status });
    const rules = await this.membershipRules();
    if (person.birthDate && ageOn(person.birthDate, input.on) < rules.minimumAgeOperational) {
      throw new BadRequestException({ code: 'masterdata.belowMinimumAge', age: rules.minimumAgeOperational });
    }
    const regular = probationEnd(input.on, rules.probationMonths);
    if ((input.probationEndsOn === null || input.probationEndsOn < regular) && !input.reason) {
      throw new BadRequestException({ code: 'masterdata.probationReasonRequired' });
    }
    await this.transferMembership(em, user, person, input.departmentId, input.on, 'operational', ['youth']);
    if (input.probationEndsOn) {
      Object.assign(person, { status: 'probation', probationEndsOn: input.probationEndsOn, probationDecidedOn: input.decidedOn, admittedOn: null });
    } else {
      Object.assign(person, { status: 'active', probationEndsOn: null, probationDecidedOn: input.decidedOn, admittedOn: input.decidedOn ?? input.on });
    }
    if (input.reason) person.notes = appendNote(person.notes, `Übernahme in Einsatzabteilung ${input.on}, Probezeit / probation ${input.probationEndsOn ?? '–'}: ${input.reason}`);
    await em.flush();
    return this.persons.toDto(person, user);
  }

  /** Transfer to the veterans ("Übernahme in die Altersabteilung", fire brigade statute): operational and command memberships end, the rank stays. */
  @Post(':id/transfer-to-veterans')
  @RequirePermissions(WRITE)
  async transferToVeterans(
    @Param('id') id: string,
    @Body(new ZodPipe(TransferToVeterans)) input: ReturnType<typeof TransferToVeterans.parse>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PersonDto> {
    const em = this.em.fork();
    const person = await this.persons.load(em, id, user, WRITE);
    if (person.status !== 'active' && person.status !== 'passive') throw new BadRequestException({ code: 'masterdata.transferNotAllowed', from: person.status });
    await this.holdings.assertNothingHeld(person.id);
    await this.transferMembership(em, user, person, input.departmentId, input.on, 'veterans', ['operational', 'command']);
    person.status = 'veterans';
    if (input.decidedOn) person.notes = appendNote(person.notes, `Übernahme in Altersabteilung ${input.on}, beschlossen / decided ${input.decidedOn}`);
    await em.flush();
    return this.persons.toDto(person, user);
  }

  /**
   * Ends the open memberships of the given department types the day before `on` and starts the new primary membership.
   * An ended membership stays the primary one until the day before, so every date keeps exactly one primary membership
   * (also while `on` lies ahead). As in `setMemberships`, changing a membership in a department the user may not edit is forbidden.
   */
  private async transferMembership(em: EntityManager, user: AuthenticatedUser, person: Person, departmentId: string, on: string, type: Department['type'], ending: Department['type'][]): Promise<void> {
    requireDepartment(user, WRITE, departmentId);
    const target = await em.findOne(Department, departmentId);
    if (!target) throw new BadRequestException({ code: 'masterdata.unknownDepartment' });
    if (target.type !== type) throw new BadRequestException({ code: 'masterdata.wrongDepartmentType', expected: type });
    const before = addDays(on, -1);
    let existing: Membership | undefined;
    for (const m of person.memberships.getItems()) {
      if (m.to && m.to < on) continue;
      if (m.department.id === departmentId) {
        existing = m;
        continue;
      }
      const ends = ending.includes(m.department.type);
      // A transfer date on or before the start of the membership it ends is a typo, not a one-day membership.
      if (ends && m.from >= on) throw new BadRequestException({ code: 'masterdata.transferBeforeMembership', from: m.from });
      if (!ends && !m.primary) continue;
      requireDepartment(user, WRITE, m.department.id);
      if (ends) m.to = before;
      m.primary = m.primary && ends;
    }
    if (existing && (existing.primary || existing.from >= on)) {
      Object.assign(existing, { primary: true, to: null });
      return;
    }
    // An additional membership in the target department stays one until the day before.
    if (existing) existing.to = before;
    person.memberships.add(em.create(Membership, { person, department: target, from: on, to: null, primary: true }));
  }

  /** Leaving ends all open memberships. Other modules learn about it via `masterdata.person.left`. */
  @Post(':id/leave')
  @RequirePermissions(WRITE)
  async leave(
    @Param('id') id: string,
    @Body(new ZodPipe(Leave)) input: Leave,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PersonDto> {
    const em = this.em.fork();
    const person = await this.persons.load(em, id, user, WRITE);
    if (person.status === 'left') throw new BadRequestException({ code: 'masterdata.alreadyLeft' });
    await this.holdings.assertNothingHeld(person.id);
    await this.catalogs.requireKey('exit-reason', input.exitReason, em);
    person.status = 'left';
    person.leftOn = input.leftOn;
    person.exitReason = input.exitReason;
    for (const membership of person.memberships.getItems()) {
      if (!membership.to || membership.to > input.leftOn) membership.to = input.leftOn;
    }
    await em.flush();
    await this.events.publish<PersonLeftEvent>(MASTERDATA_EVENTS.personLeft, {
      personId: person.id,
      leftOn: input.leftOn,
      exitReason: input.exitReason,
    });
    return this.persons.toDto(person, user);
  }

  private async removeChild(
    id: string,
    user: AuthenticatedUser,
    collection: (person: Person) => { getItems(): { id: string }[]; remove(item: never): void },
    entryId: string,
  ): Promise<PersonDto> {
    const em = this.em.fork();
    const person = await this.persons.load(em, id, user, WRITE);
    const items = collection(person);
    const entry = items.getItems().find((item) => item.id === entryId);
    if (!entry) throw new NotFoundException();
    items.remove(entry as never);
    await em.flush();
    return this.persons.toDto(person, user);
  }

  /** Master fields; sensitive ones are only applied with `masterdata.persons.sensitive`. */
  private masterFields(input: ParsedPerson, user: AuthenticatedUser, existing: Person | null) {
    const { birthDate, birthPlace, employer, bank, version: _version, ...rest } = input;
    const sensitive = existing
      ? this.persons.can(user, SENSITIVE, existing)
      : user.grant(SENSITIVE) !== null;
    if (!sensitive) return rest;
    return {
      ...rest,
      ...(birthDate !== undefined ? { birthDate } : {}),
      ...(birthPlace !== undefined ? { birthPlace } : {}),
      ...(employer !== undefined ? { employer } : {}),
      ...(bank !== undefined ? { bank } : {}),
    };
  }

  private async replaceMemberships(em: EntityManager, person: Person, memberships: ParsedMembership[]): Promise<void> {
    for (const m of memberships) {
      if (m.to && m.to < m.from) throw new BadRequestException({ code: 'masterdata.membershipPeriodInvalid' });
    }
    const departments = await em.find(Department, { id: { $in: memberships.map((m) => m.departmentId) } });
    if (departments.length !== new Set(memberships.map((m) => m.departmentId)).size) {
      throw new BadRequestException({ code: 'masterdata.unknownDepartment' });
    }
    person.memberships.removeAll();
    for (const m of memberships) {
      person.memberships.add(
        em.create(Membership, { person, department: em.getReference(Department, m.departmentId), from: m.from, to: m.to, primary: m.primary }),
      );
    }
    const current = activeMemberships(person, today());
    if (current.length && current.filter((m) => m.primary).length !== 1) {
      throw new BadRequestException({ code: 'masterdata.primaryMembershipRequired' });
    }
  }

  private async assertPersonnelNumberFree(em: EntityManager, number: string | null, ownId: string | null) {
    if (!number) return;
    const other = await em.findOne(Person, { personnelNumber: number });
    if (other && other.id !== ownId) throw new ConflictException({ code: 'masterdata.personnelNumberTaken' });
  }

  private async membershipRules(): Promise<MembershipSettings> {
    return (await this.settings.get<MembershipSettings>('masterdata.membership')) as MembershipSettings;
  }
}

function appendNote(notes: string, line: string): string {
  return notes ? `${notes}\n${line}` : line;
}
