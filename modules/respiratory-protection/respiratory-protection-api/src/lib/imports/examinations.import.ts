import { Inject, Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { berlinDate, type ImportContext, type ImportProfile, type ImportRow, parseDate } from '@forga/core-api';
import type { ImportResult, ImportRowResult } from '@forga/core-contracts';
import { PERSON_DIRECTORY, type PersonDirectory, type PersonSnapshot } from '@forga/masterdata-contracts';
import { EvidenceEntity } from '../respiratory-protection.entities.js';
import { EvidenceService, EXAMINATIONS } from '../evidence/evidence.service.js';
import { parseResult } from './examination-result.js';
import { matchPerson } from './person-match.js';
import { readExaminations } from './evidence.transfer.js';

const field = (key: string, de: string, en: string, aliases: string[], required = false) => ({ key, label: { de, en }, required, aliases });

const FIELDS = [
  field('personnelNumber', 'Personalnummer', 'Personnel number', ['Pers.-Nr.', 'Personalnummer']),
  field('personName', 'Name', 'Name', ['Name', 'Geräteträger']),
  field('date', 'Untersuchungsdatum', 'Examination date', ['Datum', 'Untersuchung', 'G26', 'Untersucht am'], true),
  field('validUntil', 'Gültig bis', 'Valid until', ['gültig bis', 'nächste Untersuchung', 'Wiedervorstellung']),
  field('examiner', 'Arzt / Stelle', 'Doctor / office', ['Arzt', 'Stelle', 'Untersucher']),
  field('restrictions', 'Einschränkungen', 'Restrictions', ['Einschränkung', 'Einschränkungen', 'Auflagen']),
  field('result', 'Ergebnis', 'Result', ['Ergebnis', 'Beurteilung', 'Bedenken']),
];

/** Medical examinations from a CSV/Excel file (date, valid until, doctor, restrictions and result; no findings). */
@Injectable()
export class ExaminationsImport {
  constructor(
    private readonly em: EntityManager,
    private readonly evidence: EvidenceService,
    @Inject(PERSON_DIRECTORY) private readonly directory: PersonDirectory,
  ) {}

  profile(): ImportProfile {
    return {
      id: 'respiratory-protection.examinations',
      name: { de: 'Eignungsuntersuchungen', en: 'Medical examinations' },
      description: {
        de: 'Eine Zeile je Untersuchung mit Personalnummer oder Name, Datum, „gültig bis“ (nach dem Datum) und optional dem Ergebnis („keine Bedenken“, „befristet keine Bedenken“, „keine Bedenken unter bestimmten Voraussetzungen“, „Bedenken“). Befunde werden nicht übernommen. Eine schon vorhandene Untersuchung derselben Person am selben Tag wird aktualisiert.',
        en: 'One row per examination with personnel number or name, date, "valid until" (after the date) and optionally the result ("no concerns", "no concerns for a limited time", "no concerns under certain conditions", "concerns"). Findings are not taken over. An existing examination of the same person on the same day is updated.',
      },
      permission: EXAMINATIONS,
      fields: FIELDS,
      run: (rows, context) => this.run(rows, context),
      transfer: { order: 30, read: readExaminations },
    };
  }

  private async run(rows: ImportRow[], { user, dryRun }: ImportContext): Promise<ImportResult> {
    const em = this.em.fork();
    const members: PersonSnapshot[] = await this.directory.membersOn(berlinDate());
    const results: ImportRowResult[] = [];
    const touched = new Set<string>();
    for (const { row, values } of rows) {
      const label = values['personName'] || values['personnelNumber'] || '';
      const error = (code: string, params?: Record<string, string>) => results.push({ row, action: 'error', label, messages: [{ code, params }] });
      const personId = await matchPerson(this.directory, members, values);
      if (!personId) { error('respiratory-protection.import.unknownPerson', { name: label }); continue; }
      const date = parseDate(values['date'] ?? '');
      if (!date) { error('imports.invalidDate'); continue; }
      if (date > berlinDate()) { error('respiratory-protection.dateInFuture', { date }); continue; }
      const validUntil = values['validUntil'] ? parseDate(values['validUntil']) : null;
      if (values['validUntil'] && !validUntil) { error('imports.invalidDate'); continue; }
      if (validUntil && validUntil <= date) { error('respiratory-protection.validUntilNotAfterDate'); continue; }
      const result = parseResult(values['result'] ?? '');
      if (result === undefined) { error('respiratory-protection.import.unknownResult', { value: values['result'] ?? '' }); continue; }
      const [person] = await this.directory.snapshots([personId]);
      if (!person || !this.evidence.can(user, EXAMINATIONS, person)) { error('auth.forbidden'); continue; }

      // Without a result column, a stored result stays.
      const fields = { validUntil, examiner: values['examiner'] ?? '', restrictions: values['restrictions'] ?? '', ...(result ? { result } : {}) };
      const existing = await em.findOne(EvidenceEntity, { personId, kind: 'examination', date });
      const changed =
        existing && (existing.validUntil !== fields.validUntil || existing.examiner !== fields.examiner || existing.restrictions !== fields.restrictions || (result !== null && existing.result !== result));
      if (!dryRun) {
        if (existing) Object.assign(existing, fields);
        else em.create(EvidenceEntity, { personId, kind: 'examination', date, ...fields, source: 'import', sourceId: null, withdrawn: false });
      }
      touched.add(personId);
      results.push({ row, action: existing ? (changed ? 'update' : 'unchanged') : 'create', label, messages: [] });
    }
    if (!dryRun) {
      await em.flush();
      await this.evidence.refresh([...touched]);
    }
    const counts = { create: 0, update: 0, unchanged: 0, error: 0 };
    for (const r of results) counts[r.action]++;
    return { dryRun, counts, rows: results };
  }
}
