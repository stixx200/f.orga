import { Injectable } from '@nestjs/common';
import { EntityManager, wrap } from '@mikro-orm/core';
import { berlinDate, type DeadlineInput, type DeadlineProvider } from '@forga/core-api';
import type { LocalizedText } from '@forga/core-contracts';
import type { ConditionKey } from '@forga/respiratory-protection-contracts';
import { EvidenceEntity, StatusEntity } from '../respiratory-protection.entities.js';
import { EVIDENCE, EvidenceService, SELF } from '../evidence/evidence.service.js';

const TITLES: Partial<Record<ConditionKey, LocalizedText>> = {
  examination: { de: 'Eignungsuntersuchung fällig', en: 'Medical examination due' },
  briefing: { de: 'Atemschutz-Unterweisung fällig', en: 'BA briefing due' },
  'stress-exercise': { de: 'Belastungsübung fällig', en: 'Stress exercise due' },
  exercise: { de: 'Einsatzübung unter Atemschutz fällig', en: 'Exercise under BA due' },
  'chemical-suit': { de: 'CSA-Übung fällig', en: 'Chemical suit exercise due' },
};
const OWN_TITLES: Partial<Record<ConditionKey, LocalizedText>> = {
  examination: { de: 'Ihre Eignungsuntersuchung ist fällig', en: 'Your medical examination is due' },
  briefing: { de: 'Ihre Atemschutz-Unterweisung ist fällig', en: 'Your BA briefing is due' },
  'stress-exercise': { de: 'Ihre Belastungsübung ist fällig', en: 'Your stress exercise is due' },
  exercise: { de: 'Ihre Einsatzübung unter Atemschutz ist fällig', en: 'Your exercise under BA is due' },
  'chemical-suit': { de: 'Ihre CSA-Übung ist fällig', en: 'Your chemical suit exercise is due' },
};

/** Export and deadlines of the respiratory protection module. */
@Injectable()
export class RespiratoryProtectionData implements DeadlineProvider {
  readonly module = 'respiratory-protection';

  constructor(
    private readonly em: EntityManager,
    private readonly evidence: EvidenceService,
  ) {}

  /**
   * One deadline per condition of each wearer that expires (or is missing), for those who record evidence in the
   * wearer's department (`evidence`), and the same for the wearer, who sees it in "My area" and the weekly e-mail.
   * The examination deadline only names the due date, like the status those responsible see; results and findings
   * stay with the examinations permission.
   */
  async deadlines(asOf: string): Promise<DeadlineInput[]> {
    const rule = await this.evidence.rule();
    const statuses = await this.evidence.statuses(await this.evidence.wearers(null), asOf);
    const own = statuses.flatMap((s) =>
      s.conditions
        .filter((c) => OWN_TITLES[c.key])
        .map((c) => ({
          id: `own:${c.key}:${s.personId}`,
          kind: `breathing-apparatus-own-${c.key}`,
          title: OWN_TITLES[c.key]!,
          subject: { type: 'core.me', id: s.personId, label: `${s.firstName} ${s.lastName}` },
          dueOn: c.dueOn ?? berlinDate(),
          leadDays: rule.leadDays,
          departmentIds: s.departmentIds,
          permission: SELF,
          personIds: [s.personId],
        })),
    );
    return [...own, ...statuses.flatMap((s) =>
      s.conditions
        .filter((c) => TITLES[c.key])
        .map((c) => ({
          id: `${c.key}:${s.personId}`,
          kind: `breathing-apparatus-${c.key}`,
          title: TITLES[c.key]!,
          subject: { type: 'masterdata.person', id: s.personId, label: `${s.firstName} ${s.lastName}` },
          dueOn: c.dueOn ?? berlinDate(),
          leadDays: rule.leadDays,
          departmentIds: s.departmentIds,
          permission: EVIDENCE,
        })),
    )];
  }

  async exportAll(): Promise<Record<string, unknown>> {
    const em = this.em.fork();
    return {
      evidence: (await em.find(EvidenceEntity, {})).map((e) => wrap(e).toObject()),
      status: (await em.find(StatusEntity, {})).map((e) => wrap(e).toObject()),
    };
  }

  async exportPerson(personId: string): Promise<Record<string, unknown>> {
    return { evidence: (await this.em.fork().find(EvidenceEntity, { personId }, { orderBy: { date: 'asc' } })).map((e) => wrap(e).toObject()) };
  }
}
