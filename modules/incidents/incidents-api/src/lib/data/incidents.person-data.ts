import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { type ErasureAreaInput, HistoryEntry, type PersonDataHandler } from '@forga/core-api';
import { ReportEntity, ReportPersonnelEntity } from '../incidents.entities.js';

/**
 * Members appear in reports only by reference (personnel, author); their names follow the basic data of the person.
 * Incidents are the record of the brigade (Wachbuch) and the basis of the statistics: they stay with their own period
 * (retention plan). What is about the member beyond that, the reason of a manual compensation amount, is emptied
 * together with the history of the personnel entry.
 */
@Injectable()
export class IncidentsPersonData implements PersonDataHandler {
  constructor(private readonly em: EntityManager) {}

  async anonymize(personIds: readonly string[]): Promise<void> {
    const em = this.em.fork();
    const rows = await em.find(ReportPersonnelEntity, { personId: { $in: [...personIds] } });
    if (!rows.length) return;
    for (const row of rows) if (row.compensationOverride?.reason) row.compensationOverride = { ...row.compensationOverride, reason: '' };
    await em.flush();
    await em.nativeDelete(HistoryEntry, { entity: 'incidents.report_personnel', entityId: { $in: rows.map((r) => r.id) } });
  }

  async erasure(personId: string): Promise<ErasureAreaInput[]> {
    const em = this.em.fork();
    const rows = await em.find(ReportPersonnelEntity, { personId }, { fields: ['id', 'report'] });
    const authored = await em.count(ReportEntity, { authorPersonId: personId });
    if (!rows.length && !authored) return [];
    const incidents = new Set(rows.map((r) => r.report.id)).size;
    return [{
      key: 'incidents.personnel',
      title: { de: 'Einsätze', en: 'Incidents' },
      data: {
        de: [incidents && `${incidents} ${incidents === 1 ? 'Einsatzbericht' : 'Einsatzberichte'} als Einsatzkraft`, authored && `${authored} als Verfasser`].filter(Boolean).join(', '),
        en: [incidents && `${incidents} incident ${incidents === 1 ? 'report' : 'reports'} as crew member`, authored && `${authored} as author`].filter(Boolean).join(', '),
      },
      count: rows.length + authored,
      outcome: 'anonymize',
      keepUntil: null,
      reason: { de: 'Einsätze bleiben im Wachbuch und in der Statistik; der Name folgt den Grunddaten', en: 'Incidents stay in the record and the statistics; the name follows the basic data' },
    }];
  }

  async erase(personId: string): Promise<void> {
    await this.anonymize([personId]);
  }
}
