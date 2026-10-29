import { Injectable } from '@nestjs/common';
import { EntityManager, wrap } from '@mikro-orm/core';
import { HistoryEntry, type RetentionCandidate, type RetentionExportRecord, type RetentionQuery, RetentionRegistry } from '@forga/core-api';
import { Person, Vehicle } from '../masterdata.entities.js';
import { OrganizationReferenceRegistry } from '../organization/references.js';
import { MasterdataData } from './masterdata.data.js';

const iso = (date: Date | string | null | undefined): string => (date ? (typeof date === 'string' ? date : date.toISOString()).slice(0, 10) : '');
const cutoffDay = (query: RetentionQuery) => query.cutoff.toISOString().slice(0, 10);
const name = (p: Person) => `${p.lastName}, ${p.firstName}`;

/**
 * Retention of the master data: basic data (Personalstammrolle) and person file (Personalakte) of former members, and
 * retired vehicles.
 */
@Injectable()
export class MasterdataRetention {
  constructor(
    private readonly em: EntityManager,
    private readonly data: MasterdataData,
    private readonly references: OrganizationReferenceRegistry,
  ) {}

  register(registry: RetentionRegistry): void {
    const leaving = { de: 'Austritt', en: 'Leaving' };
    registry.registerCategory({
      key: 'masterdata.person-core',
      module: 'masterdata',
      name: { de: 'Grunddaten Ausgeschiedener', en: 'Basic data of former members' },
      description: { de: 'Personalstammrolle: Name, Mitgliedschaften, Dienstgrade, Status', en: 'Personnel register: name, memberships, ranks, status' },
      event: leaving,
      actions: ['offer-archive', 'anonymize', 'none'],
      atLeastAs: 'masterdata.person-file',
      candidates: (query) => this.persons(query, { anonymizedAt: null }),
      export: (ids) => this.exportPersons(ids),
      execute: (ids) => this.data.anonymizePersons(ids),
    });
    registry.registerCategory({
      key: 'masterdata.person-file',
      module: 'masterdata',
      name: { de: 'Personalakte Ausgeschiedener', en: 'Personnel file of former members' },
      description: {
        de: 'Feuerwehrangehörige: Kontakt, sensible Daten, Qualifikationen, Lehrgänge, Ehrungen, Ämter, Ruhezeiten, Führerschein; dazu Atemschutz, Kleiderkammer, Beförderungen und weitere Module',
        en: 'Fire brigade members: contact, sensitive data, qualifications, courses, honours, offices, rest periods, driving licence; also breathing apparatus, clothing, promotions and other modules',
      },
      event: leaving,
      actions: ['offer-archive', 'anonymize', 'none'],
      candidates: (query) => this.persons(query, { anonymizedAt: null, fileAnonymizedAt: null }),
      export: (ids) => this.exportPersons(ids),
      execute: (ids) => this.data.anonymizeFile(ids),
    });
    registry.registerCategory({
      key: 'masterdata.vehicles-retired',
      module: 'masterdata',
      name: { de: 'Ausgesonderte Fahrzeuge', en: 'Retired vehicles' },
      description: { de: 'Freiwillige Feuerwehr (Zuordnung mit dem Hauptamt klären)', en: 'Volunteer fire brigade (assignment to be agreed with the municipality)' },
      event: { de: 'Außerdienststellung', en: 'Decommissioning' },
      actions: ['offer-archive', 'delete', 'none'],
      candidates: (query) => this.vehicles(query),
      export: (ids) => this.exportVehicles(ids),
      execute: (ids) => this.deleteVehicles(ids),
      // Reports, equipment and other modules still refer to the vehicle (e.g. kept incidents for the statistics).
      blockedBy: async (ids) => {
        const blocked = new Map<string, string>();
        for (const id of ids) {
          try {
            await this.references.assertUnused('vehicle', id);
          } catch {
            blocked.set(id, 'retention.referenced');
          }
        }
        return blocked;
      },
    });
  }

  private async persons(query: RetentionQuery, where: object): Promise<RetentionCandidate[]> {
    const persons = await this.em.fork().find(Person, { status: 'left', leftOn: { $lt: cutoffDay(query) }, ...where }, { orderBy: { leftOn: 'asc' } });
    return persons.map((p) => ({
      id: p.id,
      label: `${name(p)}${p.personnelNumber ? ` · ${p.personnelNumber}` : ''}`,
      neutralLabel: p.personnelNumber ?? p.id.slice(0, 8),
      eventDate: iso(p.leftOn),
    }));
  }

  private async exportPersons(ids: readonly string[]): Promise<RetentionExportRecord[]> {
    const persons = await this.em.fork().find(Person, { id: { $in: [...ids] } });
    return Promise.all(
      persons.map(async (p) => ({
        id: p.id,
        title: name(p),
        fields: [
          { label: { de: 'Name', en: 'Name' }, value: name(p) },
          { label: { de: 'Personalnummer', en: 'Personnel number' }, value: p.personnelNumber ?? '' },
          { label: { de: 'Geburtsdatum', en: 'Date of birth' }, value: iso(p.birthDate) },
          { label: { de: 'Eintritt', en: 'Joined' }, value: iso(p.joinedOn) },
          { label: { de: 'Austritt', en: 'Left' }, value: iso(p.leftOn) },
          { label: { de: 'Austrittsgrund', en: 'Reason for leaving' }, value: p.exitReason ?? '' },
        ],
        data: await this.data.exportPerson(p.id),
        attachments: [],
      })),
    );
  }

  private async vehicles(query: RetentionQuery): Promise<RetentionCandidate[]> {
    const vehicles = await this.em.fork().find(Vehicle, { status: 'retired', decommissionedOn: { $ne: null, $lt: cutoffDay(query) } }, { orderBy: { decommissionedOn: 'asc' } });
    return vehicles.map((v) => ({
      id: v.id,
      label: [v.designation, v.radioCallSign, v.licensePlate].filter(Boolean).join(' · '),
      neutralLabel: [v.designation, v.radioCallSign].filter(Boolean).join(' · '),
      eventDate: iso(v.decommissionedOn),
    }));
  }

  private async exportVehicles(ids: readonly string[]): Promise<RetentionExportRecord[]> {
    const em = this.em.fork();
    const vehicles = await em.find(Vehicle, { id: { $in: [...ids] } }, { populate: ['department', 'station'] });
    return Promise.all(
      vehicles.map(async (v) => ({
        id: v.id,
        title: v.designation,
        fields: [
          { label: { de: 'Bezeichnung', en: 'Designation' }, value: v.designation },
          { label: { de: 'Funkrufname', en: 'Radio call sign' }, value: v.radioCallSign },
          { label: { de: 'Kennzeichen', en: 'Licence plate' }, value: v.licensePlate },
          { label: { de: 'Baujahr', en: 'Year built' }, value: v.yearBuilt ? String(v.yearBuilt) : '' },
          { label: { de: 'In Dienst gestellt', en: 'Commissioned' }, value: iso(v.commissionedOn) },
          { label: { de: 'Außer Dienst gestellt', en: 'Decommissioned' }, value: iso(v.decommissionedOn) },
        ],
        data: {
          vehicle: { ...wrap(v).toObject(), department: v.department.name, station: v.station?.name ?? null },
          history: await em.find(HistoryEntry, { entity: 'masterdata.vehicle', entityId: v.id }, { orderBy: { timestamp: 'asc' } }),
        },
        attachments: [],
      })),
    );
  }

  private async deleteVehicles(ids: readonly string[]): Promise<number> {
    const em = this.em.fork();
    const count = await em.nativeDelete(Vehicle, { id: { $in: [...ids] }, status: 'retired' });
    await em.nativeDelete(HistoryEntry, { entity: 'masterdata.vehicle', entityId: { $in: [...ids] } });
    return count;
  }
}
