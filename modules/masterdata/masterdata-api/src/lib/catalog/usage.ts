import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { SettingsService } from '@forga/core-api';
import { type CatalogKind, MembershipSettings } from '@forga/masterdata-contracts';
import { Course } from '../courses/course.entities.js';
import { HonorAward, OfficeAssignment, Person, PersonQualification, RankAssignment, Vehicle } from '../masterdata.entities.js';

/** How often the masterdata module itself refers to a catalog entry (person files, vehicles, courses, membership rules). */
@Injectable()
export class MasterdataCatalogUsage {
  constructor(
    private readonly em: EntityManager,
    private readonly settings: SettingsService,
  ) {}

  async count(kind: CatalogKind, key: string): Promise<number> {
    const em = this.em.fork();
    switch (kind) {
      case 'qualification': {
        const [held, courses, rules] = await Promise.all([
          em.count(PersonQualification, { qualification: key }),
          em.find(Course, {}, { fields: ['grantsQualifications', 'requiredQualifications'] }),
          this.settings.get<MembershipSettings>('masterdata.membership'),
        ]);
        const inCourses = courses.filter((c) => c.grantsQualifications.includes(key) || c.requiredQualifications.includes(key)).length;
        return held + inCourses + (rules?.probationQualifications.includes(key) ? 1 : 0);
      }
      case 'rank':
        return em.count(RankAssignment, { rank: key });
      case 'honor':
        return em.count(HonorAward, { honor: key });
      case 'office':
        return em.count(OfficeAssignment, { office: key });
      case 'exit-reason':
        return em.count(Person, { exitReason: key });
      case 'vehicle-type':
        return em.count(Vehicle, { vehicleType: key });
      case 'function':
        return 0;
    }
  }
}
