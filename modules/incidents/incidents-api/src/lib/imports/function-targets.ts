import type { ImportLookupExtras } from '@forga/core-api';
import type { LocalizedText } from '@forga/core-contracts';
import { ImportFunctionTarget, importFunctionTargetKey } from '@forga/incidents-contracts';

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
 * Function texts of the personnel import that are no function (e.g. "Arbeitszeit Stadt Musterstadt" for assignments
 * during working hours): extra targets of the lookup `function`. A choice is remembered in the mapping list of the
 * caller like any other, so the next import applies it without asking.
 */
export const FUNCTION_TARGETS: ImportLookupExtras = {
  kind: 'function',
  entries: async () => ImportFunctionTarget.options.map((target) => ({ key: importFunctionTargetKey(target), name: NAMES[target] })),
};
