import { Injectable } from '@nestjs/common';
import { EntityManager, wrap } from '@mikro-orm/core';
import { Attachments, HistoryEntry, type RetentionCandidate, type RetentionExportRecord, type RetentionQuery, RetentionRegistry } from '@forga/core-api';
import type { LocalizedText } from '@forga/core-contracts';
import {
  IncidentEntity,
  InvolvedPartyEntity,
  OtherAgencyEntity,
  ReportEntity,
  ReportPersonnelEntity,
  ReportRevisionEntity,
} from '../incidents.entities.js';

const ATTACHMENTS = 'incidents.report';
const CHUNK = 500;

const berlinDay = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(date);
const chunks = <T>(items: readonly T[]): T[][] => Array.from({ length: Math.ceil(items.length / CHUNK) }, (_, i) => items.slice(i * CHUNK, (i + 1) * CHUNK));

/** Why an incident counts as incident with special features (Wachbuch: 30 instead of 3 years), in this order. */
const REASONS = {
  marked: { de: '30 Jahre aufbewahren (Sonderfall)', en: 'Keep for 30 years (special case)' },
  casualties: { de: 'Verletzte oder Tote', en: 'Injured or dead' },
  costRecovery: { de: 'Kostenersatz', en: 'Cost recovery' },
  disaster: { de: 'Kat-Einsatz', en: 'Disaster operation' },
} satisfies Record<string, LocalizedText>;

/**
 * Retention of the incidents (Wachbuch). Incidents with special features (injured or dead, cost recovery, disaster
 * operation, or marked „30 Jahre aufbewahren (Sonderfall)“) have a rule of their own. Anonymising keeps keyword, times,
 * municipality and district, vehicles, personnel with times and functions and the statistics features, so annual
 * statistics and numbers of incidents stay; the reports of brigade-wide units (EvD) follow their incident.
 */
@Injectable()
export class IncidentsRetention {
  constructor(
    private readonly em: EntityManager,
    private readonly attachments: Attachments,
  ) {}

  register(registry: RetentionRegistry): void {
    registry.registerCategory({
      key: 'incidents.incidents',
      module: 'incidents',
      name: { de: 'Einsätze', en: 'Incidents' },
      description: { de: 'Wachbuch: Einsätze mit allen Berichten, auch der EvD-Berichte, und Anhängen', en: 'Station log: incidents with all reports, including duty officer reports, and attachments' },
      event: { de: 'Alarm', en: 'Alarm' },
      actions: ['offer-archive', 'anonymize', 'delete', 'none'],
      subtypeMode: 'fixed',
      subtypes: async () => [
        {
          key: 'special',
          name: { de: 'Einsätze mit Besonderheiten', en: 'Incidents with special features' },
          description: {
            de: 'Wachbuch: Verletzte oder Tote, Kostenersatz, Kat-Einsatz oder „30 Jahre aufbewahren (Sonderfall)“',
            en: 'Station log: injured or dead, cost recovery, disaster operation or „keep for 30 years (special case)“',
          },
        },
      ],
      otherName: { de: 'Übrige Einsätze', en: 'Other incidents' },
      referencedBy: ['cost-recovery.notices', 'compensation.runs'],
      candidates: (query) => this.candidates(query),
      export: (ids) => this.export(ids),
      execute: (ids, action) => (action === 'delete' ? this.delete(ids) : this.anonymize(ids)),
      children: async (ids) => {
        const reports = await this.em.fork().find(ReportEntity, { incident: { $in: [...ids] } }, { fields: ['id', 'incident'] });
        const result = new Map<string, string[]>();
        for (const r of reports) result.set(r.incident.id, [...(result.get(r.incident.id) ?? []), r.id]);
        return result;
      },
    });
  }

  /** The reason why each incident has special features; incidents without are missing. */
  async specialReasons(incidents: readonly IncidentEntity[]): Promise<Map<string, LocalizedText>> {
    const em = this.em.fork();
    const ids = incidents.map((i) => i.id);
    const casualties = new Set<string>();
    for (const part of chunks(ids)) {
      const personnel = await em.find(ReportPersonnelEntity, { $or: [{ injured: true }, { killed: true }], report: { incident: { $in: part } } }, { populate: ['report'] });
      for (const p of personnel) casualties.add(p.report.incident.id);
      const parties = await em.find(InvolvedPartyEntity, { role: 'injured-party', report: { incident: { $in: part } } }, { populate: ['report'] });
      for (const p of parties) casualties.add(p.report.incident.id);
    }
    const result = new Map<string, LocalizedText>();
    for (const incident of incidents) {
      const reason = incident.retentionSpecial
        ? REASONS.marked
        : casualties.has(incident.id) || (incident.statistics?.dead ?? 0) > 0
          ? REASONS.casualties
          : incident.chargeable
            ? REASONS.costRecovery
            : incident.statistics?.disasterOperation
              ? REASONS.disaster
              : null;
      if (reason) result.set(incident.id, reason);
    }
    return result;
  }

  private async candidates(query: RetentionQuery): Promise<RetentionCandidate[]> {
    const em = this.em.fork();
    const incidents = await em.find(
      IncidentEntity,
      { alarmedAt: { $lt: query.cutoff }, ...(query.final === 'anonymize' ? { anonymizedAt: null } : {}) },
      { orderBy: { alarmedAt: 'asc' } },
    );
    const reasons = await this.specialReasons(incidents);
    const special = query.subtype === 'special';
    const due = incidents.filter((i) => reasons.has(i.id) === special);
    const reports = await em.find(ReportEntity, { incident: { $in: due.map((i) => i.id) } }, { fields: ['id', 'incident'] });
    const counts = await this.attachments.count(ATTACHMENTS, reports.map((r) => r.id));
    const attachments = new Map<string, number>();
    for (const r of reports) attachments.set(r.incident.id, (attachments.get(r.incident.id) ?? 0) + (counts.get(r.id) ?? 0));
    return due.map((i) => ({
      id: i.id,
      label: `${i.dispatchNumber} · ${i.alarmKeyword}`,
      neutralLabel: i.dispatchNumber,
      eventDate: berlinDay(i.alarmedAt),
      reason: reasons.get(i.id) ?? null,
      attachments: attachments.get(i.id) ?? 0,
    }));
  }

  private async export(ids: readonly string[]): Promise<RetentionExportRecord[]> {
    const em = this.em.fork();
    const incidents = await em.find(IncidentEntity, { id: { $in: [...ids] } }, {
      populate: ['reports', 'reports.personnel', 'reports.vehicles', 'reports.involvedParties', 'reports.otherAgencies'],
    });
    return incidents.map((i) => {
      const reports = i.reports.getItems();
      const location = [[i.location.street, i.location.houseNumber].filter(Boolean).join(' '), [i.location.postalCode, i.location.city].filter(Boolean).join(' '), i.location.district, i.location.object]
        .filter(Boolean)
        .join(', ');
      return {
        id: i.id,
        title: `${i.dispatchNumber} · ${i.alarmKeyword}`,
        fields: [
          { label: { de: 'Einsatznummer', en: 'Incident number' }, value: i.dispatchNumber },
          { label: { de: 'Stichwort', en: 'Keyword' }, value: i.alarmKeyword },
          { label: { de: 'Alarm', en: 'Alarm' }, value: i.alarmedAt.toISOString() },
          { label: { de: 'Einsatzort', en: 'Location' }, value: location },
          { label: { de: 'Meldung', en: 'Alarm message' }, value: i.alarmMessage },
          { label: { de: 'Berichte', en: 'Reports' }, value: reports.map((r) => r.number).join(', ') },
          { label: { de: 'Lage', en: 'Situation' }, value: reports.map((r) => r.situation).filter(Boolean).join('\n\n') },
          { label: { de: 'Maßnahmen', en: 'Actions' }, value: reports.map((r) => r.actions).filter(Boolean).join('\n\n') },
        ],
        data: {
          incident: { ...wrap(i).toObject(), reports: undefined },
          reports: reports.map((r) => ({
            ...wrap(r).toObject(),
            personnel: r.personnel.getItems().map((p) => wrap(p).toObject()),
            vehicles: r.vehicles.getItems().map((v) => wrap(v).toObject()),
            involvedParties: r.involvedParties.getItems().map((p) => wrap(p).toObject()),
            otherAgencies: r.otherAgencies.getItems().map((a) => wrap(a).toObject()),
          })),
        },
        attachments: reports.map((r) => ({ ownerType: ATTACHMENTS, ownerId: r.id })),
      };
    });
  }

  /**
   * Removes parties (names, addresses, licence plates), free texts of situation, course and cause, the incident commander
   * as text, names of guests, notes, earlier versions, attachments and the history; the street becomes empty, municipality
   * and district stay. Members in the personnel stay as references: their names follow the retention of the persons.
   */
  private async anonymize(ids: readonly string[]): Promise<number> {
    const em = this.em.fork();
    let count = 0;
    for (const part of chunks(ids)) {
      const incidents = await em.find(IncidentEntity, { id: { $in: part }, anonymizedAt: null });
      if (!incidents.length) continue;
      const incidentIds = incidents.map((i) => i.id);
      const reports = await em.find(ReportEntity, { incident: { $in: incidentIds } }, { fields: ['id'] });
      const reportIds = reports.map((r) => r.id);
      for (const i of incidents) {
        await em.nativeUpdate(IncidentEntity, { id: i.id }, {
          alarmMessage: '',
          location: { ...i.location, street: '', houseNumber: '', object: '', addition: '', latitude: null, longitude: null },
          chargeableReason: '',
          notes: '',
          anonymizedAt: new Date(),
        });
      }
      if (reportIds.length) {
        await em.nativeUpdate(ReportEntity, { id: { $in: reportIds } }, { situation: '', actions: '', cause: '', incidentCommander: '', returnComment: null, lockedBy: null, acknowledgements: [] });
        await em.nativeUpdate(ReportPersonnelEntity, { report: { $in: reportIds } }, { guestName: '', compensationOverride: null });
        await em.nativeUpdate(InvolvedPartyEntity, { report: { $in: reportIds } }, { name: '', street: '', postalCode: '', city: '', phone: '', licensePlate: '', notes: '' });
        await em.nativeUpdate(OtherAgencyEntity, { report: { $in: reportIds } }, { notes: '' });
        await em.nativeDelete(ReportRevisionEntity, { report: { $in: reportIds } });
        await this.attachments.removeFor(ATTACHMENTS, reportIds);
      }
      await this.removeHistory(em, incidentIds, reportIds);
      count += incidents.length;
    }
    return count;
  }

  /** Incident, reports with personnel, vehicles, parties and versions, attachments and history. */
  private async delete(ids: readonly string[]): Promise<number> {
    const em = this.em.fork();
    let count = 0;
    for (const part of chunks(ids)) {
      const reports = await em.find(ReportEntity, { incident: { $in: part } }, { fields: ['id'] });
      const reportIds = reports.map((r) => r.id);
      await this.attachments.removeFor(ATTACHMENTS, reportIds);
      await this.removeHistory(em, part, reportIds);
      // The reports, their parts and versions go with the incident (foreign keys with cascade).
      count += await em.nativeDelete(IncidentEntity, { id: { $in: part } });
    }
    return count;
  }

  private async removeHistory(em: EntityManager, incidentIds: string[], reportIds: string[]): Promise<void> {
    await em.nativeDelete(HistoryEntry, {
      $or: [
        { entity: 'incidents.incident', entityId: { $in: incidentIds } },
        ...(reportIds.length ? [{ entity: 'incidents.report', entityId: { $in: reportIds } }, { parentEntity: 'incidents.report', parentId: { $in: reportIds } }] : []),
      ],
    });
  }
}
