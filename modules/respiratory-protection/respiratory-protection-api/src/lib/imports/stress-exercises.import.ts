import { Inject, Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { berlinDate, type ImportContext, type ImportProfile, type ImportRow, type ImportRunResult, parseDate } from '@forga/core-api';
import type { ImportRowResult } from '@forga/core-contracts';
import { PERSON_DIRECTORY, type PersonDirectory, type PersonSnapshot } from '@forga/masterdata-contracts';
import { EvidenceEntity } from '../respiratory-protection.entities.js';
import { EVIDENCE, EvidenceService, trackValues } from '../evidence/evidence.service.js';
import { matchPerson } from './person-match.js';
import { readStressExercises } from './evidence.transfer.js';

const field = (key: string, de: string, en: string, aliases: string[], required = false) => ({ key, label: { de, en }, required, aliases });

const FIELDS = [
  field('personnelNumber', 'Personalnummer', 'Personnel number', ['Pers.-Nr.', 'Personalnummer']),
  field('personName', 'Name', 'Name', ['Name', 'Teilnehmer', 'Geräteträger']),
  field('date', 'Datum', 'Date', ['Datum', 'Übungsdatum', 'Durchgang'], true),
  field('kilojoules', 'Arbeit (kJ)', 'Work (kJ)', ['kJ', 'Arbeit', 'Leistung', 'Arbeit (kJ)']),
  field('passed', 'Bestanden', 'Passed', ['bestanden', 'Ergebnis']),
  field('minutes', 'Minuten', 'Minutes', ['Minuten', 'Dauer', 'Zeit (min)']),
  field('facility', 'Übungsanlage', 'Training facility', ['Anlage', 'Übungsanlage', 'Atemschutzübungsanlage', 'Ort']),
  field('kind', 'Art (Belastungsübung oder Atemschutzstrecke)', 'Kind (stress exercise or breathing apparatus track)', ['Art', 'Prüfung']),
];

const YES = new Set(['ja', 'j', 'yes', 'y', 'x', '1', 'true', 'bestanden', 'passed']);
const NO = new Set(['nein', 'n', 'no', '0', 'false', 'nicht bestanden', 'failed']);

/** Optional whole number; `undefined` = invalid. */
function wholeNumber(text: string | undefined): number | null | undefined {
  if (!text?.trim()) return null;
  const value = Number(text.trim().replace(',', '.'));
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined;
}

/** Stress exercises from the export of a breathing apparatus training facility (date, person, kJ). */
@Injectable()
export class StressExercisesImport {
  constructor(
    private readonly em: EntityManager,
    private readonly evidence: EvidenceService,
    @Inject(PERSON_DIRECTORY) private readonly directory: PersonDirectory,
  ) {}

  profile(): ImportProfile {
    return {
      id: 'respiratory-protection.stress-exercises',
      name: { de: 'Belastungsübungen und Atemschutzstrecke', en: 'Stress exercises and breathing apparatus track' },
      description: {
        de: 'Eine Zeile je Durchgang mit Personalnummer oder Name, Datum und kJ, wie sie Atemschutzübungsanlagen ausgeben. Ohne Spalte „bestanden“ entscheidet die kJ-Grenze der Regel. Steht in der Art „Strecke“, ist es ein Durchgang der Atemschutzstrecke mit Arbeit und Dauer aus der Regel. Ein schon vorhandener Durchgang derselben Person am selben Tag wird aktualisiert.',
        en: 'One row per run with personnel number or name, date and kJ, as training facilities export them. Without a "passed" column the kJ limit of the rule decides. A kind containing "Strecke" is a run of the breathing apparatus track with work and duration from the rule. An existing run of the same person on the same day is updated.',
      },
      permission: EVIDENCE,
      fields: FIELDS,
      run: (rows, context) => this.run(rows, context),
      transfer: { order: 40, read: readStressExercises },
    };
  }

  private async run(rows: ImportRow[], { user, dryRun }: ImportContext): Promise<ImportRunResult> {
    const em = this.em.fork();
    const members: PersonSnapshot[] = await this.directory.membersOn(berlinDate());
    const results: ImportRowResult[] = [];
    const touched = new Set<string>();
    const rule = await this.evidence.rule();
    for (const { row, values } of rows) {
      const kind = /strecke|track/i.test(values['kind'] ?? '') ? 'training-track' : 'stress-exercise';
      const track = trackValues(kind, rule);
      const label = values['personName'] || values['personnelNumber'] || '';
      const error = (code: string, params?: Record<string, string>) => results.push({ row, action: 'error', label, messages: [{ code, params }] });
      const personId = await matchPerson(this.directory, members, values);
      if (!personId) { error('respiratory-protection.import.unknownPerson', { name: label }); continue; }
      const date = parseDate(values['date'] ?? '');
      if (!date) { error('imports.invalidDate'); continue; }
      if (date > berlinDate()) { error('respiratory-protection.dateInFuture', { date }); continue; }
      const measuredKilojoules = wholeNumber(values['kilojoules']);
      const measuredMinutes = wholeNumber(values['minutes']);
      const kilojoules = measuredKilojoules === null ? track.kilojoules : measuredKilojoules;
      const minutes = measuredMinutes === null ? track.minutes : measuredMinutes;
      if (kilojoules === undefined || minutes === undefined) { error('respiratory-protection.import.invalidNumber'); continue; }
      const passedText = values['passed']?.trim().toLowerCase() ?? '';
      if (passedText && !YES.has(passedText) && !NO.has(passedText)) { error('respiratory-protection.import.invalidPassed', { value: values['passed'] ?? '' }); continue; }
      if (kilojoules === null && !passedText) { error('respiratory-protection.import.noResult'); continue; }
      const [person] = await this.directory.snapshots([personId]);
      if (!person || !this.evidence.can(user, EVIDENCE, person)) { error('auth.forbidden'); continue; }

      const fields = { kilojoules, minutes, passed: passedText ? YES.has(passedText) : null, facility: values['facility'] ?? '' };
      const existing = await em.findOne(EvidenceEntity, { personId, kind, date, source: { $in: ['import', 'manual'] } });
      const changed = existing && (existing.kilojoules !== fields.kilojoules || existing.minutes !== fields.minutes || existing.passed !== fields.passed || existing.facility !== fields.facility);
      if (!dryRun) {
        if (existing) Object.assign(existing, fields);
        else em.create(EvidenceEntity, { personId, kind, date, ...fields, source: 'import', sourceId: null, withdrawn: false });
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
