import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { ListColumn } from '@forga/core-contracts';
import { berlinDate, type ListDefinition } from '@forga/core-api';
import { EntityManager } from '@mikro-orm/core';
import { ORGANIZATION, type Organization } from '@forga/masterdata-contracts';
import { PromotionListEntity } from '../promotions.entities.js';
import { PromotionsService, READ } from '../promotions/promotions.service.js';

const col = (key: string, de: string, en: string, width?: number, align?: ListColumn['align']): ListColumn => ({
  key,
  label: { de, en },
  ...(width ? { width } : {}),
  ...(align ? { align } : {}),
});
const OnDate = z.object({ on: z.iso.date().optional() });
const ListParams = z.object({ listId: z.uuid(), departmentId: z.uuid().optional() });
const STATE = {
  fulfilled: { de: 'erfüllt', en: 'fulfilled' },
  preview: { de: 'demnächst', en: 'soon' },
  missing: { de: 'offen', en: 'open' },
  excluded: { de: 'ausgeschlossen', en: 'excluded' },
  manual: { de: 'außerhalb der Regel', en: 'outside the rules' },
};
const DECISION = {
  promote: { de: 'befördern', en: 'promote' },
  defer: { de: 'zurückgestellt', en: 'deferred' },
  reject: { de: 'nicht befördern', en: 'not promoted' },
};

/** List templates of the promotions module. */
@Injectable()
export class PromotionsLists {
  constructor(
    private readonly promotions: PromotionsService,
    @Inject(ORGANIZATION) private readonly organization: Organization,
    private readonly em: EntityManager,
  ) {}

  definitions(): ListDefinition<never>[] {
    return [this.candidates(), this.list()] as ListDefinition<never>[];
  }

  /** A promotion list with the basis of each proposal, in total or for one department. */
  private list(): ListDefinition<z.infer<typeof ListParams>> {
    return {
      id: 'promotions.list',
      name: { de: 'Beförderungsliste', en: 'Promotion list' },
      description: { de: 'Vorschläge einer Liste mit Grundlage und Entscheidung, gesamt oder je Abteilung', en: 'Proposals of a list with basis and decision, in total or per department' },
      permission: READ,
      personalData: 'names',
      parameters: [
        {
          key: 'listId',
          label: { de: 'Beförderungsliste', en: 'Promotion list' },
          type: 'choice',
          required: true,
          choices: async (_user, query) => {
            const words = query.toLowerCase().split(/\s+/).filter(Boolean);
            return (await this.em.fork().find(PromotionListEntity, {}, { orderBy: { referenceDate: 'desc' } }))
              .filter((l) => words.every((w) => l.title.toLowerCase().includes(w)))
              .map((l) => ({ value: l.id, label: l.title, description: l.referenceDate }));
          },
        },
        { key: 'departmentId', label: { de: 'Abteilung', en: 'Department' }, type: 'department' },
      ],
      schema: ListParams,
      orientation: 'landscape',
      signatureColumn: false,
      columns: [
        col('name', 'Name', 'Name', 2),
        col('department', 'Abteilung', 'Department', 1.3),
        col('rank', 'Dienstgrad', 'Rank'),
        col('since', 'seit', 'since'),
        col('target', 'Beförderung zum', 'Promotion to'),
        col('basis', 'Grundlage', 'Basis', 3),
        col('decision', 'Entscheidung', 'Decision', 1.2),
        col('comment', 'Bemerkung', 'Comment', 2),
      ],
      rows: async (user, params, language) => {
        const [list, config, ranks, departments] = await Promise.all([this.promotions.list(user, params.listId), this.promotions.config(), this.organization.catalog('rank'), this.organization.departments()]);
        const abbreviation = (key: string | null) => {
          const r = ranks.find((x) => x.key === key);
          return r ? String(r.attributes['abbreviation'] || r.name[language]) : (key ?? '');
        };
        const basis = (ruleKey: string | null, state: keyof typeof STATE) => {
          const rule = config.rules.find((r) => r.key === ruleKey);
          return state === 'manual' || !rule ? STATE.manual[language] : rule.description[language] || rule.key;
        };
        const department = departments.find((d) => d.id === params.departmentId);
        const entries = list.entries.filter((e) => !params.departmentId || e.departmentId === params.departmentId);
        return {
          subtitle: [list.title, `${language === 'de' ? 'Stichtag' : 'Reference date'} ${list.referenceDate}`, department?.name].filter(Boolean).join(' · '),
          personIds: entries.map((e) => e.personId),
          rows: entries.map((e) => ({
              name: `${e.lastName}, ${e.firstName}`,
              department: departments.find((d) => d.id === e.departmentId)?.name ?? '',
              rank: abbreviation(e.rank),
              since: e.rankSince,
              target: abbreviation(e.targetRank),
              basis: basis(e.ruleKey, e.state),
              decision: DECISION[e.decision][language],
              comment: e.comment,
            })),
        };
      },
    };
  }

  /** Who can be promoted on a date, for the committee meeting. */
  private candidates(): ListDefinition<z.infer<typeof OnDate>> {
    return {
      id: 'promotions.candidates',
      name: { de: 'Beförderungsvorschau', en: 'Promotion preview' },
      description: {
        de: 'Erfüllte und demnächst erfüllte Beförderungen',
        en: 'Promotions fulfilled or fulfilled soon',
      },
      permission: READ,
      personalData: 'names',
      parameters: [
        {
          key: 'on',
          label: { de: 'Stichtag', en: 'Reference date' },
          type: 'date',
        },
      ],
      schema: OnDate,
      columns: [
        col('name', 'Name', 'Name', 2),
        col('department', 'Abteilung', 'Department', 1.5),
        col('rank', 'Dienstgrad', 'Rank'),
        col('since', 'seit', 'since'),
        col('target', 'Beförderung zum', 'Promotion to'),
        col('state', 'Stand', 'State'),
        col('metOn', 'erfüllt ab', 'met on'),
      ],
      rows: async (user, params, language) => {
        const on = params.on ?? berlinDate();
        const [candidates, ranks, departments] = await Promise.all([this.promotions.candidates(user, on), this.organization.catalog('rank'), this.organization.departments()]);
        const abbreviation = (key: string | null) => {
          const r = ranks.find((x) => x.key === key);
          return r ? String(r.attributes['abbreviation'] || r.name[language]) : (key ?? '');
        };
        const shown = candidates.filter((c) => c.state === 'fulfilled' || c.state === 'preview');
        return {
          subtitle: on,
          personIds: shown.map((c) => c.personId),
          rows: shown.map((c) => ({
              name: `${c.lastName}, ${c.firstName}`,
              department: departments.find((d) => d.id === c.departmentId)?.name ?? '',
              rank: abbreviation(c.rank),
              since: c.rankSince,
              target: abbreviation(c.targetRank),
              state: STATE[c.state][language],
              metOn: c.metOn,
            })),
        };
      },
    };
  }
}
