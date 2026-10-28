import { Injectable } from '@nestjs/common';
import { ModuleStateService } from '@forga/core-api';
import type { Language, LocalizedText } from '@forga/core-contracts';
import { IncidentUnit, type IncidentUnits } from '@forga/incidents-contracts';

/** The brigade-wide units other modules registered (`INCIDENT_UNITS`), e.g. the duty officer. */
@Injectable()
export class IncidentUnitsRegistry implements IncidentUnits {
  private readonly units = new Map<string, IncidentUnit>();

  constructor(private readonly modules: ModuleStateService) {}

  register(unit: Parameters<IncidentUnits['register']>[0]): void {
    const parsed = IncidentUnit.parse(unit);
    this.units.set(parsed.key, parsed);
  }

  get(key: string | null | undefined): IncidentUnit | undefined {
    return key ? this.units.get(key) : undefined;
  }

  all(): IncidentUnit[] {
    return [...this.units.values()];
  }

  /** The units of active modules, e.g. to assign imported reports to. */
  async active(): Promise<IncidentUnit[]> {
    const inactive = await this.modules.inactiveIds();
    return this.all().filter((unit) => !unit.module || !inactive.has(unit.module));
  }
}

/** The name of the owner of a report in the language: department name or the short name of the unit. */
export function ownerName(
  report: { departmentId?: string | null; unit?: string | null },
  departments: ReadonlyMap<string, string>,
  units: IncidentUnits,
  language: Language,
  form: 'label' | 'shortLabel' = 'shortLabel',
): string {
  if (report.departmentId) return departments.get(report.departmentId) ?? '';
  const unit = units.get(report.unit);
  const name: LocalizedText | undefined = unit?.[form];
  return name?.[language] ?? report.unit ?? '';
}
