import { type TransferArchive, type TransferPerson, transferPersons, type TransferRow } from '../archive/transfer-archive.js';

/** Prefer the record of a current member, and a member over the youth record of the same person. */
const rank = (p: TransferPerson) => (p.left ? 2 : 0) + (p.youth ? 1 : 0);

/** Members and youth of all archives; a person in several archives (e.g. moved to the veterans) is taken once. */
export function readPersons(archives: readonly TransferArchive[]): TransferRow[] {
  const labels = new Map(archives.map((a) => [a.key, a.label]));
  const chosen = new Map<string, TransferPerson>();
  for (const person of transferPersons(archives).values()) {
    const key = [person.lastName, person.firstName, person.birthDate].join('|').toLowerCase();
    const current = chosen.get(key);
    if (!current || rank(person) < rank(current)) chosen.set(key, person);
  }
  return [...chosen.values()].map((person) => {
    const prefix = person.youth ? 'JUG' : 'PER';
    const v = (column: string) => person.row[`${prefix}_${column}`] ?? '';
    return {
      archive: person.archive,
      values: {
        salutation: v('ANREDE'),
        firstName: person.firstName,
        lastName: person.lastName,
        street: v('STRASSE'),
        postalCode: v('PLZ'),
        city: v('ORT'),
        phonePrivate: v('TEL_PRIV'),
        phoneMobile: v('MOB_PRIV') || v('MOB_GES'),
        phoneWork: v('TEL_GES'),
        email: v('MAIL_PRIV') || v('MAIL_GES'),
        birthDate: person.birthDate,
        gender: v('GESCHLECHT_OW'),
        joinedOn: v('AKTIV_VD').slice(0, 10),
        leftOn: person.left ? (v('AKTIV_BD') || v('ARCHIV_DAT')).slice(0, 10) : '',
        exitReason: person.left ? v('AKTIV_GRUND') : '',
        status: person.youth && !person.left ? 'jugend' : '',
        department: labels.get(person.archive) ?? '',
      },
    };
  });
}
