import type { PersonDirectory, PersonSnapshot } from '@forga/masterdata-contracts';

const nameKey = (text: string) => text.toLowerCase().split(/[\s,]+/).filter(Boolean).toSorted().join(' ');

/** Person of an import row: by personnel number, else by name ("Last, First" or "First Last") among the members. */
export async function matchPerson(directory: PersonDirectory, members: PersonSnapshot[], values: Record<string, string>): Promise<string | undefined> {
  if (values['personnelNumber']) return (await directory.findByPersonnelNumber(values['personnelNumber']))?.id;
  return members.find((m) => nameKey(`${m.lastName} ${m.firstName}`) === nameKey(values['personName'] ?? ''))?.id;
}
