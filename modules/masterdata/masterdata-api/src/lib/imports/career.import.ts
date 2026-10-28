import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { type ImportContext, type ImportProfile, type ImportRow, type ImportRunResult, parseDate } from '@forga/core-api';
import type { ImportMessage, ImportRowResult } from '@forga/core-contracts';
import type { CatalogKind } from '@forga/masterdata-contracts';
import { CatalogEntry } from '../catalog/catalog.js';
import { HonorAward, Person, PersonQualification, RankAssignment } from '../masterdata.entities.js';
import { PersonsService, WRITE } from '../persons/persons.service.js';
import { addMonths } from '../shared/dates.js';
import { matchCatalog } from './catalog-match.js';
import { readCareer } from './career.transfer.js';

const field = (key: string, de: string, en: string, aliases: string[], required = false) => ({ key, label: { de, en }, required, aliases });

const FIELDS = [
  field('personnelNumber', 'Personalnummer', 'Personnel number', ['Pers.-Nr.', 'Personalnummer']),
  field('personName', 'Name (Nachname Vorname)', 'Name (last first)', ['Name']),
  field('birthDate', 'Geburtsdatum', 'Date of birth', ['Geburtsdatum', 'Geb.-Datum']),
  field('kind', 'Art (Lehrgang, Dienstgrad, Ehrung)', 'Kind (course, rank, honor)', ['Art', 'Kategorie'], true),
  field('name', 'Bezeichnung', 'Name', ['Bezeichnung', 'Lehrgang', 'Dienstgrad', 'Ehrung'], true),
  field('date', 'Datum', 'Date', ['Datum', 'Abschluss', 'von'], true),
  field('validUntil', 'Gültig bis', 'Valid until', ['gültig bis']),
];

type CareerKind = Extract<CatalogKind, 'qualification' | 'rank' | 'honor'>;

const KINDS: [RegExp, CareerKind][] = [
  [/lehrg|qualifi|ausbild|course/i, 'qualification'],
  [/dienstgrad|rank|bef(ö|oe)rder/i, 'rank'],
  [/ehrung|honou?r|auszeichnung/i, 'honor'],
];

const nameKey = (text: string) => text.toLowerCase().split(/[\s,]+/).filter(Boolean).toSorted().join(' ');

/** Key for a new catalog entry from its name, e.g. "Motorsägen-Grundlehrgang" → `motorsaegen-grundlehrgang`. */
function newKey(name: string, taken: (key: string) => boolean): string {
  const base = name.toLowerCase().replaceAll('ä', 'ae').replaceAll('ö', 'oe').replaceAll('ü', 'ue').replaceAll('ß', 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'entry';
  let key = base;
  for (let n = 2; taken(key); n++) key = `${base}-${n}`;
  return key;
}

/** Qualifications, ranks and honors of persons, e.g. courses and history of MP-Feuer. */
@Injectable()
export class CareerImport {
  constructor(
    private readonly em: EntityManager,
    private readonly persons: PersonsService,
  ) {}

  profile(): ImportProfile {
    return {
      id: 'masterdata.career',
      name: { de: 'Lehrgänge, Dienstgrade und Ehrungen', en: 'Courses, ranks and honors' },
      description: {
        de: 'Eine Zeile je Lehrgang, Beförderung oder Ehrung einer Person. Die Bezeichnung wird dem Katalog zugeordnet (z. B. „Truppführer, Lehrgang auf Kreisebene“ → Truppführer). Schon vorhandene Einträge mit demselben Datum bleiben unverändert.',
        en: 'One row per course, promotion or honor of a person. The name is matched to the catalog (e.g. "Truppführer, Lehrgang auf Kreisebene" → squad leader). Existing entries with the same date stay unchanged.',
      },
      permission: WRITE,
      fields: FIELDS,
      // Data transfers offer choosing or creating an entry per unknown name instead.
      options: [{ key: 'createCatalogEntries', label: { de: 'Unbekannte Bezeichnungen im Katalog anlegen', en: 'Add unknown names to the catalog' }, default: false, transfer: false }],
      run: (rows, context) => this.run(rows, context),
      transfer: { order: 20, read: readCareer },
    };
  }

  private async run(rows: ImportRow[], { user, options, dryRun, mapped, unmatched }: ImportContext): Promise<ImportRunResult> {
    const em = this.em.fork();
    const persons = await em.find(Person, {}, { populate: ['memberships.department', 'qualifications', 'ranks', 'honors'] });
    const catalog = await em.find(CatalogEntry, { kind: { $in: ['qualification', 'rank', 'honor'] } });
    const createEntries = options['createCatalogEntries'] && user.can('masterdata.catalogs.manage');
    const results: ImportRowResult[] = [];

    for (const { row, values } of rows) {
      const messages: ImportMessage[] = [];
      const label = [values['personName'] || values['personnelNumber'], values['name']].filter(Boolean).join(' · ');
      const fail = (code: string, params?: ImportMessage['params']) => results.push({ row, action: 'error', label, messages: [{ code, params }] });

      const kind = KINDS.find(([pattern]) => pattern.test(values['kind'] ?? ''))?.[1];
      if (!kind) { fail('masterdata.import.unknownCareerKind', { value: values['kind'] ?? '' }); continue; }
      const date = parseDate(values['date'] ?? '');
      const validUntil = values['validUntil'] ? parseDate(values['validUntil']) : null;
      if (!date || (values['validUntil'] && !validUntil)) { fail('imports.invalidDate'); continue; }
      const birthDate = values['birthDate'] ? parseDate(values['birthDate']) : null;

      const matches = values['personnelNumber']
        ? persons.filter((p) => p.personnelNumber === values['personnelNumber'])
        : persons.filter((p) => nameKey(`${p.lastName} ${p.firstName}`) === nameKey(values['personName'] ?? '') && (!birthDate || !p.birthDate || p.birthDate === birthDate));
      if (matches.length !== 1) { fail(matches.length ? 'masterdata.import.ambiguous' : 'masterdata.import.unknownPerson', { name: values['personName'] || values['personnelNumber'] || '' }); continue; }
      const person = matches[0];
      if (!this.persons.can(user, WRITE, person)) { fail('auth.forbidden'); continue; }

      const name = (values['name'] ?? '').trim();
      const active = catalog.filter((e) => e.kind === kind && e.active);
      const chosen = name ? mapped(kind, name) : undefined;
      let entry = matchCatalog(active, name) ?? active.find((e) => e.key === chosen);
      if (!entry && createEntries && name) {
        entry = em.create(CatalogEntry, {
          kind,
          key: newKey(name, (key) => catalog.some((e) => e.kind === kind && e.key === key)),
          name: { de: name, en: name },
          sortOrder: 1000,
          active: true,
          attributes: kind === 'rank' ? { abbreviation: '', level: 0 } : kind === 'qualification' ? { validityMonths: null } : {},
        });
        catalog.push(entry);
        messages.push({ code: 'masterdata.import.catalogEntryCreated', params: { name } });
      }
      if (!entry) {
        if (name) unmatched(kind, name);
        fail('masterdata.import.unknownCatalogEntry', { kind, value: name, name });
        continue;
      }
      const { key } = entry;

      let exists: boolean;
      if (kind === 'qualification') {
        exists = person.qualifications.getItems().some((q) => q.qualification === key && q.acquiredOn === date);
        const months = entry.attributes['validityMonths'] as number | null | undefined;
        if (!exists) person.qualifications.add(em.create(PersonQualification, { person, qualification: key, acquiredOn: date, validUntil: validUntil ?? (months ? addMonths(date, months) : null), courseAttendanceId: null, notes: '' }));
      } else if (kind === 'rank') {
        exists = person.ranks.getItems().some((r) => r.rank === key && r.since === date);
        if (!exists) person.ranks.add(em.create(RankAssignment, { person, rank: key, since: date, notes: '' }));
      } else {
        exists = person.honors.getItems().some((h) => h.honor === key && h.awardedOn === date);
        if (!exists) person.honors.add(em.create(HonorAward, { person, honor: key, awardedOn: date, notes: '' }));
      }
      results.push({ row, action: exists ? 'unchanged' : 'create', label, messages });
    }

    if (!dryRun) await em.flush();
    const counts = { create: 0, update: 0, unchanged: 0, error: 0 };
    for (const r of results) counts[r.action]++;
    return { dryRun, counts, rows: results };
  }
}
