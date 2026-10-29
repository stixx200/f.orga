import { z } from 'zod';
import type { LocalizedText } from '@forga/core-contracts';

/**
 * Fields of the person file a brigade may switch off (data minimisation, Art. 5(1) c GDPR, L10). Switched-off fields
 * are not shown, not stored and not imported; stored values are removed with a bulk action after a confirmation.
 */
export const OPTIONAL_PERSON_FIELDS = ['salutation', 'title', 'nickname', 'birthPlace', 'gender', 'phonePrivate', 'phoneWork', 'employer', 'bank', 'notes'] as const;
export const OptionalPersonField = z.enum(OPTIONAL_PERSON_FIELDS);
export type OptionalPersonField = z.infer<typeof OptionalPersonField>;

/** Name of each optional field, for settings page and audit log. */
export const PERSON_FIELD_NAMES: Record<OptionalPersonField, LocalizedText> = {
  salutation: { de: 'Anrede', en: 'Salutation' },
  title: { de: 'Titel', en: 'Title' },
  nickname: { de: 'Rufname', en: 'Nickname' },
  birthPlace: { de: 'Geburtsort', en: 'Place of birth' },
  gender: { de: 'Geschlecht', en: 'Gender' },
  phonePrivate: { de: 'Telefon privat', en: 'Phone (private)' },
  phoneWork: { de: 'Telefon dienstlich', en: 'Phone (work)' },
  employer: { de: 'Arbeitgeber mit Anschrift und IBAN', en: 'Employer with address and IBAN' },
  bank: { de: 'Private Bankverbindung', en: 'Private bank account' },
  notes: { de: 'Bemerkung (intern)', en: 'Remarks (internal)' },
};

/** „Wofür?“: what the field is needed for, so the brigade can decide whether it has that purpose. */
export const PERSON_FIELD_PURPOSES: Record<OptionalPersonField, LocalizedText> = {
  salutation: { de: 'Anrede in Briefen (Auskunft, Ehrungen, Einladungen)', en: 'Salutation in letters (access report, honours, invitations)' },
  title: { de: 'Akademischer Titel in Briefen und Urkunden', en: 'Academic title in letters and certificates' },
  nickname: { de: 'Ansprache im Dienst, Suche nach dem bekannten Namen', en: 'Addressing on duty, search by the known name' },
  birthPlace: { de: 'Urkunden, Lehrgangsanmeldung (Landesfeuerwehrschule)', en: 'Certificates, course registration (state fire academy)' },
  gender: { de: 'Jahresstatistik (Frauen), Anrede', en: 'Annual statistics (women), salutation' },
  phonePrivate: { de: 'Erreichbarkeit über das Festnetz (Telefonliste)', en: 'Reachability by landline (phone list)' },
  phoneWork: { de: 'Erreichbarkeit während der Arbeit (Telefonliste)', en: 'Reachability at work (phone list)' },
  employer: { de: 'Verdienstausfall und Freistellung, Abtretung an den Arbeitgeber', en: 'Loss of earnings and release from work, assignment to the employer' },
  bank: { de: 'Auszahlung der Entschädigung', en: 'Payment of the compensation' },
  notes: { de: 'Interne Vermerke zur Person (keine Gesundheitsangaben)', en: 'Internal notes about the person (no health data)' },
};

/** Setting `masterdata.personFields`: the switched-off fields; all fields are on by default. */
export const PersonFieldSettings = z.object({
  disabled: z.array(OptionalPersonField).default([]),
});
export type PersonFieldSettings = z.infer<typeof PersonFieldSettings>;

/** A field with its state and the number of persons who still have a value stored (`GET /api/masterdata/person-fields`). */
export const PersonFieldState = z.object({
  field: OptionalPersonField,
  enabled: z.boolean(),
  /** Persons with a stored value. */
  stored: z.number().int(),
});
export type PersonFieldState = z.infer<typeof PersonFieldState>;

/** Removes the stored values of switched-off fields from all persons, with their history (`POST …/person-fields/clear`). */
export const PersonFieldsClear = z.object({
  fields: z.array(OptionalPersonField).min(1),
});
export type PersonFieldsClear = z.infer<typeof PersonFieldsClear>;

/** Result: persons changed per field. */
export const PersonFieldsCleared = z.object({ counts: z.record(z.string(), z.number().int()) });
export type PersonFieldsCleared = z.infer<typeof PersonFieldsCleared>;
