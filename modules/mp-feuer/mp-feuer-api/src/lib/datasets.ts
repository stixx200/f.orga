import type { TransferArchive, TransferRow } from './archive/transfer-archive.js';
import { readCareer } from './readers/career.reader.js';
import { readExaminations, readStressExercises } from './readers/evidence.reader.js';
import { readClothing } from './readers/clothing.reader.js';
import { readEquipment } from './readers/equipment.reader.js';
import { readIncidents } from './readers/incidents.reader.js';
import { readPersons } from './readers/persons.reader.js';
import { readSessions } from './readers/sessions.reader.js';

/** What the module reads from the archives for an import profile of another module. */
export interface DatasetDefinition {
  /** Import profile the rows are fed into (`ImportService.runRows`). */
  profile: string;
  /** Persons first, then what refers to them. */
  position: number;
  /** All archives at once, so a reader can resolve references between them. */
  read(archives: readonly TransferArchive[]): TransferRow[];
  /**
   * Per row the key of the rows that must stay in one part, e.g. all rows of an incident (the profile determines the
   * primary report per incident); without, every row may go to any part.
   */
  groups?(rows: readonly Record<string, string>[]): string[];
  /** The incident reports of an archive may belong to a brigade-wide unit instead of its department. */
  units?: boolean;
  /** Options of the profile not offered here, e.g. creating catalog entries blindly (choosing entries replaces it). */
  hiddenOptions?: string[];
  /** Value (`YYYY-MM-DD…`) a "from" date limits the rows by, e.g. the begin of an incident report. */
  dateField?: string;
}

const normalized = (text: string | undefined) => (text ?? '').toLowerCase().replace(/[^a-z0-9äöüß]/g, '');
/** Department (or unit), incident number and begin: the report a row belongs to. */
const reportKey = (v: Record<string, string>) => [normalized(v['department']), v['unit'] ?? '', v['incidentNumber'], v['begin']].join('|');

export const DATASETS: readonly DatasetDefinition[] = [
  { profile: 'masterdata.persons', position: 10, read: readPersons },
  { profile: 'masterdata.career', position: 20, read: readCareer, hiddenOptions: ['createCatalogEntries'] },
  { profile: 'respiratory-protection.examinations', position: 30, read: readExaminations },
  { profile: 'respiratory-protection.stress-exercises', position: 40, read: readStressExercises },
  {
    profile: 'training.sessions',
    position: 50,
    read: readSessions,
    groups: (rows) => rows.map((v) => [normalized(v['department']), v['date'], v['start'], v['title']].join('|')),
  },
  {
    profile: 'incidents.personnel',
    position: 60,
    read: readIncidents,
    // An incident by its dispatch number (only in the report row), else its report.
    groups: (rows) => {
      const dispatch = new Map<string, string>();
      for (const v of rows) if (v['dispatchNumber']?.trim()) dispatch.set(reportKey(v), v['dispatchNumber'].trim());
      return rows.map((v) => {
        const number = dispatch.get(reportKey(v));
        return number ? `incident|${number}` : `report|${reportKey(v)}`;
      });
    },
    units: true,
    dateField: 'begin',
  },
  {
    profile: 'equipment.inventory',
    position: 55,
    read: readEquipment,
    groups: (rows) => rows.map((v, index) => v['inventoryNumber'] || String(index)),
  },
  {
    profile: 'clothing.inventory',
    position: 56,
    read: readClothing,
    groups: (rows) => rows.map((v, index) => v['inventoryNumber'] || String(index)),
  },
];

/**
 * Splits rows into parts of at most `size` rows; the rows of a group stay together (a group larger than `size`
 * forms a part of its own). The order of the groups is kept.
 */
export function splitIntoParts<T extends { values: Record<string, string> }>(
  rows: readonly T[],
  size: number,
  groupKeys?: (rows: readonly Record<string, string>[]) => string[],
): T[][] {
  const keys = groupKeys?.(rows.map((r) => r.values));
  const groups = new Map<string, T[]>();
  rows.forEach((row, index) => {
    const key = keys ? keys[index] : String(index);
    const members = groups.get(key);
    if (members) members.push(row);
    else groups.set(key, [row]);
  });
  const parts: T[][] = [];
  let current: T[] = [];
  for (const members of groups.values()) {
    if (current.length && current.length + members.length > size) {
      parts.push(current);
      current = [];
    }
    current.push(...members);
  }
  if (current.length) parts.push(current);
  return parts;
}
