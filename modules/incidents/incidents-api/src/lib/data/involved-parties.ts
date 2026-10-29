import { Injectable } from '@nestjs/common';
import { EntityManager, wrap } from '@mikro-orm/core';
import {
  type DescribeContext,
  HistoryEntry,
  type PersonDataSection,
  type RetentionQuery,
  RetentionRegistry,
  ThirdPartyRegistry,
} from '@forga/core-api';
import type { Language, LocalizedText, ThirdPartyErasureOutcome } from '@forga/core-contracts';
import type { PartyRole } from '@forga/incidents-contracts';
import { AlarmKeywordEntity, IncidentEntity, InvolvedPartyEntity, ReportEntity, ReportRevisionEntity } from '../incidents.entities.js';

export const PARTIES_SOURCE = 'incidents.involved-parties';
export const PARTIES_RETENTION = 'incidents.involved-parties';

const ROLES: Record<PartyRole, LocalizedText> = {
  'injured-party': { de: 'Geschädigte/r', en: 'Injured party' },
  causer: { de: 'Verursacher/in', en: 'Causer' },
  witness: { de: 'Zeuge/Zeugin', en: 'Witness' },
  owner: { de: 'Eigentümer/in', en: 'Owner' },
  'vehicle-keeper': { de: 'Fahrzeughalter/in', en: 'Vehicle keeper' },
  caller: { de: 'Anrufer/in', en: 'Caller' },
  other: { de: 'Sonstige', en: 'Other' },
};

/** Fields of a party that name or reach the person; the role stays (statistics, retention „Verletzte“). */
const ANONYMOUS = { name: '', street: '', postalCode: '', city: '', phone: '', licensePlate: '', notes: '' };

const berlinDay = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(date);
const same = (a: unknown, b: string) => typeof a === 'string' && a.trim().toLowerCase() === b.trim().toLowerCase();
const address = (p: { street: string; postalCode: string; city: string }) => [p.street, [p.postalCode, p.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');

/**
 * Persons involved in incidents (injured parties, causers, witnesses, callers …) are no persons of the master data (L14):
 * search, access report and erasure for "another person", and an own retention category „Angaben zu Beteiligten“ that
 * anonymises them earlier than the incident itself.
 */
@Injectable()
export class InvolvedParties {
  constructor(private readonly em: EntityManager) {}

  register(thirdParties: ThirdPartyRegistry, retention: RetentionRegistry): void {
    thirdParties.register({
      key: PARTIES_SOURCE,
      module: 'incidents',
      search: (query, language) => this.search(query, language),
      describe: (ids, ctx) => this.describe(ids, ctx),
      erase: (ids) => this.erase(ids),
    });
    retention.registerCategory({
      key: PARTIES_RETENTION,
      module: 'incidents',
      name: { de: 'Angaben zu Beteiligten von Einsätzen', en: 'Data of persons involved in incidents' },
      description: {
        de: 'Name, Anschrift, Telefon, Kennzeichen und Notizen von Geschädigten, Verursachern, Zeugen und Anrufern; die Rolle und der Einsatz bleiben',
        en: 'Name, address, phone, licence plate and notes of injured parties, causers, witnesses and callers; the role and the incident stay',
      },
      event: { de: 'Alarm', en: 'Alarm' },
      actions: ['anonymize', 'none'],
      // Usually needed until claims are settled (insurance, police, cost recovery); kept as the incident while no period is chosen.
      referencedBy: ['cost-recovery.notices'],
      candidates: (query) => this.candidates(query),
      export: (ids) => this.export(ids),
      execute: (ids) => this.anonymizeIncidents(ids),
    });
  }

  private async keywordNames(language: Language): Promise<Map<string, string>> {
    return new Map((await this.em.fork().find(AlarmKeywordEntity, {})).map((k) => [k.key, k.name[language] || k.name.de]));
  }

  private reference(incident: IncidentEntity, keywords: Map<string, string>, language: Language): string {
    const keyword = keywords.get(incident.alarmKeyword);
    const label = keyword && keyword !== incident.alarmKeyword ? `${incident.alarmKeyword} ${keyword}` : incident.alarmKeyword;
    return `${language === 'de' ? 'Einsatz' : 'Incident'} ${incident.dispatchNumber} · ${label}`;
  }

  async search(query: string, language: Language) {
    const like = `%${query.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
    const parties = await this.em.fork().find(
      InvolvedPartyEntity,
      { name: { $ne: '' }, $or: [{ name: { $ilike: like } }, { street: { $ilike: like } }, { city: { $ilike: like } }, { licensePlate: { $ilike: like } }, { phone: { $ilike: like } }] },
      { populate: ['report.incident'], limit: 100 },
    );
    const keywords = await this.keywordNames(language);
    return parties
      .map((p) => ({
        id: p.id,
        name: p.name,
        address: address(p),
        reference: this.reference(p.report.incident, keywords, language),
        role: ROLES[p.role][language],
        date: berlinDay(p.report.incident.alarmedAt),
        details: [p.phone, p.licensePlate].filter(Boolean).join(' · '),
      }))
      .toSorted((a, b) => b.date.localeCompare(a.date));
  }

  /** „Einsätze, an denen Sie beteiligt waren“: date, keyword, place (district or municipality), role and the stored data. */
  async describe(ids: readonly string[], ctx: DescribeContext): Promise<PersonDataSection[]> {
    const parties = await this.em.fork().find(InvolvedPartyEntity, { id: { $in: [...ids] } }, { populate: ['report.incident'] });
    if (!parties.length) return [];
    const keywords = await this.keywordNames(ctx.language);
    const rows = parties
      .toSorted((a, b) => a.report.incident.alarmedAt.getTime() - b.report.incident.alarmedAt.getTime())
      .map((p) => {
        const incident = p.report.incident;
        const keyword = keywords.get(incident.alarmKeyword);
        const stored = [
          p.name,
          address(p),
          p.phone && ctx.t(`Telefon ${p.phone}`, `phone ${p.phone}`),
          p.licensePlate && ctx.t(`Kennzeichen ${p.licensePlate}`, `licence plate ${p.licensePlate}`),
          p.notes && ctx.t(`Notiz: ${p.notes}`, `note: ${p.notes}`),
        ].filter(Boolean);
        return [
          ctx.dateTime(incident.alarmedAt),
          keyword && keyword !== incident.alarmKeyword ? `${incident.alarmKeyword} ${keyword}` : incident.alarmKeyword,
          ctx.value(incident.location.district || incident.location.city),
          ctx.text(ROLES[p.role]),
          stored.join('; '),
        ];
      });
    return [
      {
        key: 'incidents.involved-parties',
        title: ctx.t('Einsätze, an denen Sie beteiligt waren', 'Incidents you were involved in'),
        activity: 'incidents.reports',
        categories: [ctx.t('Name, Anschrift, Telefon, Kennzeichen, Rolle im Einsatz', 'Name, address, phone, licence plate, role in the incident')],
        blocks: [
          {
            kind: 'table',
            columns: [ctx.t('Alarm', 'Alarm'), ctx.t('Stichwort', 'Keyword'), ctx.t('Ort', 'Place'), ctx.t('Rolle', 'Role'), ctx.t('Gespeicherte Angaben zu Ihnen', 'Data stored about you')],
            rows,
          },
          {
            kind: 'text',
            text: ctx.t(
              'Einsatzkräfte und andere Beteiligte sind nicht genannt (Art. 15 Abs. 4 DSGVO). Der Einsatzbericht selbst gehört zur Dokumentation der Feuerwehr.',
              'Fire fighters and other persons involved are not named (Art. 15(4) GDPR). The incident report itself belongs to the documentation of the brigade.',
            ),
          },
        ],
      },
    ];
  }

  /**
   * Erasure for one person: name, address, phone, licence plate and notes of the parties are removed (the role stays), also
   * from the earlier versions of the report and from the history, where the entries name the person.
   */
  async erase(ids: readonly string[]): Promise<Map<string, { outcome: ThirdPartyErasureOutcome; code: string | null }>> {
    const em = this.em.fork();
    const parties = await em.find(InvolvedPartyEntity, { id: { $in: [...ids] } }, { populate: ['report'] });
    const result = new Map<string, { outcome: ThirdPartyErasureOutcome; code: string | null }>();
    for (const party of parties) {
      const name = party.name;
      if (name) await this.scrub(em, party.report.id, (stored) => same(stored['name'], name));
      await em.nativeUpdate(InvolvedPartyEntity, { id: party.id }, ANONYMOUS);
      result.set(party.id, { outcome: 'anonymized', code: null });
    }
    return result;
  }

  /**
   * Removes parties matching `match` from the versions of the report and the history entries of its parties. A report
   * saves its parties anew each time, so earlier entries of the same person have other IDs.
   */
  private async scrub(em: EntityManager, reportId: string, match: (stored: Record<string, unknown>) => boolean): Promise<void> {
    for (const revision of await em.find(ReportRevisionEntity, { report: reportId })) {
      const parties = revision.content['involvedParties'];
      if (!Array.isArray(parties) || !parties.some((p) => match(p as Record<string, unknown>))) continue;
      const content = { ...revision.content, involvedParties: parties.map((p) => (match(p as Record<string, unknown>) ? { ...(p as object), ...ANONYMOUS } : p)) };
      await em.nativeUpdate(ReportRevisionEntity, { id: revision.id }, { content });
    }
    const entries = await em.find(HistoryEntry, { entity: 'incidents.involved_party', parentEntity: 'incidents.report', parentId: reportId });
    const named = entries.filter((e) => match(Object.fromEntries(Object.entries(e.changes).map(([field, change]) => [field, change.new ?? change.old]))));
    if (named.length) await em.nativeDelete(HistoryEntry, { id: { $in: named.map((e) => e.id) } });
  }

  // ----- Retention category „Angaben zu Beteiligten“ -----

  private async candidates(query: RetentionQuery) {
    const incidents = await this.em.fork().find(
      IncidentEntity,
      { alarmedAt: { $lt: query.cutoff }, anonymizedAt: null, reports: { involvedParties: { name: { $ne: '' } } } },
      { orderBy: { alarmedAt: 'asc' } },
    );
    return incidents.map((i) => ({ id: i.id, label: `${i.dispatchNumber} · ${i.alarmKeyword}`, neutralLabel: `${i.dispatchNumber} · ${i.alarmKeyword}`, eventDate: berlinDay(i.alarmedAt) }));
  }

  private async export(ids: readonly string[]) {
    const em = this.em.fork();
    const incidents = await em.find(IncidentEntity, { id: { $in: [...ids] } }, { populate: ['reports.involvedParties'] });
    return incidents.map((i) => {
      const parties = i.reports.getItems().flatMap((r) => r.involvedParties.getItems());
      return {
        id: i.id,
        title: `${i.dispatchNumber} · ${i.alarmKeyword}`,
        fields: parties.map((p) => ({ label: ROLES[p.role], value: [p.name, address(p), p.phone, p.licensePlate].filter(Boolean).join(', ') })),
        data: { parties: parties.map((p) => wrap(p).toObject()) },
        attachments: [],
      };
    });
  }

  /** All parties of the incidents, with their earlier versions and history. */
  private async anonymizeIncidents(ids: readonly string[]): Promise<number> {
    const em = this.em.fork();
    const reports = await em.find(ReportEntity, { incident: { $in: [...ids] } }, { fields: ['id'] });
    for (const report of reports) {
      await this.scrub(em, report.id, () => true);
      await em.nativeUpdate(InvolvedPartyEntity, { report: report.id }, ANONYMOUS);
    }
    return ids.length;
  }
}
