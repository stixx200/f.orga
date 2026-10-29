import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { type DeadlineInput, type DeadlineProvider, SettingsService } from '@forga/core-api';
import type { MembershipSettings } from '@forga/masterdata-contracts';
import { CatalogEntry } from '../catalog/catalog.js';
import { Person, type PersonQualification } from '../masterdata.entities.js';
import { departmentsOf, validQualifications, WRITE } from '../persons/persons.service.js';
import { addDays, addMonths } from '../shared/dates.js';

/** Birthday-type events stay visible this many days after the date. */
const STALE_AFTER_DAYS = 30;

/**
 * Deadlines of the masterdata module, computed from the current data:
 * probation, basic training, age limits and expiring qualifications. The driving licence checks have their own
 * provider (`DriverLicenseDeadlines`).
 */
@Injectable()
export class MasterdataDeadlines implements DeadlineProvider {
  readonly module = 'masterdata';

  constructor(
    private readonly em: EntityManager,
    private readonly settings: SettingsService,
  ) {}

  async deadlines(asOf: string): Promise<DeadlineInput[]> {
    const rules = (await this.settings.get<MembershipSettings>('masterdata.membership')) as MembershipSettings;
    const em = this.em.fork();
    const qualificationNames = new Map(
      (await em.find(CatalogEntry, { kind: 'qualification' })).map((q) => [q.key, q.name]),
    );
    const persons = await em
      .find(Person, { status: { $ne: 'left' } }, { populate: ['memberships.department', 'qualifications'] });
    const result: DeadlineInput[] = [];

    for (const person of persons) {
      const subject = { type: 'masterdata.person', id: person.id, label: `${person.lastName}, ${person.firstName}` };
      const base = { subject, departmentIds: departmentsOf(person, asOf), permission: WRITE };
      const add = (id: string, kind: string, de: string, en: string, dueOn: string, leadDays: number) =>
        result.push({ ...base, id: `${kind}:${id}`, kind, title: { de, en }, dueOn, leadDays });

      if (person.status === 'probation' && person.probationEndsOn) {
        add(person.id, 'probation-ends', 'Probezeit endet', 'Probation ends', person.probationEndsOn, 30);
        const valid = validQualifications(person, asOf);
        for (const key of rules.probationQualifications.filter((q) => !valid.includes(q))) {
          const name = qualificationNames.get(key) ?? { de: key, en: key };
          add(`${person.id}:${key}`, 'basic-training-missing', `In der Probezeit fehlt: ${name.de}`, `Missing in probation: ${name.en}`, person.probationEndsOn, 60);
        }
      }

      if (person.birthDate) {
        const birthday = (age: number) => addMonths(person.birthDate as string, age * 12);
        const incidentAge = birthday(rules.minimumAgeIncidents);
        if (['probation', 'active'].includes(person.status) && incidentAge >= addDays(asOf, -STALE_AFTER_DAYS)) {
          add(person.id, 'incident-age-reached', `Mindestalter Einsatzdienst (${rules.minimumAgeIncidents})`, `Minimum age for incidents (${rules.minimumAgeIncidents})`, incidentAge, 30);
        }
        if (['probation', 'active'].includes(person.status)) {
          add(person.id, 'age-limit', `Altersgrenze Einsatzabteilung (${rules.ageLimitOperational})`, `Age limit operational (${rules.ageLimitOperational})`, birthday(rules.ageLimitOperational), 90);
        }
        if (person.status === 'youth') {
          add(person.id, 'youth-ends', `Ende Jugendfeuerwehr (${rules.youthEndAge})`, `End of youth fire brigade (${rules.youthEndAge})`, birthday(rules.youthEndAge), 90);
        }
      }

      // Only the latest entry per qualification counts; a renewal ends the deadline.
      const latest = new Map<string, PersonQualification>();
      for (const q of person.qualifications.getItems().toSorted((a, b) => a.acquiredOn.localeCompare(b.acquiredOn))) latest.set(q.qualification, q);
      for (const [id, q] of latest) {
        if (q.validUntil) {
          const name = qualificationNames.get(q.qualification) ?? { de: q.qualification, en: q.qualification };
          add(`${person.id}:${id}`, 'qualification-expires', `Qualifikation läuft ab: ${name.de}`, `Qualification expires: ${name.en}`, q.validUntil, 60);
        }
      }
    }
    return result;
  }
}
