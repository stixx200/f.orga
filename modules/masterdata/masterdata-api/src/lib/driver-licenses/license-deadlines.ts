import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import type { DeadlineInput, DeadlineProvider } from '@forga/core-api';
import type { LocalizedText } from '@forga/core-contracts';
import type { DriverLicenseDue } from '@forga/masterdata-contracts';
import { Person } from '../masterdata.entities.js';
import { departmentsOf } from '../persons/persons.service.js';
import { CHECK, DriverLicensesService } from './driver-licenses.service.js';

function title(due: DriverLicenseDue): LocalizedText {
  switch (due.kind) {
    case 'driver-license-first-check':
      return { de: 'Führerschein: Ersterfassung fehlt', en: 'Driving licence: first check missing' };
    case 'driver-license-class-expires':
      return { de: `Führerscheinklasse läuft ab: ${due.classes.join(', ')}`, en: `Driving licence class expires: ${due.classes.join(', ')}` };
    case 'driver-license-request':
      // The reason stays out of tasks and e-mails.
      return { de: 'Führerschein erneut vorlegen', en: 'Present the driving licence again' };
    case 'driver-license-check-due':
      return { de: 'Führerscheinkontrolle fällig', en: 'Driving licence check due' };
    case 'driver-license-in-person-due':
      return { de: 'Führerschein im Original vorlegen', en: 'Present the original driving licence' };
  }
}

/**
 * Deadlines of the driving licence checks for the persons of the target group. Responsible are the users with
 * `masterdata.licenses.check` in a department of the person.
 */
@Injectable()
export class DriverLicenseDeadlines implements DeadlineProvider {
  readonly module = 'masterdata';

  constructor(
    private readonly em: EntityManager,
    private readonly licenses: DriverLicensesService,
  ) {}

  async deadlines(asOf: string): Promise<DeadlineInput[]> {
    const em = this.em.fork();
    const settings = await this.licenses.settings();
    const persons = await em.find(Person, { status: { $in: ['probation', 'active'] } }, { populate: ['memberships.department', 'qualifications'] });
    const records = await this.licenses.records(em, persons.map((p) => p.id));
    const result: DeadlineInput[] = [];
    for (const person of persons) {
      const status = this.licenses.status(person, records, settings, asOf);
      for (const due of status.dues) {
        result.push({
          id: `${due.kind}:${person.id}${due.kind === 'driver-license-class-expires' || due.kind === 'driver-license-request' ? `:${due.dueOn}` : ''}`,
          kind: due.kind,
          title: title(due),
          subject: { type: 'masterdata.person', id: person.id, label: `${person.lastName}, ${person.firstName}` },
          dueOn: due.dueOn,
          leadDays: settings.leadDays,
          departmentIds: departmentsOf(person, asOf),
          permission: CHECK,
          to: `/masterdata/persons/${person.id}/driver-license`,
        });
      }
    }
    return result;
  }
}
