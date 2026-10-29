import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import type { ErasureArea } from '@forga/core-contracts';
import { ACCESS_LOG_RETENTION } from '@forga/privacy-contracts';
import { type DescribeContext, type ErasureAreaInput, type ErasureContext, type ExportSource, HistoryEntry, type PersonDataHandler, type PersonDataSection, User } from '@forga/core-api';
import { AccessLogEntity, AccessLogStore } from './access-log.js';
import { PrivacyDocument } from './access-report/privacy-document.entity.js';
import { ConsentEntity, ConsentService } from './consents.js';
import { NoticeAcknowledgementEntity, PrivacyInformationEntity, ProcessingRestrictionEntity } from './person-privacy.js';
import { PrivacyBreachEntity, PrivacyRequestEntity } from './privacy.entities.js';

const REASONS: Record<string, { de: string; en: string }> = {
  'accuracy-contested': { de: 'Richtigkeit bestritten', en: 'Accuracy contested' },
  'unlawful-processing': { de: 'Unrechtmäßige Verarbeitung', en: 'Unlawful processing' },
  'legal-claims': { de: 'Rechtsansprüche', en: 'Legal claims' },
  'objection-pending': { de: 'Widerspruch wird geprüft', en: 'Objection under review' },
  retention: { de: 'Aufbewahrungsfrist läuft', en: 'Retention period running' },
};

/**
 * What the module stores about persons: requests, consents, restriction, information under Art. 13/14, the
 * acknowledgement of the privacy notice and the read log. Full export, access report (`describePerson`), erasure and
 * anonymisation.
 */
@Injectable()
export class PrivacyData implements ExportSource, PersonDataHandler {
  constructor(
    private readonly em: EntityManager,
    private readonly consents: ConsentService,
    private readonly accessLog: AccessLogStore,
  ) {}

  /** Requests, consents, restrictions, information and data breaches; access reports without their files. */
  async all(): Promise<Record<string, unknown>> {
    const em = this.em.fork();
    const [requests, consents, restrictions, information, acknowledgements, breaches, documents] = await Promise.all([
      em.find(PrivacyRequestEntity, {}, { orderBy: { receivedOn: 'asc' } }),
      em.find(ConsentEntity, {}, { orderBy: { givenOn: 'asc' } }),
      em.find(ProcessingRestrictionEntity, {}),
      em.find(PrivacyInformationEntity, {}),
      em.find(NoticeAcknowledgementEntity, {}),
      em.find(PrivacyBreachEntity, {}, { orderBy: { discoveredAt: 'asc' } }),
      em.find(PrivacyDocument, {}, { orderBy: { createdAt: 'asc' }, exclude: ['content'] }),
    ]);
    return { requests, consents, restrictions, information, noticeAcknowledgements: acknowledgements, breaches, accessReports: documents };
  }

  /** Everything about one person (data access request as JSON). */
  async person(personId: string): Promise<Record<string, unknown>> {
    const em = this.em.fork();
    const privacyRequests = (await em.find(PrivacyRequestEntity, { personId }, { orderBy: { receivedOn: 'asc' } })).map((r) => ({
      kind: r.kind,
      receivedOn: r.receivedOn,
      channel: r.channel,
      content: r.content,
      dueOn: r.dueOn,
      extendedUntil: r.extendedUntil ?? null,
      status: r.status,
      closedOn: r.closedOn ?? null,
      rejectionReason: r.rejectionReason,
      rectification: r.rectification ? { area: r.rectification.area, wrong: r.rectification.wrong, correct: r.rectification.correct, correctedAt: r.rectification.correctedAt } : null,
    }));
    // Consents with the version consented to (L9) and accesses to especially protected data (L15).
    const consents = (await em.find(ConsentEntity, { personId }, { orderBy: { givenOn: 'asc' } })).map((c) => ({
      key: c.key,
      version: c.definitionVersion,
      title: c.title,
      text: c.text,
      givenOn: c.givenOn,
      givenVia: c.givenVia,
      withdrawnOn: c.withdrawnOn ?? null,
      withdrawnVia: c.withdrawnVia ?? null,
      supersededOn: c.supersededOn ?? null,
    }));
    const accessLog = (await em.find(AccessLogEntity, { personId }, { orderBy: { day: 'asc' } })).map((a) => ({ userId: a.userId, area: a.area, day: a.day, count: a.count }));
    const restriction = await em.findOne(ProcessingRestrictionEntity, { personId });
    const information = await em.findOne(PrivacyInformationEntity, { personId });
    const userIds = (await em.find(User, { personId }, { fields: ['id'] })).map((u) => u.id);
    const acknowledgements = userIds.length ? await em.find(NoticeAcknowledgementEntity, { userId: { $in: userIds } }) : [];
    return {
      privacyRequests,
      consents,
      accessLog,
      restriction: restriction ? { restrictedAt: restriction.restrictedAt.toISOString(), reason: restriction.reason, until: restriction.until ?? null } : null,
      information: information ? { informedOn: information.informedOn, via: information.via } : null,
      noticeAcknowledgements: acknowledgements.map((a) => ({ userId: a.userId, version: a.version, acknowledgedAt: a.acknowledgedAt.toISOString() })),
    };
  }

  /** Consents (L9), the restriction of processing and accesses to especially protected data (L15). */
  async describePerson(personId: string, ctx: DescribeContext): Promise<PersonDataSection[]> {
    const consents = await this.consents.describe(personId, ctx);
    const restriction = await this.describeRestriction(personId, ctx);
    const accesses = await this.describeAccesses(personId, ctx);
    return [consents, restriction, accesses].filter((s): s is PersonDataSection => s !== null);
  }

  private async describeRestriction(personId: string, ctx: DescribeContext): Promise<PersonDataSection | null> {
    const em = this.em.fork();
    const [restriction, information] = await Promise.all([em.findOne(ProcessingRestrictionEntity, { personId }), em.findOne(PrivacyInformationEntity, { personId })]);
    if (!restriction && !information) return null;
    return {
      key: 'privacy.person',
      title: ctx.t('Einschränkung und Information', 'Restriction and information'),
      activity: 'privacy.data-protection',
      categories: [ctx.t('Einschränkung der Verarbeitung, Information nach Art. 13/14', 'Restriction of processing, information under Art. 13/14')],
      blocks: [
        {
          kind: 'fields',
          rows: [
            ...(restriction
              ? [
                  { label: ctx.t('Verarbeitung eingeschränkt seit', 'Processing restricted since'), value: ctx.date(restriction.restrictedAt) },
                  { label: ctx.t('Grund', 'Reason'), value: ctx.text(REASONS[restriction.reason] ?? { de: restriction.reason, en: restriction.reason }) },
                  { label: ctx.t('Geplantes Ende', 'Planned end'), value: ctx.date(restriction.until ?? null) },
                ]
              : []),
            ...(information ? [{ label: ctx.t('Information erteilt am', 'Informed on'), value: ctx.date(information.informedOn) }] : []),
          ],
        },
      ],
    };
  }

  /**
   * "Zugriffe auf besonders geschützte Daten": from the read log, per function (never the name of the reader), area and
   * day; own accesses are not logged.
   */
  private async describeAccesses(personId: string, ctx: DescribeContext): Promise<PersonDataSection | null> {
    const rows = await this.accessLog.forPerson(personId);
    if (!rows.length) return null;
    return {
      key: 'privacy.access-log',
      title: ctx.t('Zugriffe auf besonders geschützte Daten', 'Access to especially protected data'),
      activity: 'privacy.data-protection',
      categories: [ctx.t('Leseprotokoll', 'Read log')],
      blocks: [
        {
          kind: 'table',
          title: ctx.t('Wer hat wann auf Gesundheitsdaten und andere besonders geschützte Daten zugegriffen', 'Who accessed health data and other especially protected data when'),
          columns: [ctx.t('Tag', 'Day'), ctx.t('Funktion', 'Function'), ctx.t('Bereich', 'Area'), ctx.t('Zugriffe', 'Accesses')],
          rows: await Promise.all(rows.map(async (r) => [ctx.date(r.day), await ctx.actor(r.userId), ctx.text(this.accessLog.areaLabel(r.area)), String(r.count)])),
        },
      ],
    };
  }

  /**
   * Complete anonymisation (retention plan): requests keep kind, dates and outcome as proof without the texts about the
   * person; stored access reports, restriction, information and the acknowledgements of linked users are deleted.
   */
  async anonymize(personIds: readonly string[]): Promise<void> {
    await this.anonymizeRequests(personIds);
    const em = this.em.fork();
    await em.nativeDelete(ProcessingRestrictionEntity, { personId: { $in: [...personIds] } });
    await em.nativeDelete(PrivacyInformationEntity, { personId: { $in: [...personIds] } });
    const userIds = (await em.find(User, { personId: { $in: [...personIds] } }, { fields: ['id'] })).map((u) => u.id);
    if (userIds.length) await em.nativeDelete(NoticeAcknowledgementEntity, { userId: { $in: userIds } });
  }

  /** Erasure check: the data protection records and the read log about the person. */
  async erasure(personId: string, ctx: ErasureContext): Promise<ErasureAreaInput[]> {
    const em = this.em.fork();
    const areas: ErasureAreaInput[] = [];
    const requests = await em.count(PrivacyRequestEntity, { personId });
    const consents = await em.count(ConsentEntity, { personId });
    const reports = await em.count(PrivacyDocument, { personId, deletedAt: null });
    if (requests || consents || reports) {
      const parts = [
        requests && { de: `${requests} ${requests === 1 ? 'Anfrage' : 'Anfragen'}`, en: `${requests} ${requests === 1 ? 'request' : 'requests'}` },
        consents && { de: `${consents} ${consents === 1 ? 'Einwilligung' : 'Einwilligungen'}`, en: `${consents} ${consents === 1 ? 'consent' : 'consents'}` },
        reports && { de: `${reports} ${reports === 1 ? 'Auskunft' : 'Auskünfte'}`, en: `${reports} access ${reports === 1 ? 'report' : 'reports'}` },
      ].filter((p): p is { de: string; en: string } => Boolean(p));
      areas.push({
        key: 'privacy.requests',
        title: { de: 'Datenschutz', en: 'Data protection' },
        data: { de: parts.map((p) => p.de).join(', '), en: parts.map((p) => p.en).join(', ') },
        count: requests + consents + reports,
        outcome: 'anonymize',
        keepUntil: null,
        reason: { de: 'Art, Daten und Ergebnis bleiben als Nachweis, Texte und Auskünfte werden gelöscht', en: 'Kind, dates and outcome stay as proof, texts and access reports are deleted' },
      });
    }
    // The read log serves the security of processing (Art. 32): it stays for its own period.
    const reads = await em.find(AccessLogEntity, { personId }, { fields: ['id', 'day'], orderBy: { day: 'desc' } });
    if (reads.length) {
      const hold = ctx.retain(ACCESS_LOG_RETENTION, reads[0].day);
      areas.push({
        key: 'privacy.access-log',
        title: { de: 'Leseprotokoll', en: 'Read log' },
        data: { de: `${reads.length} Einträge im Leseprotokoll`, en: `${reads.length} read log entries` },
        count: reads.length,
        // Without a running period the entries are deleted.
        outcome: hold ? 'keep' : 'delete',
        keepUntil: hold?.until ?? null,
        reason: hold?.reason ?? null,
      });
    }
    return areas;
  }

  /** Erases the areas of the check: data protection records are anonymised, the read log deleted. */
  async erase(personId: string, areas: readonly ErasureArea[]): Promise<void> {
    const keys = new Set(areas.map((a) => a.key));
    if (keys.has('privacy.requests')) await this.anonymizeRequests([personId]);
    if (keys.has('privacy.access-log')) await this.em.fork().nativeDelete(AccessLogEntity, { personId });
  }

  /** Data protection requests keep kind, dates and outcome; stored access reports are deleted. */
  private async anonymizeRequests(personIds: readonly string[]): Promise<void> {
    const em = this.em.fork();
    const requests = await em.find(PrivacyRequestEntity, { personId: { $in: [...personIds] } }, { fields: ['id'] });
    if (requests.length) {
      const requestIds = requests.map((r) => r.id);
      await em.nativeUpdate(PrivacyRequestEntity, { id: { $in: requestIds } }, { content: '', identityNote: '', notes: '', activity: '', rectification: null });
      await em.nativeDelete(HistoryEntry, { entity: 'privacy.request', entityId: { $in: requestIds } });
    }
    await em.nativeUpdate(PrivacyDocument, { personId: { $in: [...personIds] }, deletedAt: null }, { content: null, deletedAt: new Date() });
  }
}
