import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
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
  BW_COURSE_TEMPLATE,
  type Course as CourseDto,
  type CourseAttendance as CourseAttendanceDto,
  CourseAttendanceInput,
  CourseInput,
  type CourseNomination as CourseNominationDto,
  CourseNominationInput,
  type CoursePassedEvent,
  type CoursePlanning,
  MASTERDATA_EVENTS,
  type QualificationChangedEvent,
} from '@forga/masterdata-contracts';
import { CatalogService } from '../catalog/catalog.js';
import { Person, PersonQualification } from '../masterdata.entities.js';
import { PersonsService, READ, WRITE, validQualifications } from '../persons/persons.service.js';
import { addMonths } from '../shared/dates.js';
import { Course, CourseAttendance, CourseNomination } from './course.entities.js';

const PLAN = 'masterdata.courses.plan';
const OPEN_NOMINATION = ['nominated', 'registered', 'confirmed'] as const;

type ParsedCourse = ReturnType<typeof CourseInput.parse>;
type ParsedAttendance = ReturnType<typeof CourseAttendanceInput.parse>;
type ParsedNomination = ReturnType<typeof CourseNominationInput.parse>;

function toCourseDto(c: Course): CourseDto {
  return {
    id: c.id,
    key: c.key,
    name: c.name,
    level: c.level,
    grantsQualifications: c.grantsQualifications,
    prerequisites: c.prerequisites,
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
    startsOn: a.startsOn,
    endsOn: a.endsOn ?? null,
    result: a.result,
    location: a.location,
    notes: a.notes,
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
    createdAt: n.createdAt.toISOString(),
    version: n.version,
  };
}

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
    const list = await em.find(CourseAttendance, { person: id }, { populate: ['course'], orderBy: { startsOn: 'asc' } });
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
    const { course: _key, ...fields } = input;
    // The ID is needed before the flush to link the granted qualifications.
    const attendance = em.create(CourseAttendance, { id: uuidv7(), ...fields, person, course });

    if (input.result === 'passed') {
      const acquiredOn = input.endsOn ?? input.startsOn;
      for (const qualification of course.grantsQualifications) {
        const entry = await this.catalogs.requireKey('qualification', qualification, em);
        const months = entry.attributes['validityMonths'] as number | null | undefined;
        person.qualifications.add(
          em.create(PersonQualification, {
            person,
            qualification,
            acquiredOn,
            validUntil: months ? addMonths(acquiredOn, months) : null,
            courseAttendanceId: attendance.id,
          }),
        );
      }
      const nominations = await em.find(CourseNomination, {
        person,
        course,
        status: { $in: [...OPEN_NOMINATION] },
      });
      for (const nomination of nominations) nomination.status = 'completed';
    }
    await em.flush();

    if (input.result === 'passed') {
      await this.events.publish<CoursePassedEvent>(MASTERDATA_EVENTS.coursePassed, {
        personId: person.id,
        course: course.key,
        courseName: course.name.de,
        passedOn: input.endsOn ?? input.startsOn,
        attendanceId: attendance.id,
      });
      for (const qualification of course.grantsQualifications) {
        await this.events.publish<QualificationChangedEvent>(MASTERDATA_EVENTS.qualificationChanged, {
          personId: person.id,
          qualification,
        });
      }
    }
    return toAttendanceDto(attendance);
  }

  /** Removing an attendance also removes the qualifications it granted. */
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
    const attendance = await em.findOne(CourseAttendance, { id: attendanceId, person });
    if (!attendance) throw new NotFoundException();
    const granted = person.qualifications.getItems().filter((q) => q.courseAttendanceId === attendanceId);
    for (const qualification of granted) person.qualifications.remove(qualification);
    em.remove(attendance);
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
      { populate: ['course', 'person'], orderBy: { priority: 'asc', createdAt: 'asc' } },
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
    if (await em.count(CourseNomination, { person, course, status: { $in: [...OPEN_NOMINATION] } })) {
      throw new ConflictException({ code: 'masterdata.alreadyNominated' });
    }
    const { personId: _p, course: _c, ...fields } = input;
    const nomination = em.create(CourseNomination, { ...fields, person, course });
    await em.flush();
    return toNominationDto(nomination);
  }

  @Put('course-nominations/:id')
  @RequirePermissions(PLAN)
  async updateNomination(
    @Param('id') id: string,
    @Body(new ZodPipe(CourseNominationInput)) input: ParsedNomination,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CourseNominationDto> {
    const em = this.em.fork();
    const nomination = await em.findOne(CourseNomination, id, { populate: ['course', 'person'] });
    if (!nomination) throw new NotFoundException();
    await this.persons.load(em, nomination.person.id, user, PLAN);
    if (nomination.person.id !== input.personId || nomination.course.key !== input.course) {
      throw new BadRequestException({ code: 'masterdata.nominationTargetImmutable' });
    }
    em.assign(nomination, {
      priority: input.priority,
      desiredPeriod: input.desiredPeriod,
      status: input.status,
      notes: input.notes,
    });
    await em.flush();
    return toNominationDto(nomination);
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
   * open nominations, and candidates who meet the prerequisites but are neither nominated nor qualified.
   */
  @Get('course-planning/:course')
  @RequirePermissions(PLAN)
  async planning(@Param('course') key: string, @CurrentUser() user: AuthenticatedUser): Promise<CoursePlanning> {
    const em = this.em.fork();
    const course = await this.course(em, key);
    const visible = this.persons.visibleWhere(user, PLAN) ?? { id: null };
    const persons = await em.find(
      Person,
      { $and: [visible, { status: { $in: ['probation', 'active'] } }] },
      { populate: ['memberships.department', 'qualifications', 'ranks', 'honors', 'offices', 'restPeriods'], orderBy: { lastName: 'asc' } },
    );
    const nominations = await em.find(
      CourseNomination,
      { course, status: { $in: [...OPEN_NOMINATION] }, person: { $in: persons.map((p) => p.id) } },
      { populate: ['course'], orderBy: { priority: 'asc', createdAt: 'asc' } },
    );
    const passed = await em.find(CourseAttendance, { result: 'passed', person: { $in: persons.map((p) => p.id) } }, { populate: ['course'] });
    const prerequisites = await em.find(Course, { key: { $in: course.prerequisites } });

    const passedBy = new Map<string, Set<string>>();
    for (const a of passed) {
      const set = passedBy.get(a.person.id) ?? new Set<string>();
      set.add(a.course.key);
      passedBy.set(a.person.id, set);
    }
    // A prerequisite counts as met if the course was passed or all its qualifications are held (e.g. entered by hand).
    const meets = (person: Person) => {
      const held = new Set(validQualifications(person));
      const courses = passedBy.get(person.id) ?? new Set<string>();
      return prerequisites.every(
        (pre) => courses.has(pre.key) || (pre.grantsQualifications.length > 0 && pre.grantsQualifications.every((q) => held.has(q))),
      ) && prerequisites.length === course.prerequisites.length;
    };
    const hasCourse = (person: Person) => {
      const qualifications = new Set(validQualifications(person));
      return (
        (passedBy.get(person.id)?.has(course.key) ?? false) ||
        (course.grantsQualifications.length > 0 && course.grantsQualifications.every((q) => qualifications.has(q)))
      );
    };
    const byId = new Map(persons.map((p) => [p.id, p]));
    const nominated = new Set(nominations.map((n) => n.person.id));

    return {
      course: toCourseDto(course),
      nominations: nominations.map((n) => {
        const person = byId.get(n.person.id) as Person;
        return { nomination: toNominationDto(n), person: this.persons.summary(person), prerequisitesMet: meets(person) };
      }),
      candidates: persons
        .filter((p) => !nominated.has(p.id) && !hasCourse(p) && meets(p))
        .map((p) => this.persons.summary(p)),
    };
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

  private async validateCourse(em: EntityManager, input: ParsedCourse): Promise<void> {
    await this.catalogs.requireKeys('qualification', input.grantsQualifications, em);
    if (input.prerequisites.includes(input.key)) throw new BadRequestException({ code: 'masterdata.courseOwnPrerequisite' });
    const found = await em.count(Course, { key: { $in: input.prerequisites } });
    if (found !== new Set(input.prerequisites).size) {
      throw new BadRequestException({ code: 'catalog.unknownKey', kind: 'course', keys: input.prerequisites });
    }
  }
}
