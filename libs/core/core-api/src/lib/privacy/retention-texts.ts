import { Injectable } from '@nestjs/common';
import { type Language, type LocalizedText, RetentionRule, retentionRuleKey } from '@forga/core-contracts';
import { RetentionRegistry } from '../retention/retention-registry.js';
import { RetentionService } from '../retention/retention.service.js';

const UNTIL_SET: LocalizedText = { de: 'bis zur Festlegung einer Frist', en: 'until a period is set' };

/**
 * Readable retention periods of processing activities from `privacy.retention`, e.g. „Personalakte: 30 Jahre nach
 * Austritt“, or „bis zur Festlegung einer Frist“ (access report, register of processing activities).
 */
@Injectable()
export class RetentionTexts {
  constructor(
    private readonly registry: RetentionRegistry,
    private readonly retention: RetentionService,
  ) {}

  /** A function giving the periods of the retention categories of an activity in a language. */
  async load(): Promise<(categories: readonly string[], language: Language) => string> {
    const rules = await this.retention.storedRules();
    const parts = new Map<string, { name: LocalizedText; rule: ReturnType<typeof RetentionRule.parse>; event: LocalizedText }[]>();
    for (const definition of this.registry.categories.values()) {
      const subtypes = (await definition.subtypes?.()) ?? [];
      const rows = [{ key: definition.key, name: definition.otherName && subtypes.length ? definition.otherName : definition.name }, ...subtypes.map((s) => ({ key: retentionRuleKey(definition.key, s.key), name: s.name }))];
      const texts: { name: LocalizedText; rule: ReturnType<typeof RetentionRule.parse>; event: LocalizedText }[] = [];
      for (const row of rows) {
        const stored = rules[row.key];
        if (row.key !== definition.key && !stored) continue;
        texts.push({ name: row.name, rule: stored ?? RetentionRule.parse(definition.defaultRule ?? {}), event: definition.event });
      }
      parts.set(definition.key, texts);
    }
    return (categories, language) => {
      const texts = categories.flatMap((key) => parts.get(key) ?? []).map(({ name, rule, event }) => {
        const period =
          rule.years && rule.action !== 'none'
            ? language === 'de'
              ? `${rule.years} Jahre nach ${event.de}`
              : `${rule.years} years after ${event.en}`
            : UNTIL_SET[language];
        return `${name[language]}: ${period}`;
      });
      return texts.length ? texts.join('; ') : UNTIL_SET[language];
    };
  }

  /** The periods in both languages. */
  async localized(): Promise<(categories: readonly string[]) => LocalizedText> {
    const text = await this.load();
    return (categories) => ({ de: text(categories, 'de'), en: text(categories, 'en') });
  }
}
