import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import {
  type ImportContext,
  type ImportProfile,
  type ImportRow,
  type ImportRunResult,
  normalizeHeading,
  parseDate,
  SettingsService,
} from '@forga/core-api';
import type { ImportMessage, ImportRowResult } from '@forga/core-contracts';
import { type DepartmentType, type DriverLicense, EMPTY_DRIVER_LICENSE, Gender, readDriverLicense, type MembershipSettings, PersonStatus, probationEnd } from '@forga/masterdata-contracts';
import { CatalogEntry } from '../catalog/catalog.js';
import { Department, Membership, Person } from '../masterdata.entities.js';
import { activeMemberships, PersonsService, SENSITIVE, WRITE } from '../persons/persons.service.js';
import { today } from '../shared/access.js';

const field = (key: string, de: string, en: string, aliases: string[], required = false) => ({
  key,
  label: { de, en },
  required,
  aliases,
});

/** Fields of the person import. The aliases cover the MP-Feuer exports of persons, master data and the youth brigade. */
const FIELDS = [
  field('personnelNumber', 'Personalnummer', 'Personnel number', ['Pers.-Nr.', 'PersNr', 'Personal-Nr.', 'Nr.']),
  field('salutation', 'Anrede', 'Salutation', ['Anrede']),
  field('title', 'Titel', 'Title', ['Titel']),
  field('firstName', 'Vorname', 'First name', ['Vorname'], true),
  field('lastName', 'Nachname', 'Last name', ['Nachname', 'Name'], true),
  field('street', 'Straße', 'Street', ['Straße', 'Strasse', 'Str.']),
  field('postalCode', 'PLZ', 'Postal code', ['PLZ', 'Postleitzahl']),
  field('city', 'Ort', 'City', ['Ort', 'Wohnort']),
  field('phonePrivate', 'Telefon privat', 'Phone (private)', ['Telefon', 'Tel. privat', 'Telefon privat']),
  field('phoneMobile', 'Mobil', 'Mobile', ['Handy', 'Handy privat', 'Mobil', 'Mobiltelefon']),
  field('phoneWork', 'Telefon dienstlich', 'Phone (work)', ['Tel. dienstlich', 'Tel. gesch.', 'Telefon dienstlich']),
  field('email', 'E-Mail', 'E-mail', ['E-Mail', 'E-Mail privat', 'Email', 'Mail']),
  field('birthDate', 'Geburtsdatum', 'Date of birth', ['Geburtsdatum', 'Geb.-Datum', 'Geboren']),
  field('gender', 'Geschlecht', 'Gender', ['Geschlecht']),
  field('joinedOn', 'Eintritt', 'Joined', ['Eintritt', 'Eintrittsdatum', 'Mitglied seit', 'Aktiv von']),
  field('department', 'Abteilung', 'Department', ['Bezeichnung', 'Abteilung', 'Abt.']),
  field('status', 'Status', 'Status', ['Status']),
  field('leftOn', 'Austritt', 'Left', ['Austritt', 'Austrittsdatum', 'Aktiv bis']),
  field('exitReason', 'Austrittsgrund', 'Exit reason', ['Austrittsgrund', 'Grund']),
  field('licenseClasses', 'Führerscheinklassen', 'Driving licence classes', ['Führerschein', 'Führerscheinklassen', 'FS-Klassen', 'Fahrerlaubnis']),
  field('licenseExpiresOn', 'Führerschein gültig bis', 'Driving licence valid until', ['Führerschein gültig bis', 'FS gültig bis', 'Führerschein Ablauf']),
];

/**
 * Classes like "B, BE, C1/C" with one expiry date, read like old data: the date goes to the time-limited classes
 * C1, C1E, C and CE and is marked for verification at the first check.
 */
function importedLicense(classes: string | undefined, expiresOn: string | null): DriverLicense | null {
  const names = (classes ?? '').split(/[\s,;/]+/).map((c) => c.trim()).filter(Boolean);
  if (!names.length) return null;
  return readDriverLicense({ classes: [...new Set(names.map((c) => c.toUpperCase()))], expiresOn });
}

const GENDERS: Record<string, Gender> = { w: 'female', weiblich: 'female', female: 'female', f: 'female', m: 'male', maennlich: 'male', male: 'male', d: 'diverse', divers: 'diverse' };
const STATUS: Record<string, PersonStatus> = { aktiv: 'active', active: 'active', passiv: 'passive', passive: 'passive', jugend: 'youth', youth: 'youth', probezeit: 'probation', probation: 'probation', altersabteilung: 'veterans', veterans: 'veterans' };
const SALUTATION_GENDER: Record<string, Gender> = { herr: 'male', frau: 'female' };
/** Keys of the exit reason catalog (state template) for the usual MP-Feuer texts. */
const EXIT_REASONS: [RegExp, string][] = [
  [/verstorben|tod/i, 'death'],
  [/umzug|umgezogen|wegzug|verzogen/i, 'relocation'],
  [/krank|gesundheit/i, 'health'],
  [/alter/i, 'age-limit'],
  [/ausschluss|ausgeschlossen/i, 'exclusion'],
  [/wunsch|interesse|k(ü|ue)ndigung|austritt/i, 'own-request'],
];

/**
 * Department names in MP-Feuer exports look like "Abt. Musterstadt", "Altersabt. Musterstadt", "Sonderdienste".
 * Returns the place name and the type it implies.
 */
export function parseDepartmentName(text: string): { key: string; type: DepartmentType; place: string } {
  const value = text.trim();
  const veterans = /^alters\s*(abteilung|abt\.?)\s*/i;
  const operational = /^(abteilung|abt\.?)\s*/i;
  if (veterans.test(value)) {
    const place = value.replace(veterans, '');
    return { key: `veterans:${normalizeHeading(place)}`, type: 'veterans', place };
  }
  if (/sonderdienst/i.test(value)) return { key: normalizeHeading(value), type: 'special-service', place: value };
  if (/f(ü|ue)hrungsgruppe/i.test(value)) return { key: normalizeHeading(value), type: 'command', place: value };
  if (/jugend/i.test(value)) return { key: normalizeHeading(value), type: 'youth', place: value };
  const place = value.replace(operational, '');
  return { key: normalizeHeading(place), type: 'operational', place };
}

function departmentKey(department: Department): string {
  const parsed = parseDepartmentName(department.name);
  return department.type === 'veterans' ? `veterans:${normalizeHeading(parsed.place)}` : parsed.key;
}

@Injectable()
export class PersonsImport {
  constructor(
    private readonly em: EntityManager,
    private readonly persons: PersonsService,
    private readonly settings: SettingsService,
  ) {}

  profile(): ImportProfile {
    return {
      id: 'masterdata.persons',
      name: { de: 'Personen', en: 'Persons' },
      description: {
        de: 'Personen anlegen oder aktualisieren, z. B. aus dem MP-Feuer-Export „Personal.xlsx“. Erkannt werden Personen an der Personalnummer, sonst an Vor- und Nachname (und Geburtsdatum).',
        en: 'Create or update persons, e.g. from the MP-Feuer export "Personal.xlsx". Persons are matched by personnel number, otherwise by first and last name (and date of birth).',
      },
      permission: WRITE,
      fields: FIELDS,
      options: [
        { key: 'createDepartments', label: { de: 'Fehlende Abteilungen anlegen', en: 'Create missing departments' }, default: false },
        { key: 'updateExisting', label: { de: 'Vorhandene Personen aktualisieren', en: 'Update existing persons' }, default: true },
      ],
      run: (rows, context) => this.run(rows, context),
    };
  }

  private async run(rows: ImportRow[], context: ImportContext): Promise<ImportRunResult> {
    const { user, options, dryRun } = context;
    const em = this.em.fork();
    const rules = (await this.settings.get<MembershipSettings>('masterdata.membership')) as MembershipSettings;
    const departments = await em.find(Department, {});
    const exitReasonEntries = await em.find(CatalogEntry, { kind: 'exit-reason', active: true });
    const exitReasons = new Set(exitReasonEntries.map((e) => e.key));
    const byKey = new Map(departments.map((d) => [departmentKey(d), d]));
    const existing = await em.find(Person, {}, { populate: ['memberships.department', 'qualifications', 'ranks', 'honors', 'offices', 'restPeriods'] });
    const sensitive = user.grant(SENSITIVE) !== null;
    const results: ImportRowResult[] = [];

    for (const { row, values } of rows) {
      const messages: ImportMessage[] = [];
      const label = `${values['lastName'] ?? ''}, ${values['firstName'] ?? ''}`;
      const fail = (code: string, params?: ImportMessage['params']) =>
        results.push({ row, action: 'error', label, messages: [...messages, { code, params }] });

      if (!values['firstName'] || !values['lastName']) {
        fail('imports.requiredValueMissing', { field: !values['firstName'] ? 'firstName' : 'lastName' });
        continue;
      }

      const dates: Record<string, string | null> = {};
      let invalidDate = false;
      for (const key of ['birthDate', 'joinedOn', 'leftOn', 'licenseExpiresOn']) {
        if (!values[key]) continue;
        dates[key] = parseDate(values[key]);
        if (!dates[key]) invalidDate = true;
      }
      if (invalidDate) {
        fail('imports.invalidDate');
        continue;
      }
      if (dates['birthDate'] && !sensitive) {
        delete dates['birthDate'];
        messages.push({ code: 'masterdata.import.sensitiveIgnored', params: { field: 'birthDate' } });
      }

      // Department: matched by place name; "Altersabt. X" means the veterans department of X.
      let department: Department | undefined;
      if (values['department']) {
        const parsed = parseDepartmentName(values['department']);
        department = byKey.get(parsed.key);
        // Creating departments needs the permission for the organization, not only for persons.
        if (!department && options['createDepartments'] && user.can('masterdata.organization.manage')) {
          const parent = parsed.type === 'veterans' ? byKey.get(normalizeHeading(parsed.place)) : undefined;
          // Short names are unique: "Altersabt. Musterstadt" keeps its full name next to "Musterstadt".
          const shortName = parsed.place && ![...byKey.values()].some((d) => d.shortName.toLowerCase() === parsed.place.toLowerCase()) ? parsed.place : values['department'].trim();
          department = em.create(Department, {
            name: values['department'].trim(),
            shortName,
            type: parsed.type,
            parent: parent ?? null,
            specialTasks: [],
            deputyIds: [],
          });
          byKey.set(parsed.key, department);
          messages.push({ code: 'masterdata.import.departmentCreated', params: { name: department.name } });
        }
        if (!department) {
          fail('masterdata.import.unknownDepartment', { name: values['department'] });
          continue;
        }
      }

      const matches = values['personnelNumber']
        ? existing.filter((p) => p.personnelNumber === values['personnelNumber'])
        : existing.filter(
            (p) =>
              p.firstName.toLowerCase() === values['firstName'].toLowerCase() &&
              p.lastName.toLowerCase() === values['lastName'].toLowerCase() &&
              (!dates['birthDate'] || !p.birthDate || p.birthDate === dates['birthDate']),
          );
      if (matches.length > 1) {
        fail('masterdata.import.ambiguous');
        continue;
      }

      const fields: Record<string, unknown> = {};
      for (const key of ['personnelNumber', 'salutation', 'title', 'firstName', 'lastName', 'street', 'postalCode', 'city', 'phonePrivate', 'phoneMobile', 'phoneWork', 'email']) {
        if (values[key]) fields[key] = values[key];
      }
      const { leftOn = null, licenseExpiresOn = null, ...personDates } = dates;
      const license = importedLicense(values['licenseClasses'], licenseExpiresOn);
      Object.assign(fields, personDates);
      // Leaving is only taken over for new persons; an existing member leaves through the exit dialog.
      const left = !!leftOn && leftOn <= today();
      const exitText = normalizeHeading(values['exitReason'] ?? '');
      const exitReason = !exitText
        ? null
        : exitReasons.has(exitText)
          ? exitText
          : (EXIT_REASONS.find(([pattern, key]) => pattern.test(values['exitReason']) && exitReasons.has(key))?.[1] ?? context.mapped('exit-reason', values['exitReason']) ?? null);
      const gender =
        GENDERS[normalizeHeading(values['gender'] ?? '')] ?? SALUTATION_GENDER[normalizeHeading(values['salutation'] ?? '')];
      if (gender) fields['gender'] = gender;
      const status = values['status'] ? STATUS[normalizeHeading(values['status'])] : undefined;
      if (values['status'] && !status) messages.push({ code: 'masterdata.import.unknownStatus', params: { value: values['status'] } });

      const person = matches[0];
      if (person) {
        if (!this.persons.can(user, WRITE, person)) {
          fail('auth.forbidden');
          continue;
        }
        if (!options['updateExisting']) {
          results.push({ row, action: 'unchanged', label, messages });
          continue;
        }
        const changed = Object.entries(fields).filter(([key, value]) => (person as unknown as Record<string, unknown>)[key] !== value);
        // Classes come in only for persons without any: recorded checks are not overwritten by a file.
        const current = readDriverLicense(person.driverLicense);
        if (license && !current.classes.length) {
          changed.push(['driverLicense', { ...current, classes: license.classes, documentExpiresOn: license.documentExpiresOn ?? current.documentExpiresOn, expiryToVerify: license.expiryToVerify }]);
        }
        if (left && person.status !== 'left') messages.push({ code: 'masterdata.import.leftIgnored', params: { date: leftOn } });
        if (department && !activeMemberships(person).some((m) => m.department.id === department.id)) {
          messages.push({ code: 'masterdata.import.departmentDiffers', params: { name: department.name } });
        }
        if (!changed.length) {
          results.push({ row, action: 'unchanged', label, messages });
          continue;
        }
        em.assign(person, Object.fromEntries(changed));
        results.push({ row, action: 'update', label, messages });
        continue;
      }

      if (!department) {
        fail('masterdata.import.departmentRequired');
        continue;
      }
      if (!user.can(WRITE, department.id) && user.grant(WRITE) !== 'brigade') {
        fail('auth.forbidden');
        continue;
      }
      // Imported persons are existing members unless the file says otherwise.
      const finalStatus = left ? 'left' : (status ?? (department.type === 'veterans' ? 'veterans' : department.type === 'youth' ? 'youth' : 'active'));
      const from = dates['joinedOn'] ?? (left ? leftOn : today());
      if (left && values['exitReason'] && !exitReason) {
        messages.push({ code: 'masterdata.import.unknownExitReason', params: { kind: 'exit-reason', value: values['exitReason'].trim() } });
        context.unmatched('exit-reason', values['exitReason']);
      }
      const created = em.create(Person, {
        ...(fields as Partial<Person>),
        firstName: values['firstName'],
        lastName: values['lastName'],
        joinedOn: dates['joinedOn'] ?? null,
        status: finalStatus,
        probationEndsOn: finalStatus === 'probation' ? probationEnd(from, rules.probationMonths) : null,
        leftOn: left ? leftOn : null,
        exitReason: left ? exitReason : null,
        driverLicense: license ?? { ...EMPTY_DRIVER_LICENSE },
      });
      const to = left && leftOn ? (leftOn < from ? from : leftOn) : null;
      created.memberships.add(em.create(Membership, { person: created, department, from, to, primary: true }));
      existing.push(created as (typeof existing)[number]);
      results.push({ row, action: 'create', label, messages });
    }

    if (!dryRun) await em.flush();
    const counts = { create: 0, update: 0, unchanged: 0, error: 0 };
    for (const r of results) counts[r.action]++;
    return { dryRun, counts, rows: results };
  }
}
