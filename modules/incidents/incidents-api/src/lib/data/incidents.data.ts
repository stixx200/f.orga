import { Injectable } from '@nestjs/common';
import { type EntityClass, EntityManager, type FilterQuery, wrap } from '@mikro-orm/core';
import { type AuthenticatedUser, wordsWhere } from '@forga/core-api';
import type { SearchHit } from '@forga/core-contracts';
import {
  AlarmKeywordEntity,
  IncidentEntity,
  InvolvedPartyEntity,
  OtherAgencyEntity,
  ReportEntity,
  ReportPersonnelEntity,
  ReportVehicleEntity,
  StatisticsYearEntity,
} from '../incidents.entities.js';
import { ReportsService } from '../reports/reports.service.js';

const LOCATION_FIELDS = ['street', 'object', 'city', 'district'] as const;

const plain = async <T extends object>(em: EntityManager, entity: EntityClass<T>, where: object = {}) =>
  (await em.find(entity, where as never)).map((e) => wrap(e).toObject());

/** Search and full export of the incident reports. */
@Injectable()
export class IncidentsData {
  constructor(
    private readonly em: EntityManager,
    private readonly reports: ReportsService,
  ) {}

  async search(user: AuthenticatedUser, query: string): Promise<SearchHit[]> {
    // The location is JSON: street, object, city and district are searched as JSON properties.
    const words = wordsWhere(query, ['dispatchNumber', 'alarmKeyword', 'alarmMessage'], (like) =>
      LOCATION_FIELDS.map((field) => ({ location: { [field]: { $ilike: like } } })),
    );
    if (!words) return [];
    const where: FilterQuery<IncidentEntity>[] = [words as FilterQuery<IncidentEntity>];
    const readable = this.reports.readableFilter(user);
    if (!readable) return [];
    if (Object.keys(readable).length) where.push({ reports: readable });
    const incidents = await this.em.fork().find(IncidentEntity, { $and: where }, { orderBy: { alarmedAt: 'desc' }, limit: 8 });
    return incidents.map((i) => ({
      id: i.id,
      group: { de: 'Einsätze', en: 'Incidents' },
      title: `${i.alarmKeyword} · ${i.dispatchNumber}`,
      description: [i.alarmMessage, i.location.object, i.location.city, [i.location.street, i.location.houseNumber].filter(Boolean).join(' ')].filter(Boolean).join(', '),
      to: `/incidents/incidents/${i.id}`,
    }));
  }

  async exportAll(): Promise<Record<string, unknown>> {
    const em = this.em.fork();
    return {
      keywords: await plain(em, AlarmKeywordEntity),
      incidents: await plain(em, IncidentEntity),
      reports: await plain(em, ReportEntity),
      personnel: await plain(em, ReportPersonnelEntity),
      vehicles: await plain(em, ReportVehicleEntity),
      involvedParties: await plain(em, InvolvedPartyEntity),
      otherAgencies: await plain(em, OtherAgencyEntity),
      statisticsYears: await plain(em, StatisticsYearEntity),
    };
  }

  async exportPerson(personId: string): Promise<Record<string, unknown>> {
    const em = this.em.fork();
    return {
      assignments: await plain(em, ReportPersonnelEntity, { personId }),
      authoredReports: (await em.find(ReportEntity, { authorPersonId: personId })).map((r) => ({ id: r.id, number: r.number })),
    };
  }
}
