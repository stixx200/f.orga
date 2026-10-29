import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { type DescribeContext, HistoryEntry, type PersonDataSection, ThirdPartyRegistry } from '@forga/core-api';
import type { Language, LocalizedText, ThirdPartyErasureOutcome } from '@forga/core-contracts';
import type { Debtor, NoticeStatus } from '@forga/cost-recovery-contracts';
import { AddressBookEntity, NoticeEntity } from '../cost-recovery.entities.js';

export const DEBTORS_SOURCE = 'cost-recovery.debtors';
/** Address book entries have IDs of their own; debtors of a notice are `<notice>:<index>`. */
const BOOK = 'book:';

const STATUS: Record<NoticeStatus, LocalizedText> = {
  draft: { de: 'Entwurf', en: 'Draft' },
  review: { de: 'in Prüfung', en: 'In review' },
  issued: { de: 'erlassen', en: 'Issued' },
  'handed-over': { de: 'an die Kasse übergeben', en: 'Handed over to the treasury' },
  paid: { de: 'bezahlt', en: 'Paid' },
  objection: { de: 'Widerspruch', en: 'Objection' },
  cancelled: { de: 'aufgehoben', en: 'Cancelled' },
  amended: { de: 'geändert', en: 'Amended' },
  discarded: { de: 'verworfen', en: 'Discarded' },
};
/** Drafts were never sent: the debtor can be removed. Everything else is an accounting record of its own retention. */
const ERASABLE: readonly NoticeStatus[] = ['draft'];

const berlinDay = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(date);
const address = (d: { street: string; postalCode: string; city: string }) => [d.street, [d.postalCode, d.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
const matches = (d: { name: string; street: string; city: string }, q: string) => [d.name, d.street, d.city].some((v) => v.toLowerCase().includes(q.toLowerCase()));

/**
 * Debtors of cost notices and the address book of the cost recovery are no persons of the master data (L14): search,
 * access report and erasure for "another person". Issued notices are accounting records: their debtors stay until the
 * notice itself goes (retention category `cost-recovery.notices`).
 */
@Injectable()
export class DebtorsThirdParty {
  constructor(private readonly em: EntityManager) {}

  register(registry: ThirdPartyRegistry): void {
    registry.register({
      key: DEBTORS_SOURCE,
      module: 'cost-recovery',
      search: (query, language) => this.search(query, language),
      describe: (ids, ctx) => this.describe(ids, ctx),
      erase: (ids) => this.erase(ids),
    });
  }

  async search(query: string, language: Language) {
    const em = this.em.fork();
    const like = `%${query.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
    const rows: { id: string }[] = await em.getConnection().execute(`select "id" from "cost_recovery"."notice" where "debtors"::text ilike ? limit 100`, [like]);
    const notices = rows.length ? await em.find(NoticeEntity, { id: { $in: rows.map((r) => r.id) } }) : [];
    const book = await em.find(AddressBookEntity, { $or: [{ name: { $ilike: like } }, { street: { $ilike: like } }, { city: { $ilike: like } }] }, { limit: 100 });
    const de = language === 'de';
    return [
      ...notices.flatMap((n) =>
        n.debtors
          .map((d, index) => ({ d, index }))
          .filter(({ d }) => d.name && matches(d, query))
          .map(({ d, index }) => ({
            id: `${n.id}:${index}`,
            name: d.name,
            address: address(d),
            reference: `${de ? 'Kostenbescheid' : 'Cost notice'} ${n.number}`,
            role: d.role || (de ? 'Kostenschuldner' : 'Debtor'),
            date: berlinDay(n.issuedAt ?? n.createdAt),
            details: STATUS[n.status as NoticeStatus][language],
          })),
      ),
      ...book.map((b) => ({
        id: `${BOOK}${b.id}`,
        name: b.name,
        address: address(b),
        reference: de ? 'Adressbuch Kostenersatz' : 'Address book of the cost recovery',
        role: b.role || (de ? 'Kostenschuldner' : 'Debtor'),
        date: null,
        details: '',
      })),
    ];
  }

  private split(ids: readonly string[]): { book: string[]; debtors: { noticeId: string; index: number; id: string }[] } {
    const book = ids.filter((id) => id.startsWith(BOOK)).map((id) => id.slice(BOOK.length));
    const debtors = ids
      .filter((id) => !id.startsWith(BOOK))
      .map((id) => {
        const [noticeId, index] = id.split(':');
        return { noticeId, index: Number(index), id };
      })
      .filter((d) => /^[0-9a-f-]{36}$/i.test(d.noticeId) && Number.isInteger(d.index));
    return { book: book.filter((id) => /^[0-9a-f-]{36}$/i.test(id)), debtors };
  }

  /** „Kostenbescheide“: number, date, incident, state, amount and the data stored about the debtor; the address book entry. */
  async describe(ids: readonly string[], ctx: DescribeContext): Promise<PersonDataSection[]> {
    const em = this.em.fork();
    const { book, debtors } = this.split(ids);
    const notices = new Map((debtors.length ? await em.find(NoticeEntity, { id: { $in: [...new Set(debtors.map((d) => d.noticeId))] } }) : []).map((n) => [n.id, n]));
    const rows = debtors.flatMap(({ noticeId, index }) => {
      const notice = notices.get(noticeId);
      const debtor: Debtor | undefined = notice?.debtors[index];
      if (!notice || !debtor) return [];
      return [
        [
          notice.number,
          ctx.date(notice.issuedAt ?? notice.createdAt),
          `${notice.dispatchNumber} · ${notice.alarmKeyword}`,
          ctx.text(STATUS[notice.status as NoticeStatus]),
          ctx.money(notice.positions.reduce((sum, p) => sum + p.amount, 0)),
          [debtor.name, address(debtor), debtor.role].filter(Boolean).join('; '),
        ],
      ];
    });
    const entries = book.length ? await em.find(AddressBookEntity, { id: { $in: book } }) : [];
    const sections: PersonDataSection[] = [];
    if (rows.length || entries.length) {
      sections.push({
        key: 'cost-recovery.debtors',
        title: ctx.t('Kostenbescheide', 'Cost notices'),
        activity: 'cost-recovery.notices',
        categories: [ctx.t('Name, Anschrift, Einsatz, Beträge, Zahlungen', 'Name, address, incident, amounts, payments')],
        blocks: [
          ...(rows.length
            ? [
                {
                  kind: 'table' as const,
                  columns: [ctx.t('Bescheid', 'Notice'), ctx.t('Datum', 'Date'), ctx.t('Einsatz', 'Incident'), ctx.t('Stand', 'State'), ctx.t('Betrag', 'Amount'), ctx.t('Gespeicherte Angaben zu Ihnen', 'Data stored about you')],
                  rows,
                },
              ]
            : []),
          ...entries.map((b) => ({
            kind: 'fields' as const,
            title: ctx.t('Adressbuch des Kostenersatzes', 'Address book of the cost recovery'),
            rows: [
              { label: ctx.t('Name', 'Name'), value: b.name },
              { label: ctx.t('Anschrift', 'Address'), value: ctx.value(address(b)) },
              { label: ctx.t('Rolle', 'Role'), value: ctx.value(b.role) },
              { label: ctx.t('Notiz', 'Note'), value: ctx.value(b.notes) },
            ],
          })),
        ],
      });
    }
    return sections;
  }

  /**
   * Address book entries are deleted with their history; debtors of drafts are emptied (with the notice's history entries
   * naming them). Debtors of issued, paid, cancelled or discarded notices are kept as accounting records until the notice
   * goes by its retention (`privacy.thirdPartyFinancialRecord`).
   */
  async erase(ids: readonly string[]): Promise<Map<string, { outcome: ThirdPartyErasureOutcome; code: string | null }>> {
    const em = this.em.fork();
    const { book, debtors } = this.split(ids);
    const result = new Map<string, { outcome: ThirdPartyErasureOutcome; code: string | null }>();
    if (book.length) {
      const existing = await em.find(AddressBookEntity, { id: { $in: book } }, { fields: ['id'] });
      await em.nativeDelete(HistoryEntry, { entity: 'cost_recovery.address_book', entityId: { $in: existing.map((b) => b.id) } });
      await em.nativeDelete(AddressBookEntity, { id: { $in: existing.map((b) => b.id) } });
      for (const b of existing) result.set(`${BOOK}${b.id}`, { outcome: 'deleted', code: null });
    }
    for (const { noticeId, index, id } of debtors) {
      const notice = await em.findOne(NoticeEntity, noticeId);
      const debtor = notice?.debtors[index];
      if (!notice || !debtor) continue;
      if (!ERASABLE.includes(notice.status as NoticeStatus)) {
        result.set(id, { outcome: 'kept', code: 'privacy.thirdPartyFinancialRecord' });
        continue;
      }
      const name = debtor.name;
      const updated = notice.debtors.map((d, i) => (i === index ? { ...d, name: '', street: '', postalCode: '', city: '', role: '' } : d));
      await em.nativeUpdate(NoticeEntity, { id: notice.id }, { debtors: updated });
      // Earlier values of the debtors are in the history of the draft.
      if (name) {
        await em
          .getConnection()
          .execute(`update "core"."history" set "changes" = "changes" - 'debtors' where "entity" = 'cost_recovery.notice' and "entity_id" = ? and ("changes"->'debtors')::text ilike ?`, [notice.id, `%${name.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`]);
      }
      result.set(id, { outcome: 'anonymized', code: null });
    }
    return result;
  }
}
