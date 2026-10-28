import { Injectable } from '@nestjs/common';
import { type ImportLookupExtras, normalizeHeading, SettingsService } from '@forga/core-api';
import type { LocalizedText } from '@forga/core-contracts';
import { type ImportFunctionRules, ImportFunctionTarget, importFunctionTargetKey } from '@forga/incidents-contracts';

const SECTION = 'incidents.importFunctionRules';

const NAMES: Record<ImportFunctionTarget, LocalizedText> = {
  'during-working-hours': { de: 'Keine Funktion – Einsatz während der Arbeitszeit beim Dienstherrn', en: 'No function – assignment during working hours for the employer' },
  'loss-of-earnings': { de: 'Keine Funktion – Verdienstausfall', en: 'No function – loss of earnings' },
  ignore: { de: 'Keine Funktion (ignorieren)', en: 'No function (ignore)' },
};

/** The target of a key of the lookup `function`, if it is one of the targets below. */
export function functionTargetOf(key: string | undefined): ImportFunctionTarget | undefined {
  return ImportFunctionTarget.options.find((target) => importFunctionTargetKey(target) === key);
}

/**
 * Function texts of the MP-Feuer import that are no function (e.g. "Arbeitszeit Stadt Erbach" for assignments during
 * working hours): offered as extra targets of the lookup `function` and remembered in the settings section
 * `incidents.importFunctionRules`, so the next import applies them without asking.
 */
@Injectable()
export class ImportFunctionTargets {
  constructor(private readonly settings: SettingsService) {}

  extras(): ImportLookupExtras {
    return {
      kind: 'function',
      entries: async () => ImportFunctionTarget.options.map((target) => ({ key: importFunctionTargetKey(target), name: NAMES[target] })),
      remember: async (key, value) => {
        const target = functionTargetOf(key);
        if (target) await this.remember(value, target);
      },
    };
  }

  /** The remembered targets by normalized text. */
  async rules(): Promise<Map<string, ImportFunctionTarget>> {
    const { rules } = (await this.settings.get<ImportFunctionRules>(SECTION)) ?? { rules: [] };
    return new Map(rules.map((r) => [normalizeHeading(r.value), r.target]));
  }

  /** Remembers `value` with `target`; a rule for the same text is replaced. */
  private async remember(value: string, target: ImportFunctionTarget): Promise<void> {
    const text = value.trim();
    const wanted = normalizeHeading(text);
    if (!wanted) return;
    const { rules } = (await this.settings.get<ImportFunctionRules>(SECTION)) ?? { rules: [] };
    await this.settings.set(SECTION, { rules: [...rules.filter((r) => normalizeHeading(r.value) !== wanted), { value: text, target }] });
  }
}
