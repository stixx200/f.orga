import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { wordsWhere } from '@forga/core-api';
import type {
  CatalogEntry as CatalogEntryDto,
  CatalogKind,
  Department as DepartmentDto,
  Organization,
  PaymentDetails,
  PersonCareer,
  PersonDirectory,
  PersonSnapshot,
  PersonSummary,
  Station as StationDto,
  Vehicle as VehicleDto,
  MemberPeriods,
  OfficeHolding,
} from '@forga/masterdata-contracts';
import { CatalogEntry, toCatalogDto } from '../catalog/catalog.js';
import { toDepartmentDto, toStationDto, toVehicleDto } from '../organization/organization.controller.js';
import { Department, OfficeAssignment, Person, RankAssignment, Station, Vehicle } from '../masterdata.entities.js';
import { PersonsService } from '../persons/persons.service.js';
import { today } from '../shared/access.js';

const POPULATE = ['memberships.department', 'qualifications', 'ranks', 'honors', 'offices', 'restPeriods'] as const;

/**
 * Read access for other modules (`PERSON_DIRECTORY`). No permission checks:
 * the calling module is responsible for checking its own permissions.
 */
@Injectable()
export class PersonDirectoryService implements PersonDirectory {
  constructor(
    private readonly em: EntityManager,
    private readonly persons: PersonsService,
  ) {}

  async search(query: string, options: { departmentIds?: string[]; limit?: number } = {}): Promise<PersonSummary[]> {
    const words = wordsWhere(query, ['firstName', 'lastName', 'personnelNumber']);
    const found = await this.em.fork().find(
      Person,
      {
        status: { $ne: 'left' },
        restrictedAt: null,
        ...words,
        ...(options.departmentIds ? { memberships: { department: { $in: options.departmentIds } } } : {}),
      },
      { populate: POPULATE, orderBy: { lastName: 'asc', firstName: 'asc' }, limit: options.limit ?? 20 },
    );
    return found.map((p) => this.persons.summary(p));
  }

  async snapshots(ids: readonly string[], date = today()): Promise<PersonSnapshot[]> {
    if (!ids.length) return [];
    const found = await this.em.fork().find(Person, { id: { $in: [...ids] } }, { populate: POPULATE });
    return found.map((p) => this.persons.snapshot(p, date));
  }

  async membersOn(date: string, options: { includeRestricted?: boolean } = {}): Promise<PersonSnapshot[]> {
    const found = await this.em.fork().find(
      Person,
      { ...(options.includeRestricted ? {} : { restrictedAt: null }), memberships: { from: { $lte: date }, $or: [{ to: null }, { to: { $gte: date } }] } },
      { populate: POPULATE },
    );
    return found.map((p) => this.persons.snapshot(p, date));
  }

  async memberPeriods(): Promise<MemberPeriods[]> {
    const found = await this.em.fork().find(Person, { restrictedAt: null }, { populate: ['memberships'] });
    return found.map((p) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      periods: p.memberships.getItems().map((m) => ({ from: m.from, to: m.to ?? null, departmentId: m.department.id, primary: m.primary })),
    }));
  }

  async summaries(ids: readonly string[]): Promise<PersonSummary[]> {
    if (!ids.length) return [];
    const found = await this.em.fork().find(Person, { id: { $in: [...ids] } }, { populate: POPULATE });
    return found.map((p) => this.persons.summary(p));
  }

  async paymentDetails(ids: readonly string[]): Promise<PaymentDetails[]> {
    if (!ids.length) return [];
    const found = await this.em.fork().find(Person, { id: { $in: [...ids] } });
    return found.map((p) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      street: p.street,
      postalCode: p.postalCode,
      city: p.city,
      iban: p.bank?.iban ?? '',
      accountHolder: p.bank?.accountHolder ?? '',
      employerName: p.employer?.name ?? '',
      employerIban: p.employer?.iban ?? '',
      lossOfEarningsAssignedFrom: p.employer?.lossOfEarningsAssignedFrom ?? null,
    }));
  }

  async careers(ids?: readonly string[]): Promise<PersonCareer[]> {
    const where = ids ? { id: { $in: [...ids] } } : { status: { $ne: 'left' as const }, restrictedAt: null };
    const persons = await this.em.fork().find(Person, where, { populate: ['memberships.department', 'ranks', 'qualifications', 'offices', 'restPeriods'] });
    return persons.map((p) => {
      const current = p.memberships.getItems().filter((m) => m.from <= today() && (!m.to || m.to >= today()));
      return {
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        status: p.status,
        primaryDepartmentId: current.find((m) => m.primary)?.department.id ?? current[0]?.department.id ?? null,
        departmentIds: [...new Set(current.map((m) => m.department.id))],
        joinedOn: p.joinedOn ?? null,
        probationEndsOn: p.probationEndsOn ?? null,
        musician: p.musician,
        ranks: p.ranks.getItems().map((r) => ({ rank: r.rank, since: r.since })).toSorted((a, b) => a.since.localeCompare(b.since)),
        qualifications: p.qualifications.getItems().map((q) => ({ qualification: q.qualification, acquiredOn: q.acquiredOn })),
        offices: p.offices.getItems().map((o) => ({ office: o.office, departmentId: o.departmentId ?? null, from: o.from, to: o.to ?? null })),
        restPeriods: p.restPeriods.getItems().map((r) => ({ from: r.from, to: r.to ?? null })),
      };
    });
  }

  async offices(filter: { offices?: readonly string[] } = {}): Promise<OfficeHolding[]> {
    const rows = await this.em.fork().find(
      OfficeAssignment,
      { person: { restrictedAt: null }, ...(filter.offices ? { office: { $in: [...filter.offices] } } : {}) },
      { orderBy: { from: 'asc' } },
    );
    return rows.map((o) => ({ personId: o.person.id, office: o.office, departmentId: o.departmentId ?? null, from: o.from, to: o.to ?? null }));
  }

  async isRestricted(personId: string): Promise<boolean> {
    return (await this.restrictedIds([personId])).has(personId);
  }

  async restrictedIds(ids?: readonly string[]): Promise<Set<string>> {
    if (ids && !ids.length) return new Set();
    const found = await this.em.fork().find(Person, { restrictedAt: { $ne: null }, ...(ids ? { id: { $in: [...ids] } } : {}) }, { fields: ['id'] });
    return new Set(found.map((p) => p.id));
  }

  async recordPromotion(personId: string, promotion: { rank: string; since: string; notes: string }): Promise<void> {
    const em = this.em.fork();
    const person = await em.findOneOrFail(Person, personId);
    person.ranks.add(em.create(RankAssignment, { person, ...promotion }));
    await em.flush();
  }

  async findByPersonnelNumber(personnelNumber: string): Promise<PersonSummary | null> {
    const person = await this.em.fork().findOne(Person, { personnelNumber }, { populate: POPULATE });
    return person ? this.persons.summary(person) : null;
  }
}

/** Organization structure for other modules (`ORGANIZATION`). */
@Injectable()
export class OrganizationService implements Organization {
  constructor(private readonly em: EntityManager) {}

  async departments(): Promise<DepartmentDto[]> {
    return (await this.em.fork().find(Department, {}, { orderBy: { name: 'asc' } })).map(toDepartmentDto);
  }

  async stations(): Promise<StationDto[]> {
    return (await this.em.fork().find(Station, {}, { orderBy: { name: 'asc' } })).map(toStationDto);
  }

  async vehicles(options: { includeRetired?: boolean } = {}): Promise<VehicleDto[]> {
    const where = options.includeRetired ? {} : { status: { $ne: 'retired' as const } };
    return (await this.em.fork().find(Vehicle, where, { orderBy: { designation: 'asc' } })).map(toVehicleDto);
  }

  async catalog(kind: CatalogKind): Promise<CatalogEntryDto[]> {
    return (await this.em.fork().find(CatalogEntry, { kind }, { orderBy: { sortOrder: 'asc', key: 'asc' } })).map(toCatalogDto);
  }
}
