import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpException,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { v7 as uuidv7 } from 'uuid';
import {
  type AuthenticatedUser,
  CurrentUser,
  DomainEvents,
  RequirePermissions,
  ZodPipe,
} from '@forga/core-api';
import {
  BulkNominationInput,
  type BulkNominationResult,
  BulkNominationUpdate,
  type BulkNominationUpdateResult,
  BW_COURSE_TEMPLATE,
  type Course as CourseDto,
  type CourseAttendance as CourseAttendanceDto,
  CourseAttendanceInput,
  courseLabel,
  CourseInput,
  type CourseNeed,
  type CourseNomination as CourseNominationDto,
  CourseNominationInput,
  type CoursePassedEvent,
  type CoursePlanning,
  type CourseResult,
  CourseResultsInput,
  type CourseResultsOutcome,
  type CourseRevokedEvent,
  type CourseRun as CourseRunDto,
  CourseRunInput,
  MASTERDATA_EVENTS,
  type NominationStatus,
  OPEN_NOMINATION_STATUSES,
  type QualificationChangedEvent,
} from '@forga/masterdata-contracts';
import { CatalogEntry, CatalogService } from '../catalog/catalog.js';
import { Department, Person, PersonQualification } from '../masterdata.entities.js';
import { activeMemberships, assertNotBeforeBirth, PersonsService, READ, WRITE, validQualifications } from '../persons/persons.service.js';
import { today } from '../shared/access.js';
import { addMonths, ageOn } from '../shared/dates.js';
import { attendanceDescription } from './course-description.js';
import { Course, CourseAttendance, CourseNomination, CourseRun } from './course.entities.js';

export const PLAN = 'masterdata.courses.plan';
export const OPEN_NOMINATION = OPEN_NOMINATION_STATUSES;
const isOpen = (status: NominationStatus) => (OPEN_NOMINATION as readonly NominationStatus[]).includes(status);
/** Set only by recording (or deleting) an attendance. */
const CLOSED_BY_ATTENDANCE: readonly NominationStatus[] = ['completed', 'failed'];

type ParsedCourse = ReturnType<typeof CourseInput.parse>;
type ParsedAttendance = ReturnType<typeof CourseAttendanceInput.parse>;
type ParsedNomination = ReturnType<typeof CourseNominationInput.parse>;
type ParsedBulkNomination = ReturnType<typeof BulkNominationInput.parse>;
type ParsedBulkUpdate = ReturnType<typeof BulkNominationUpdate.parse>;
type ParsedRun = ReturnType<typeof CourseRunInput.parse>;
type ParsedResults = ReturnType<typeof CourseResultsInput.parse>;

interface AttendanceFields {
  startsOn: string;
  endsOn: string | null;
  result: CourseResult;
  location: string;
  notes: string;
  description: string;
  run: CourseRun | null;
}

/** Events to publish after the flush. */
type Pending = () => Promise<void>;

export function toCourseDto(c: Course): CourseDto {
  return {
    id: c.id,
    key: c.key,
    name: c.name,
    level: c.level,
    grantsQualifications: c.grantsQualifications,
    prerequisites: c.prerequisites,
    requiredQualifications: c.requiredQualifications ?? [],
    minimumAge: c.minimumAge ?? null,
    allowedStatuses: c.allowedStatuses?.length ? c.allowedStatuses : ['probation', 'active'],
    targets: c.targets ?? {},
    describe: c.describe ?? false,
    active: c.active,
    sortOrder: c.sortOrder,
    version: c.version,
  };
}

function toAttendanceDto(a: CourseAttendance): CourseAttendanceDto {
  return {
    id: a.id,
    personId: a.person.id,
    course: a.course.key,
    runId: a.run?.id ?? null,
    startsOn: a.startsOn,
    endsOn: a.endsOn ?? null,
    result: a.result,
    location: a.location,
    notes: a.notes,
    description: a.description ?? '',
  };
}

function toNominationDto(n: CourseNomination): CourseNominationDto {
  return {
    id: n.id,
    personId: n.person.id,
    course: n.course.key,
    priority: n.priority,
    desiredPeriod: n.desiredPeriod,
    status: n.status,
    notes: n.notes,
    runId: n.run?.id ?? null,
    createdAt: n.createdAt.toISOString(),
    version: n.version,
  };
}

/** Code of an HTTP error for the list of skipped persons. */
const codeOf = (error: unknown) => {
  if (!(error instanceof HttpException)) throw error;
  const body = error.getResponse();
  return typeof body === 'object' && body && 'code' in body ? String(body.code) : error instanceof NotFoundException ? 'masterdata.unknownPerson' : 'generic';
};

@Controller('masterdata')
export class CoursesController {
  constructor(
    private readonly em: EntityManager,
    private readonly persons: PersonsService,
    private readonly catalogs: CatalogService,
    private readonly events: DomainEvents,
  ) {}

  // ----- Course catalog (administrator) -----

  @Get('courses')
  async courses(): Promise<CourseDto[]> {
    const courses = await this.em.fork().find(Course, {}, { orderBy: { sortOrder: 'asc', key: 'asc' } });
    return courses.map(toCourseDto);
  }

  @Post('courses')
  @RequirePermissions('masterdata.catalogs.manage')
  async createCourse(@Body(new ZodPipe(CourseInput)) input: ParsedCourse): Promise<CourseDto> {
    const em = this.em.fork();
    if (await em.count(Course, { key: input.key })) throw new ConflictException({ code: 'catalog.keyTaken', key: input.key });
    await this.validateCourse(em, input);
    const course = em.create(Course, input);
    await em.flush();
    return toCourseDto(course);
  }

  @Put('courses/:id')
  @RequirePermissions('masterdata.catalogs.manage')
  async updateCourse(@Param('id') id: string, @Body(new ZodPipe(CourseInput)) input: ParsedCourse): Promise<CourseDto> {
    const em = this.em.fork();
    const course = await em.findOne(Course, id);
    if (!course) throw new NotFoundException();
    if (course.key !== input.key) throw new BadRequestException({ code: 'catalog.keyImmutable' });
    await this.validateCourse(em, input);
    em.assign(course, input);
    await em.flush();
    return toCourseDto(course);
  }

  /** Adds the BW course catalog; the qualifications of the BW catalog template must exist. */
  @Post('courses/templates/bw')
  @RequirePermissions('masterdata.catalogs.manage')
  async applyBwTemplate(): Promise<{ added: number }> {
    const em = this.em.fork();
    const existing = new Set((await em.find(Course, {}, { fields: ['key'] })).map((c) => c.key));
    const missing = BW_COURSE_TEMPLATE.map((c) => CourseInput.parse(c)).filter((c) => !existing.has(c.key));
    await this.catalogs.requireKeys(
      'qualification',
      missing.flatMap((c) => c.grantsQualifications),
      em,
    );
    for (const course of missing) em.create(Course, course);
    await em.flush();
    return { added: missing.length };
  }

  // ----- Attendances of a person -----

  @Get('persons/:id/course-attendances')
  @RequirePermissions(READ)
  async attendances(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<CourseAttendanceDto[]> {
    const em = this.em.fork();
    await this.persons.load(em, id, user, READ);
    const list = await em.find(CourseAttendance, { person: id }, { populate: ['course', 'run'], orderBy: { startsOn: 'asc' } });
    return list.map(toAttendanceDto);
  }

  /**
   * A passed course grants its qualifications and completes open nominations for it.
   * Allowed for person editors and course coordinators (`masterdata.courses.plan`).
   */
  @Post('persons/:id/course-attendances')
  @RequirePermissions(READ)
  async addAttendance(
    @Param('id') id: string,
    @Body(new ZodPipe(CourseAttendanceInput)) input: ParsedAttendance,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CourseAttendanceDto> {
    const em = this.em.fork();
    const person = await this.loadForAttendance(em, id, user);
    const course = await this.course(em, input.course);
    const { course: _key, confirmHeld, ...fields } = input;
    const { attendance, publish } = await this.record(em, person, course, await this.grantedEntries(em, course), { ...fields, run: null }, confirmHeld);
    await em.flush();
    await publish();
    return toAttendanceDto(attendance);
  }

  /**
   * Results of a course for several persons at once (e.g. all nominations of a course run).
   * Persons the user may not record for, who passed the course already or have a result for the run, are skipped with the reason.
   */
  @Post('course-results')
  @RequirePermissions(READ)
  async recordResults(
    @Body(new ZodPipe(CourseResultsInput)) input: ParsedResults,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CourseResultsOutcome> {
    const em = this.em.fork();
    const course = await this.course(em, input.course);
    const run = input.runId ? await em.findOne(CourseRun, { id: input.runId, course }) : null;
    if (input.runId && !run) throw new BadRequestException({ code: 'masterdata.unknownCourseRun' });
    if (attendanceDescription(course, input.description) === null) throw new BadRequestException({ code: 'masterdata.descriptionRequired' });
    const dates = run
      ? { startsOn: run.startsOn, endsOn: run.endsOn ?? null, location: run.location }
      : { startsOn: input.startsOn as string, endsOn: input.endsOn, location: input.location };
    const entries = await this.grantedEntries(em, course);
    const pending: Pending[] = [];
    const skipped: CourseResultsOutcome['skipped'] = [];
    // A run's result is recorded once per person; a second one would be a duplicate (or offer a failed person again).
    const seen = new Set<string>(run ? (await em.find(CourseAttendance, { run }, { fields: ['person'] })).map((a) => a.person.id) : []);
    for (const { personId, result, notes } of input.results) {
      if (seen.has(personId)) {
        if (!skipped.some((s) => s.personId === personId) && run) skipped.push({ personId, code: 'masterdata.resultRecordedAlready' });
        continue;
      }
      seen.add(personId);
      try {
        const person = await this.loadForAttendance(em, personId, user);
        pending.push((await this.record(em, person, course, entries, { ...dates, result, notes, description: input.description, run }, input.confirmHeld)).publish);
      } catch (error) {
        skipped.push({ personId, code: codeOf(error) });
      }
    }
    await em.flush();
    for (const publish of pending) await publish();
    return { recorded: pending.length, skipped };
  }

  /**
   * Removing an attendance also removes the qualifications it granted and reopens the nomination it completed.
   * For a passed attendance, `masterdata.course.revoked` lets other modules withdraw what they based on it
   * (e.g. the course allowance of the compensation module).
   */
  @Delete('persons/:id/course-attendances/:attendanceId')
  @HttpCode(204)
  @RequirePermissions(READ)
  async removeAttendance(
    @Param('id') id: string,
    @Param('attendanceId') attendanceId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const em = this.em.fork();
    const person = await this.loadForAttendance(em, id, user);
    const attendance = await em.findOne(CourseAttendance, { id: attendanceId, person }, { populate: ['course'] });
    if (!attendance) throw new NotFoundException();
    const granted = person.qualifications.getItems().filter((q) => q.courseAttendanceId === attendanceId);
    for (const qualification of granted) person.qualifications.remove(qualification);
    // The person attended, so the nomination had a confirmed place.
    for (const nomination of await em.find(CourseNomination, { attendanceId })) {
      nomination.status = 'confirmed';
      nomination.attendanceId = null;
    }
    const passed = attendance.result === 'passed';
    const course = attendance.course.key;
    em.remove(attendance);
    await em.flush();

    if (passed) {
      await this.events.publish<CourseRevokedEvent>(MASTERDATA_EVENTS.courseRevoked, { personId: person.id, course, attendanceId });
    }
    for (const qualification of new Set(granted.map((q) => q.qualification))) {
      await this.events.publish<QualificationChangedEvent>(MASTERDATA_EVENTS.qualificationChanged, { personId: person.id, qualification });
    }
  }

  // ----- Course runs -----

  @Get('course-runs')
  @RequirePermissions(PLAN)
  async runs(@CurrentUser() user: AuthenticatedUser, @Query('course') course?: string, @Query('year') year?: string): Promise<CourseRunDto[]> {
    const em = this.em.fork();
    const where = {
      ...(course ? { course: { key: course } } : {}),
      ...(year && /^\d{4}$/.test(year) ? { startsOn: { $gte: `${year}-01-01`, $lte: `${year}-12-31` } } : {}),
    };
    const runs = await em.find(CourseRun, where, { populate: ['course'], orderBy: { startsOn: 'desc' } });
    return this.runDtos(em, user, runs);
  }

  @Post('course-runs')
  @RequirePermissions(PLAN)
  async createRun(@Body(new ZodPipe(CourseRunInput)) input: ParsedRun, @CurrentUser() user: AuthenticatedUser): Promise<CourseRunDto> {
    const em = this.em.fork();
    const { course: key, ...fields } = input;
    const run = em.create(CourseRun, { ...fields, course: await this.course(em, key) });
    await em.flush();
    return (await this.runDtos(em, user, [run]))[0];
  }

  @Put('course-runs/:id')
  @RequirePermissions(PLAN)
  async updateRun(@Param('id') id: string, @Body(new ZodPipe(CourseRunInput)) input: ParsedRun, @CurrentUser() user: AuthenticatedUser): Promise<CourseRunDto> {
    const em = this.em.fork();
    const run = await em.findOne(CourseRun, id, { populate: ['course'] });
    if (!run) throw new NotFoundException();
    if (run.course.key !== input.course) throw new BadRequestException({ code: 'masterdata.nominationTargetImmutable' });
    const { course: _key, ...fields } = input;
    // The recorded attendances carry the dates of the run (and the qualifications the date of passing): they stay fixed.
    const moved = fields.startsOn !== run.startsOn || (fields.endsOn ?? null) !== (run.endsOn ?? null);
    const recorded = moved ? await em.count(CourseAttendance, { run }) : 0;
    if (recorded) throw new ConflictException({ code: 'masterdata.courseRunHasResults', count: recorded });
    em.assign(run, fields);
    await em.flush();
    return (await this.runDtos(em, user, [run]))[0];
  }

  /** A run with recorded results stays; its nominations lose the assignment. */
  @Delete('course-runs/:id')
  @HttpCode(204)
  @RequirePermissions(PLAN)
  async removeRun(@Param('id') id: string): Promise<void> {
    const em = this.em.fork();
    const run = await em.findOne(CourseRun, id);
    if (!run) throw new NotFoundException();
    const recorded = await em.count(CourseAttendance, { run });
    if (recorded) throw new ConflictException({ code: 'masterdata.courseRunHasResults', count: recorded });
    for (const nomination of await em.find(CourseNomination, { run })) nomination.run = null;
    em.remove(run);
    await em.flush();
  }

  // ----- Nominations and planning -----

  @Get('course-nominations')
  @RequirePermissions(PLAN)
  async nominations(@CurrentUser() user: AuthenticatedUser, @Query('course') course?: string): Promise<CourseNominationDto[]> {
    const em = this.em.fork();
    const visible = this.persons.visibleWhere(user, PLAN) ?? { id: null };
    const list = await em.find(
      CourseNomination,
      { person: visible, ...(course ? { course: { key: course } } : {}) },
      { populate: ['course', 'person', 'run'], orderBy: { priority: 'asc', createdAt: 'asc' } },
    );
    return list.map(toNominationDto);
  }

  @Post('course-nominations')
  @RequirePermissions(PLAN)
  async nominate(
    @Body(new ZodPipe(CourseNominationInput)) input: ParsedNomination,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CourseNominationDto> {
    const em = this.em.fork();
    const person = await this.persons.load(em, input.personId, user, PLAN);
    const course = await this.course(em, input.course);
    if (CLOSED_BY_ATTENDANCE.includes(input.status)) throw new BadRequestException({ code: 'masterdata.nominationStatusByAttendance' });
    if (await em.count(CourseNomination, { person, course, status: { $in: [...OPEN_NOMINATION] } })) {
      throw new ConflictException({ code: 'masterdata.alreadyNominated' });
    }
    const problem = (await this.eligibility(em, course, [person]))(person);
    if (problem) throw new BadRequestException({ code: problem });
    const { personId: _p, course: _c, runId, ...fields } = input;
    const nomination = em.create(CourseNomination, { ...fields, person, course, run: await this.run(em, course, runId) });
    await em.flush();
    return toNominationDto(nomination);
  }

  /**
   * Nominates several persons in one request, optionally for a run and with a status. Persons who cannot be nominated
   * are skipped with the reason: already nominated, course held, status or conditions not met, not visible.
   */
  @Post('course-nominations/bulk')
  @RequirePermissions(PLAN)
  async nominateMany(
    @Body(new ZodPipe(BulkNominationInput)) input: ParsedBulkNomination,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<BulkNominationResult> {
    const em = this.em.fork();
    const course = await this.course(em, input.course);
    const run = await this.run(em, course, input.runId);
    const open = new Set(
      (await em.find(CourseNomination, { course, person: { $in: input.personIds }, status: { $in: [...OPEN_NOMINATION] } })).map((n) => n.person.id),
    );
    const skipped: BulkNominationResult['skipped'] = [];
    const persons: Person[] = [];
    for (const personId of new Set(input.personIds)) {
      if (open.has(personId)) {
        skipped.push({ personId, code: 'masterdata.alreadyNominated' });
        continue;
      }
      try {
        persons.push(await this.persons.load(em, personId, user, PLAN));
      } catch (error) {
        skipped.push({ personId, code: codeOf(error) });
      }
    }
    const problem = await this.eligibility(em, course, persons);
    let created = 0;
    for (const person of persons) {
      const code = problem(person);
      if (code) {
        skipped.push({ personId: person.id, code });
        continue;
      }
      em.create(CourseNomination, { person, course, run, priority: input.priority, desiredPeriod: input.desiredPeriod, status: input.status, notes: '' });
      created++;
    }
    await em.flush();
    return { created, skipped };
  }

  @Put('course-nominations/:id')
  @RequirePermissions(PLAN)
  async updateNomination(
    @Param('id') id: string,
    @Body(new ZodPipe(CourseNominationInput)) input: ParsedNomination,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CourseNominationDto> {
    const em = this.em.fork();
    const nomination = await em.findOne(CourseNomination, id, { populate: ['course', 'person', 'run'] });
    if (!nomination) throw new NotFoundException();
    await this.persons.load(em, nomination.person.id, user, PLAN);
    if (nomination.person.id !== input.personId || nomination.course.key !== input.course) {
      throw new BadRequestException({ code: 'masterdata.nominationTargetImmutable' });
    }
    await this.assertStatusChange(em, nomination, input.status);
    em.assign(nomination, {
      priority: input.priority,
      desiredPeriod: input.desiredPeriod,
      status: input.status,
      notes: input.notes,
      run: await this.run(em, nomination.course, input.runId),
    });
    await em.flush();
    return toNominationDto(nomination);
  }

  /** Sets status and/or run of several nominations at once; nominations that cannot change are skipped with the reason. */
  @Post('course-nominations/bulk-update')
  @RequirePermissions(PLAN)
  async updateNominations(
    @Body(new ZodPipe(BulkNominationUpdate)) input: ParsedBulkUpdate,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<BulkNominationUpdateResult> {
    const em = this.em.fork();
    const skipped: BulkNominationUpdateResult['skipped'] = [];
    let updated = 0;
    for (const nominationId of new Set(input.nominationIds)) {
      try {
        const nomination = await em.findOne(CourseNomination, nominationId, { populate: ['course', 'person', 'run'] });
        if (!nomination) throw new NotFoundException({ code: 'masterdata.unknownNomination' });
        await this.persons.load(em, nomination.person.id, user, PLAN);
        if (CLOSED_BY_ATTENDANCE.includes(nomination.status)) throw new BadRequestException({ code: 'masterdata.nominationStatusByAttendance' });
        if (input.status !== undefined) await this.assertStatusChange(em, nomination, input.status);
        const run = input.runId === undefined ? nomination.run : await this.run(em, nomination.course, input.runId);
        em.assign(nomination, { status: input.status ?? nomination.status, run });
        // Checked one by one, so a later nomination sees the reopened earlier ones.
        await em.flush();
        updated++;
      } catch (error) {
        em.clear();
        skipped.push({ nominationId, code: codeOf(error) });
      }
    }
    return { updated, skipped };
  }

  @Delete('course-nominations/:id')
  @HttpCode(204)
  @RequirePermissions(PLAN)
  async removeNomination(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    const em = this.em.fork();
    const nomination = await em.findOne(CourseNomination, id, { populate: ['person'] });
    if (!nomination) throw new NotFoundException();
    await this.persons.load(em, nomination.person.id, user, PLAN);
    await em.remove(nomination).flush();
  }

  /**
   * Central planning view for one course across all departments the user may plan for:
   * open nominations, candidates who meet all conditions but are neither nominated nor qualified, and the course runs.
   */
  @Get('course-planning/:course')
  @RequirePermissions(PLAN)
  async planning(@Param('course') key: string, @CurrentUser() user: AuthenticatedUser): Promise<CoursePlanning> {
    const em = this.em.fork();
    const course = await this.course(em, key);
    const dto = toCourseDto(course);
    const visible = this.persons.visibleWhere(user, PLAN) ?? { id: null };
    const persons = await em.find(
      Person,
      { $and: [visible, { status: { $ne: 'left' } }] },
      { populate: ['memberships.department', 'qualifications', 'ranks', 'honors', 'offices', 'restPeriods'], orderBy: { lastName: 'asc', firstName: 'asc' } },
    );
    const nominations = await em.find(
      CourseNomination,
      { course, status: { $in: [...OPEN_NOMINATION] }, person: { $in: persons.map((p) => p.id) } },
      { populate: ['course', 'run'], orderBy: { priority: 'asc', createdAt: 'asc' } },
    );
    const check = await this.conditions(em, course, persons);
    const problem = await this.eligibility(em, course, persons);
    const byId = new Map(persons.map((p) => [p.id, p]));
    const nominated = new Set(nominations.map((n) => n.person.id));
    const runs = await em.find(CourseRun, { course }, { populate: ['course'], orderBy: { startsOn: 'desc' }, limit: 20 });

    return {
      course: dto,
      nominations: nominations.map((n) => {
        const person = byId.get(n.person.id) as Person;
        return { nomination: toNominationDto(n), person: this.persons.summary(person), prerequisitesMet: problem(person) === null };
      }),
      candidates: persons
        .filter((p) => dto.allowedStatuses.includes(p.status) && !nominated.has(p.id) && !check.has(p) && check.meets(p))
        .map((p) => this.persons.summary(p)),
      runs: await this.runDtos(em, user, runs),
    };
  }

  /**
   * Course needs per active course and department the user may plan for: members with a status the course allows
   * (e.g. youth members for Truppmann Teil 1) who have the course, the target of the course catalog and the open
   * nominations. Departments without such members and without a target are left out (no platoon leaders in the youth brigade).
   */
  @Get('course-needs')
  @RequirePermissions(PLAN)
  async needs(@CurrentUser() user: AuthenticatedUser): Promise<CourseNeed[]> {
    const em = this.em.fork();
    const grant = user.grant(PLAN);
    const departments = await em.find(Department, grant === 'brigade' ? {} : { id: { $in: grant ?? [] } }, { orderBy: { name: 'asc' } });
    const persons = await this.persons.findVisible(user, PLAN, { status: { $ne: 'left' } });
    const courses = await em.find(Course, { active: true }, { orderBy: { sortOrder: 'asc', key: 'asc' } });
    const nominations = await em.find(CourseNomination, { status: { $in: [...OPEN_NOMINATION] }, person: { $in: persons.map((p) => p.id) } }, { populate: ['course'] });
    const passed = await this.passedBy(em, persons);
    const rows: CourseNeed[] = [];
    // A collective course like "other course" stands for many courses and is never held, so it has no needs.
    for (const course of courses.filter((c) => !c.describe)) {
      const has = (p: Person) => hasCourse(course, p, passed);
      const statuses: string[] = toCourseDto(course).allowedStatuses;
      for (const department of departments) {
        const members = persons.filter((p) => statuses.includes(p.status) && activeMemberships(p).some((m) => m.department.id === department.id));
        const target = course.targets?.[department.id] ?? null;
        if (!members.length && target === null) continue;
        rows.push({
          course: course.key,
          departmentId: department.id,
          have: members.filter(has).length,
          target,
          nominated: nominations.filter((n) => n.course.id === course.id && members.some((m) => m.id === n.person.id)).length,
        });
      }
    }
    return rows;
  }

  // ----- Helpers -----

  /**
   * Creates an attendance. It does not start in the future or before the birth. A passed one must have ended, may exist
   * only once per person and course, grants the qualifications of the course and completes the open nominations.
   * Whoever holds all its qualifications already needs `confirmHeld`; then nothing is granted twice and
   * `masterdata.course.passed` is not published (no second course allowance). A failed one closes the open nominations
   * of the run (or of earlier or no runs), so the person is not offered again for it. A collective course like
   * "other course" needs the actual course as description; "passed once" then counts per description.
   */
  private async record(em: EntityManager, person: Person, course: Course, entries: CatalogEntry[], fields: AttendanceFields, confirmHeld = false): Promise<{ attendance: CourseAttendance; publish: Pending }> {
    const passed = fields.result === 'passed';
    const passedOn = fields.endsOn ?? fields.startsOn;
    if (passed && passedOn > today()) throw new BadRequestException({ code: 'masterdata.courseNotFinished' });
    if (fields.startsOn > today()) throw new BadRequestException({ code: 'masterdata.attendanceInFuture' });
    assertNotBeforeBirth(person.birthDate, [fields.startsOn]);
    const description = attendanceDescription(course, fields.description);
    if (description === null) throw new BadRequestException({ code: 'masterdata.descriptionRequired' });
    if (passed && (await em.count(CourseAttendance, { person, course, result: 'passed', ...(course.describe ? { description } : {}) }))) {
      throw new ConflictException({ code: 'masterdata.coursePassedAlready' });
    }
    const valid = new Set(validQualifications(person, passedOn));
    const holds = (entry: CatalogEntry) => valid.has(entry.key);
    const held = entries.length > 0 && entries.every(holds);
    if (passed && held && !confirmHeld) throw new ConflictException({ code: 'masterdata.qualificationsHeld' });
    // The ID is needed before the flush to link the granted qualifications.
    const attendance = em.create(CourseAttendance, { id: uuidv7(), ...fields, description, person, course });
    const open = await em.find(CourseNomination, { person, course, status: { $in: [...OPEN_NOMINATION] } }, { populate: ['run'] });
    if (!passed) {
      const sameOrEarlier = (n: CourseNomination) => !n.run || n.run.id === fields.run?.id || n.run.startsOn <= fields.startsOn;
      for (const nomination of open.filter(sameOrEarlier)) Object.assign(nomination, { status: 'failed', attendanceId: attendance.id });
      return { attendance, publish: async () => undefined };
    }
    for (const nomination of open) Object.assign(nomination, { status: 'completed', attendanceId: attendance.id });
    // Held before: a documented attendance only, without new qualifications and without the event for the allowance.
    if (held) return { attendance, publish: async () => undefined };

    const granted = entries.filter((entry) => !holds(entry));
    for (const entry of granted) {
      const months = entry.attributes['validityMonths'] as number | null | undefined;
      person.qualifications.add(
        em.create(PersonQualification, {
          person,
          qualification: entry.key,
          acquiredOn: passedOn,
          validUntil: months ? addMonths(passedOn, months) : null,
          courseAttendanceId: attendance.id,
        }),
      );
    }
    const publish = async () => {
      await this.events.publish<CoursePassedEvent>(MASTERDATA_EVENTS.coursePassed, {
        personId: person.id,
        course: course.key,
        courseName: courseLabel(course.name.de, description),
        passedOn,
        attendanceId: attendance.id,
      });
      for (const entry of granted) {
        await this.events.publish<QualificationChangedEvent>(MASTERDATA_EVENTS.qualificationChanged, { personId: person.id, qualification: entry.key });
      }
    };
    return { attendance, publish };
  }

  /** Catalog entries of the qualifications a course grants (all must exist). */
  private async grantedEntries(em: EntityManager, course: Course): Promise<CatalogEntry[]> {
    const entries: CatalogEntry[] = [];
    for (const key of course.grantsQualifications) entries.push(await this.catalogs.requireKey('qualification', key, em));
    return entries;
  }

  /** Courses passed per person. */
  private async passedBy(em: EntityManager, persons: Person[]): Promise<Map<string, Set<string>>> {
    const passed = await em.find(CourseAttendance, { result: 'passed', person: { $in: persons.map((p) => p.id) } }, { populate: ['course'] });
    const map = new Map<string, Set<string>>();
    for (const a of passed) {
      const set = map.get(a.person.id) ?? new Set<string>();
      set.add(a.course.key);
      map.set(a.person.id, set);
    }
    return map;
  }

  /**
   * Conditions of a course: passed prerequisites (or all their qualifications held, e.g. entered by hand), valid required
   * qualifications and the minimum age at the start (unknown birth dates do not block). The status is checked separately.
   */
  private async conditions(em: EntityManager, course: Course, persons: Person[]) {
    const passed = await this.passedBy(em, persons);
    const prerequisites = await em.find(Course, { key: { $in: course.prerequisites } });
    const date = today();
    const meets = (person: Person) => {
      const held = new Set(validQualifications(person));
      const courses = passed.get(person.id) ?? new Set<string>();
      return (
        prerequisites.length === course.prerequisites.length &&
        prerequisites.every((pre) => courses.has(pre.key) || (pre.grantsQualifications.length > 0 && pre.grantsQualifications.every((q) => held.has(q)))) &&
        (course.requiredQualifications ?? []).every((q) => held.has(q)) &&
        (course.minimumAge === null || course.minimumAge === undefined || !person.birthDate || ageOn(person.birthDate, date) >= course.minimumAge)
      );
    };
    return { meets, has: (person: Person) => hasCourse(course, person, passed) };
  }

  /**
   * Why a person cannot be nominated for the course (`null` = can be): status not allowed, course held already
   * (passed or all its qualifications), conditions not met.
   */
  private async eligibility(em: EntityManager, course: Course, persons: Person[]): Promise<(person: Person) => string | null> {
    const check = await this.conditions(em, course, persons);
    const statuses: string[] = toCourseDto(course).allowedStatuses;
    return (person) => {
      if (!statuses.includes(person.status)) return 'masterdata.statusNotAllowedForCourse';
      if (check.has(person)) return 'masterdata.courseHeldAlready';
      if (!check.meets(person)) return 'masterdata.courseConditionsNotMet';
      return null;
    };
  }

  /**
   * `completed` and `failed` follow the attendances only. Reopening a nomination (e.g. after `rejected`) must not
   * give the person a second open nomination for the course.
   */
  private async assertStatusChange(em: EntityManager, nomination: CourseNomination, status: NominationStatus): Promise<void> {
    if (status === nomination.status) return;
    if (CLOSED_BY_ATTENDANCE.includes(status) || CLOSED_BY_ATTENDANCE.includes(nomination.status)) {
      throw new BadRequestException({ code: 'masterdata.nominationStatusByAttendance' });
    }
    if (isOpen(status) && !isOpen(nomination.status)) {
      const other = await em.count(CourseNomination, { id: { $ne: nomination.id }, person: nomination.person, course: nomination.course, status: { $in: [...OPEN_NOMINATION] } });
      if (other) throw new ConflictException({ code: 'masterdata.alreadyNominated' });
    }
  }

  private async runDtos(em: EntityManager, user: AuthenticatedUser, runs: CourseRun[]): Promise<CourseRunDto[]> {
    if (!runs.length) return [];
    const visible = this.persons.visibleWhere(user, PLAN) ?? { id: null };
    const ids = runs.map((r) => r.id);
    const nominations = await em.find(CourseNomination, { run: { $in: ids }, status: { $in: [...OPEN_NOMINATION] }, person: visible });
    const attendances = await em.find(CourseAttendance, { run: { $in: ids }, person: visible });
    return runs.map((r) => ({
      id: r.id,
      course: r.course.key,
      startsOn: r.startsOn,
      endsOn: r.endsOn ?? null,
      location: r.location,
      notes: r.notes,
      nominated: nominations.filter((n) => n.run?.id === r.id).length,
      recorded: attendances.filter((a) => a.run?.id === r.id).length,
      version: r.version,
    }));
  }

  /** Course attendances may be recorded by person editors and by course coordinators. */
  private async loadForAttendance(em: EntityManager, id: string, user: AuthenticatedUser): Promise<Person> {
    const person = await this.persons.load(em, id, user, READ);
    if (!this.persons.can(user, WRITE, person) && !this.persons.can(user, PLAN, person)) {
      throw new ForbiddenException({ code: 'auth.forbidden', permissions: [WRITE, PLAN] });
    }
    return person;
  }

  private async course(em: EntityManager, key: string): Promise<Course> {
    const course = await em.findOne(Course, { key });
    if (!course) throw new BadRequestException({ code: 'catalog.unknownKey', kind: 'course', key });
    return course;
  }

  private async run(em: EntityManager, course: Course, id: string | null): Promise<CourseRun | null> {
    if (!id) return null;
    const run = await em.findOne(CourseRun, { id, course });
    if (!run) throw new BadRequestException({ code: 'masterdata.unknownCourseRun' });
    return run;
  }

  private async validateCourse(em: EntityManager, input: ParsedCourse): Promise<void> {
    await this.catalogs.requireKeys('qualification', [...input.grantsQualifications, ...input.requiredQualifications], em);
    if (input.prerequisites.includes(input.key)) throw new BadRequestException({ code: 'masterdata.courseOwnPrerequisite' });
    const found = await em.count(Course, { key: { $in: input.prerequisites } });
    if (found !== new Set(input.prerequisites).size) {
      throw new BadRequestException({ code: 'catalog.unknownKey', kind: 'course', keys: input.prerequisites });
    }
    const departments = Object.keys(input.targets);
    if (departments.length && (await em.count(Department, { id: { $in: departments } })) !== departments.length) {
      throw new BadRequestException({ code: 'masterdata.unknownDepartment' });
    }
  }
}

/**
 * Passed the course, or holds all its qualifications (e.g. entered by hand or imported). A collective course like
 * "other course" stands for many courses and is never held.
 */
function hasCourse(course: Course, person: Person, passed: Map<string, Set<string>>): boolean {
  if (course.describe) return false;
  const held = new Set(validQualifications(person));
  return (passed.get(person.id)?.has(course.key) ?? false) || (course.grantsQualifications.length > 0 && course.grantsQualifications.every((q) => held.has(q)));
}
