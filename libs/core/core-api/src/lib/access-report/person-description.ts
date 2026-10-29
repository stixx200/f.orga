import type { Language, LocalizedText } from '@forga/core-contracts';

/**
 * Readable description of the data a module stores about a person, for the access report (Art. 15 GDPR). Modules
 * deliver content only, the core renders it. Rules (see the concept „Auskunft nach Art. 15 als PDF“):
 * - plain text in the language of the context: formatted dates, resolved references, no IDs, no field names from the
 *   code, booleans as yes/no (`ctx.yesNo`);
 * - other persons are never named (`ctx.person`, `ctx.actor` give the function, or the own name);
 * - large amounts as tables, with sums per year (`summary`);
 * - internal remarks about the person belong in it.
 */
export type PersonDataBlock =
  | { kind: 'fields'; title?: string; rows: { label: string; value: string }[] }
  | {
      kind: 'table';
      title?: string;
      columns: string[];
      rows: string[][];
      /** Lines below the table, e.g. „2026: 31 Einsätze, 64,5 Stunden“. */
      summary?: string[];
    }
  | { kind: 'text'; title?: string; text: string };

/** Records whose changes (history) belong to the section; entries of their children count too. */
export interface PersonDataRecords {
  /** History name `<schema>.<table>`, e.g. `training.attendance`. */
  entity: string;
  ids: readonly string[];
  /** Readable name of such a record, e.g. „Anwesenheit“; default the title of the section. */
  label?: string;
}

export interface PersonDataSection {
  /** Unique key of the section, e.g. `masterdata` or `masterdata.driver-license`. */
  key: string;
  title: string;
  /** Key of the processing activity in the module manifest (`privacy.activities`): purpose, recipients and period. */
  activity: string;
  /** Categories of data in the section, e.g. „Kontaktdaten“, „Bankverbindung“. */
  categories: string[];
  /** The section holds health data (Art. 9 GDPR): marked in the PDF. */
  health?: boolean;
  blocks: PersonDataBlock[];
  /** Records the section is about: their changes appear in the protocol, their first entry tells the origin. */
  records?: PersonDataRecords[];
  /** Readable names of child records in the protocol by history name, e.g. `{ 'masterdata.membership': 'Mitgliedschaft' }`. */
  labels?: Record<string, string>;
}

/** Formatting and resolving helpers handed to `describePerson`. */
export interface DescribeContext {
  language: Language;
  /** Moment the report describes. */
  asOf: Date;
  /** The person the report is about. */
  personId: string;
  /** User accounts of the person; changes by them are shown as the person's own. */
  ownUserIds: ReadonlySet<string>;
  /** Text in the language of the report. */
  text(value: LocalizedText): string;
  t(de: string, en: string): string;
  /** `21.10.2026`; Dates in Berlin time; `YYYY-MM-DD` strings as they are; empty → „–“. */
  date(value: Date | string | null | undefined): string;
  /** `21.10.2026 13:05`. */
  dateTime(value: Date | string | null | undefined): string;
  /** `13:05`. */
  time(value: Date | string | null | undefined): string;
  /** Euro amount, e.g. `12,50 €`; `null` → „–“. */
  money(amount: number | null | undefined): string;
  number(value: number, fractionDigits?: number): string;
  yesNo(value: boolean | null | undefined): string;
  /** Bank account shortened to the last four characters, e.g. „IBAN endet auf 4711“; empty → „–“. */
  iban(value: string | null | undefined): string;
  /** Value or „–“ for empty values. */
  value(value: string | number | null | undefined): string;
  /** Who did something: „Sie selbst“ for the person, otherwise the function (roles), never a name of someone else. */
  actor(userId: string | null | undefined): Promise<string>;
  /** Another person as function (roles of their account) or „andere Person“; the person itself by name. */
  person(personId: string | null | undefined): Promise<string>;
}

/** UUIDs never belong into the readable report. */
export const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Every string of the sections, e.g. to check that no ID slipped in. */
export function sectionTexts(sections: readonly PersonDataSection[]): string[] {
  return sections.flatMap((s) => [
    s.title,
    ...s.categories,
    ...s.blocks.flatMap((b) => [
      b.title ?? '',
      ...(b.kind === 'fields' ? b.rows.flatMap((r) => [r.label, r.value]) : b.kind === 'table' ? [...b.columns, ...b.rows.flat(), ...(b.summary ?? [])] : [b.text]),
    ]),
  ]);
}

/** Number of entries of a section: rows of fields and tables, one per text. */
export function sectionEntries(section: PersonDataSection): number {
  return section.blocks.reduce((sum, b) => sum + (b.kind === 'text' ? 1 : b.rows.length), 0);
}
