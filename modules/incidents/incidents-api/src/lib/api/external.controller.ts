import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { EntityManager, UniqueConstraintViolationException } from '@mikro-orm/core';
import { RequirePermissions, ZodPipe } from '@forga/core-api';
import { ExternalIncidentInput, type ExternalIncidentResult, IncidentInput } from '@forga/incidents-contracts';
import {
  type Department,
  ORGANIZATION,
  type Organization,
  PERSON_DIRECTORY,
  type PersonDirectory,
  type Vehicle,
} from '@forga/masterdata-contracts';
import { IncidentEntity, ReportEntity, ReportPersonnelEntity } from '../incidents.entities.js';
import { addCrewVehicles, ReportsService } from '../reports/reports.service.js';

type ParsedExternal = ReturnType<typeof ExternalIncidentInput.parse>;

/** Lowercase, without "Abt."/"Abteilung", without spaces and punctuation. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/^(abteilung|abt\.?)\s*/, '')
    .replace(/[^a-z0-9äöüß]/g, '');
}

function findDepartment(departments: Department[], value: string): Department | undefined {
  const wanted = normalize(value);
  return departments.find((d) => d.id === value || normalize(d.name) === wanted || normalize(d.shortName) === wanted);
}

function findVehicle(vehicles: Vehicle[], value: string): Vehicle | undefined {
  const wanted = normalize(value);
  return vehicles.find((v) => v.id === value || normalize(v.designation) === wanted || normalize(v.radioCallSign) === wanted);
}

/** API for external systems. Needs an API token with the scope `incidents.api.create`. */
@Controller('incidents/v1')
export class ExternalController {
  constructor(
    private readonly em: EntityManager,
    private readonly reports: ReportsService,
    @Inject(ORGANIZATION) private readonly organization: Organization,
    @Inject(PERSON_DIRECTORY) private readonly directory: PersonDirectory,
  ) {}

  /**
   * Creates or completes an incident, idempotent by dispatch number.
   * Reports that a person has edited in the meantime are never changed.
   */
  @Post('incidents')
  @HttpCode(200)
  @RequirePermissions('incidents.api.create')
  async upsert(@Body(new ZodPipe(ExternalIncidentInput)) input: ParsedExternal): Promise<ExternalIncidentResult> {
    try {
      return await this.apply(input);
    } catch (error) {
      // Two systems sent the same incident at the same time: the other request created it, so complete it now.
      if (error instanceof UniqueConstraintViolationException) return this.apply(input);
      throw error;
    }
  }

  private async apply(input: ParsedExternal): Promise<ExternalIncidentResult> {
    const em = this.em.fork();
    const [departments, vehicles] = await Promise.all([this.organization.departments(), this.organization.vehicles()]);
    const warnings: ExternalIncidentResult['warnings'] = [];

    const departmentIds: string[] = [];
    for (const value of input.departments) {
      const department = findDepartment(departments, value);
      if (department) departmentIds.push(department.id);
      else warnings.push({ code: 'incidents.api.unknownDepartment', value });
    }

    const existing = await em.findOne(IncidentEntity, { dispatchNumber: input.dispatchNumber }, { populate: ['reports'] });
    const created = !existing;
    const incident: IncidentEntity =
      existing ?? (await this.reports.createIncident(em, IncidentInput.parse({ ...input, dispatchNumber: input.dispatchNumber }), 'api'));

    const results = new Map<string, { report: ReportEntity; created: boolean; updated: boolean }>();
    // Reports of brigade-wide units (e.g. the duty officer) are not changed through this API.
    for (const report of incident.reports.getItems()) if (report.departmentId) results.set(report.departmentId, { report, created: false, updated: false });
    for (const departmentId of departmentIds) {
      if (results.has(departmentId)) continue;
      const commander = departments.find((d) => d.id === departmentId)?.commanderId ?? null;
      const report = await this.reports.createReport(em, incident, departmentId, commander);
      report.externallyManaged = true;
      results.set(departmentId, { report, created: true, updated: false });
    }

    // Personnel only goes into reports no person has edited yet.
    for (const entry of input.personnel) {
      const person = await this.directory.findByPersonnelNumber(entry.personnelNumber);
      if (!person) {
        warnings.push({ code: 'incidents.api.unknownPerson', value: entry.personnelNumber });
        continue;
      }
      const departmentId = entry.department ? findDepartment(departments, entry.department)?.id : departmentIds[0];
      const target = departmentId ? results.get(departmentId) : undefined;
      if (!target) {
        warnings.push({ code: 'incidents.api.unknownDepartment', value: entry.department ?? '' });
        continue;
      }
      if (!target.report.externallyManaged) continue;
      await em.populate(target.report, ['personnel', 'vehicles']);
      if (target.report.personnel.getItems().some((p) => p.personId === person.id)) continue;
      const vehicle = entry.vehicle ? findVehicle(vehicles, entry.vehicle) : undefined;
      if (entry.vehicle && !vehicle) warnings.push({ code: 'incidents.api.unknownVehicle', value: entry.vehicle });
      target.report.personnel.add(
        em.create(ReportPersonnelEntity, {
          report: target.report,
          personId: person.id,
          vehicleId: vehicle?.id ?? null,
          function: entry.function ?? null,
          allowances: [],
        }),
      );
      // The group leader of the first vehicle writes the report.
      if (entry.function === 'group-leader' && !target.report.personnel.getItems().some((p) => p.function === 'group-leader' && p.personId !== person.id)) {
        target.report.authorPersonId = person.id;
      }
      addCrewVehicles(em, target.report);
      target.updated = !target.created;
    }

    await em.flush();
    if (created) await this.reports.publishCreated(incident);
    return {
      incidentId: incident.id,
      created,
      reports: [...results.values()].map(({ report, created: c, updated }) => ({
        id: report.id,
        departmentId: report.departmentId as string,
        created: c,
        updated,
      })),
      warnings,
    };
  }
}
