import { Injectable, type OnModuleInit } from '@nestjs/common';
import { EntityManager, wrap } from '@mikro-orm/core';
import { HistoryEntry, RetentionRegistry } from '@forga/core-api';
import { PrivacyDocument } from './access-report/privacy-document.entity.js';
import { PrivacyBreachEntity } from './privacy.entities.js';
import { ACCESS_REPORTS_RETENTION, BREACHES_RETENTION } from '@forga/privacy-contracts';


const day = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Retention of the records of the data protection handling (L29): the rows of access reports (the file itself goes after
 * 30 days, the row records creation and handover) and the documentation of data breaches (Art. 33(5)). Both are proof of
 * the accountability (Art. 5(2)) and must not become a lasting store of data about persons.
 */
@Injectable()
export class PrivacyRetentionCategories implements OnModuleInit {
  constructor(
    private readonly em: EntityManager,
    private readonly registry: RetentionRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.registerCategory({
      key: ACCESS_REPORTS_RETENTION,
      module: 'privacy',
      name: { de: 'Nachweise der Auskünfte', en: 'Records of access reports' },
      description: {
        de: 'Erstellung und Übergabe der Auskünfte nach Art. 15 (die Datei selbst wird nach 30 Tagen gelöscht)',
        en: 'Creation and handover of the access reports under Art. 15 (the file itself is deleted after 30 days)',
      },
      event: { de: 'Erstellung', en: 'Creation' },
      actions: ['delete', 'none'],
      defaultRule: { years: 3, action: 'delete' },
      candidates: async (query) =>
        (await this.em.fork().find(PrivacyDocument, { createdAt: { $lt: query.cutoff }, status: { $ne: 'pending' } }, { orderBy: { createdAt: 'asc' } })).map((d) => ({
          id: d.id,
          label: `${day(d.createdAt)}`,
          neutralLabel: day(d.createdAt),
          eventDate: day(d.createdAt),
        })),
      export: async (ids) =>
        (await this.em.fork().find(PrivacyDocument, { id: { $in: [...ids] } })).map((d) => ({
          id: d.id,
          title: day(d.createdAt),
          fields: [
            { label: { de: 'Erstellt', en: 'Created' }, value: d.createdAt.toISOString() },
            { label: { de: 'Übergeben', en: 'Handed over' }, value: d.handedOverOn ?? '' },
          ],
          data: { ...wrap(d).toObject(), content: undefined },
          attachments: [],
        })),
      execute: (ids) => this.em.fork().nativeDelete(PrivacyDocument, { id: { $in: [...ids] }, status: { $ne: 'pending' } }),
      bulk: {
        count: (query) => this.em.fork().count(PrivacyDocument, { createdAt: { $lt: query.cutoff }, status: { $ne: 'pending' } }),
        run: (query) => this.em.fork().nativeDelete(PrivacyDocument, { createdAt: { $lt: query.cutoff }, status: { $ne: 'pending' } }),
      },
    });

    this.registry.registerCategory({
      key: BREACHES_RETENTION,
      module: 'privacy',
      name: { de: 'Dokumentation der Datenpannen', en: 'Documentation of data breaches' },
      description: {
        de: 'Abgeschlossene Datenpannen mit Meldung, betroffenen Personen und Verlauf (Art. 33 Abs. 5)',
        en: 'Closed data breaches with notification, persons affected and history (Art. 33(5))',
      },
      event: { de: 'Abschluss', en: 'Closing' },
      actions: ['offer-archive', 'delete', 'none'],
      // Each due record is shown before it goes: the authority may still ask for the documentation.
      defaultRule: { years: 5, action: 'delete', specialCase: true },
      candidates: async (query) =>
        (await this.em.fork().find(PrivacyBreachEntity, { status: 'closed', closedOn: { $lt: day(query.cutoff) } }, { orderBy: { closedOn: 'asc' } })).map((b) => ({
          id: b.id,
          label: b.title,
          // The title may describe the incident with names; the case keeps only date and kind.
          neutralLabel: `${b.discoveredAt.toISOString().slice(0, 10)}`,
          eventDate: b.closedOn!,
        })),
      export: async (ids) => {
        const em = this.em.fork();
        return Promise.all(
          (await em.find(PrivacyBreachEntity, { id: { $in: [...ids] } })).map(async (b) => ({
            id: b.id,
            title: b.title,
            fields: [
              { label: { de: 'Bekannt geworden', en: 'Discovered' }, value: b.discoveredAt.toISOString() },
              { label: { de: 'Beschreibung', en: 'Description' }, value: b.description },
              { label: { de: 'Gemeldet am', en: 'Notified on' }, value: b.authorityNotifiedOn ?? '' },
              { label: { de: 'Abgeschlossen', en: 'Closed' }, value: b.closedOn ?? '' },
            ],
            data: { breach: wrap(b).toObject(), history: await em.find(HistoryEntry, { entity: 'privacy.breach', entityId: b.id }, { orderBy: { timestamp: 'asc' } }) },
            attachments: [],
          })),
        );
      },
      execute: async (ids) => {
        const em = this.em.fork();
        await em.nativeDelete(HistoryEntry, { entity: 'privacy.breach', entityId: { $in: [...ids] } });
        return em.nativeDelete(PrivacyBreachEntity, { id: { $in: [...ids] }, status: 'closed' });
      },
    });
  }
}
