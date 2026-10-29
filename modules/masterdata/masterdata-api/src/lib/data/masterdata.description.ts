import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import type { DescribeContext, PersonDataBlock, PersonDataSection } from '@forga/core-api';
import type { CourseResult, DriverLicenseCheckMethod, Employment, Gender, NominationStatus, PersonStatus, RestPeriodReason } from '@forga/masterdata-contracts';
import { CatalogEntry } from '../catalog/catalog.js';
import { CourseAttendance, CourseNomination } from '../courses/course.entities.js';
import { DepartmentGroup } from '../organization/group.entities.js';
import { Department, DriverLicenseCheck, DriverLicenseRequest, DriverLicenseToken, Person } from '../masterdata.entities.js';

type Texts<K extends string> = Record<K, [string, string]>;

const GENDER: Texts<Gender> = { female: ['weiblich', 'female'], male: ['männlich', 'male'], diverse: ['divers', 'diverse'], unspecified: ['keine Angabe', 'not specified'] };
const EMPLOYMENT: Texts<Employment> = {
  volunteer: ['ehrenamtlich', 'volunteer'],
  'career-higher': ['hauptamtlich, höherer Dienst', 'career, higher service'],
  'career-elevated': ['hauptamtlich, gehobener Dienst', 'career, elevated service'],
  'career-intermediate': ['hauptamtlich, mittlerer Dienst', 'career, intermediate service'],
  'fire-service-employee': ['Beschäftigte(r) der Feuerwehr', 'employee of the fire service'],
  'administration-employee': ['Beschäftigte(r) der Verwaltung', 'employee of the administration'],
};
const STATUS: Texts<PersonStatus> = {
  probation: ['Probezeit', 'probation'],
  active: ['aktiv', 'active'],
  passive: ['passiv', 'passive'],
  youth: ['Jugendfeuerwehr', 'youth fire brigade'],
  veterans: ['Altersabteilung', 'veterans'],
  left: ['ausgeschieden', 'left'],
};
const RESULT: Texts<CourseResult> = { passed: ['bestanden', 'passed'], failed: ['nicht bestanden', 'failed'] };
const NOMINATION: Texts<NominationStatus> = {
  nominated: ['vorgemerkt', 'nominated'],
  registered: ['angemeldet', 'registered'],
  confirmed: ['bestätigt', 'confirmed'],
  rejected: ['abgelehnt', 'rejected'],
  completed: ['erledigt', 'completed'],
  failed: ['nicht bestanden', 'failed'],
};
const REST: Texts<RestPeriodReason> = { dormant: ['Ruhen der Mitgliedschaft', 'membership dormant'], 'other-brigade': ['Dienst in einer anderen Feuerwehr', 'service in another brigade'] };
const METHOD: Texts<DriverLicenseCheckMethod> = {
  'in-person': ['Vorlage bei der Feuerwehr', 'presented to the brigade'],
  transponder: ['Selbstkontrolle mit Transponder', 'self-check with transponder'],
  barcode: ['Selbstkontrolle mit Barcode', 'self-check with barcode'],
  legacy: ['Altdaten', 'legacy data'],
};

const notes = (value: string) => value || '–';
/** Newest first. */
const byDate = <T>(items: T[], date: (item: T) => string) => items.toSorted((a, b) => date(b).localeCompare(date(a)));

/**
 * Access report of the master data: the person file (contact, sensitive fields, memberships, career, courses, honours,
 * offices, rest periods, groups, internal notes) and the driving licence with its checks, requests and stickers. Other
 * persons (examiners, requesting users) are not named.
 */
@Injectable()
export class MasterdataDescription {
  constructor(private readonly em: EntityManager) {}

  async describePerson(personId: string, ctx: DescribeContext): Promise<PersonDataSection[]> {
    const em = this.em.fork();
    const person = await em.findOne(Person, personId, { populate: ['memberships.department', 'qualifications', 'ranks', 'honors', 'offices', 'restPeriods'] });
    if (!person) return [];
    const say = ([de, en]: [string, string]) => ctx.t(de, en);
    const catalog = new Map((await em.find(CatalogEntry, {})).map((c) => [`${c.kind}:${c.key}`, ctx.text(c.name)]));
    const name = (kind: string, key: string | null | undefined) => (key ? (catalog.get(`${kind}:${key}`) ?? key) : '–');
    const departments = new Map((await em.find(Department, {})).map((d) => [d.id, d.shortName]));
    const department = (id: string | null | undefined) => (id ? (departments.get(id) ?? ctx.t('eine frühere Abteilung', 'a former department')) : ctx.t('Gesamtwehr', 'whole brigade'));
    const attendances = await em.find(CourseAttendance, { person: personId }, { populate: ['course'], orderBy: { startsOn: 'desc' } });
    const nominations = await em.find(CourseNomination, { person: personId }, { populate: ['course', 'run'], orderBy: { createdAt: 'desc' } });
    const groups = (await em.find(DepartmentGroup, {}, { populate: ['department'] })).filter((g) => g.leader?.id === personId || g.memberIds.includes(personId));
    const course = (c: { name: { de: string; en: string } }, description: string) => (description ? `${ctx.text(c.name)}: ${description}` : ctx.text(c.name));

    // ----- Person -----
    const rows: { label: string; value: string }[] = [];
    const add = (label: string, value: string | null | undefined) => {
      if (value) rows.push({ label, value });
    };
    add(ctx.t('Name', 'Name'), [person.salutation, person.title, person.firstName, person.lastName].filter(Boolean).join(' '));
    add(ctx.t('Rufname', 'Nickname'), person.nickname);
    add(ctx.t('Personalnummer', 'Personnel number'), person.personnelNumber);
    add(ctx.t('Geburtsdatum', 'Date of birth'), person.birthDate ? ctx.date(person.birthDate) : '');
    add(ctx.t('Geburtsort', 'Place of birth'), person.birthPlace);
    if (person.gender !== 'unspecified') add(ctx.t('Geschlecht', 'Gender'), say(GENDER[person.gender as Gender]));
    add(ctx.t('Anschrift', 'Address'), [person.street, [person.postalCode, person.city].filter(Boolean).join(' ')].filter(Boolean).join(', '));
    add(ctx.t('Telefon privat', 'Phone (private)'), person.phonePrivate);
    add(ctx.t('Mobiltelefon', 'Mobile phone'), person.phoneMobile);
    add(ctx.t('Telefon dienstlich', 'Phone (work)'), person.phoneWork);
    add(ctx.t('E-Mail-Adresse', 'E-mail address'), person.email);
    add(ctx.t('Beschäftigung', 'Employment'), say(EMPLOYMENT[person.employment as Employment] ?? EMPLOYMENT.volunteer));
    const employer = person.employer;
    if (employer && (employer.name || employer.street || employer.city)) {
      add(
        ctx.t('Arbeitgeber', 'Employer'),
        [employer.name, employer.street, [employer.postalCode, employer.city].filter(Boolean).join(' '), employer.phone, employer.contact && ctx.t(`Ansprechpartner: ${employer.contact}`, `contact: ${employer.contact}`)]
          .filter(Boolean)
          .join(', '),
      );
      if (employer.iban) add(ctx.t('Bankverbindung des Arbeitgebers', 'Bank account of the employer'), ctx.iban(employer.iban));
      if (employer.lossOfEarningsAssignedFrom) add(ctx.t('Verdienstausfall an den Arbeitgeber abgetreten ab', 'Loss of earnings assigned to the employer from'), ctx.date(employer.lossOfEarningsAssignedFrom));
    }
    if (person.bank?.iban) add(ctx.t('Bankverbindung', 'Bank account'), [ctx.iban(person.bank.iban), person.bank.accountHolder && ctx.t(`Inhaber: ${person.bank.accountHolder}`, `holder: ${person.bank.accountHolder}`)].filter(Boolean).join(', '));
    add(ctx.t('Eintritt', 'Joined'), person.joinedOn ? ctx.date(person.joinedOn) : '');
    add(ctx.t('Status', 'Status'), say(STATUS[person.status]));
    add(ctx.t('Probezeit bis', 'Probation until'), person.probationEndsOn ? ctx.date(person.probationEndsOn) : '');
    add(ctx.t('Aufnahme entschieden am', 'Admission decided on'), person.probationDecidedOn ? ctx.date(person.probationDecidedOn) : '');
    add(ctx.t('Aufnahme', 'Admitted'), person.admittedOn ? ctx.date(person.admittedOn) : '');
    add(ctx.t('Austritt', 'Left'), person.leftOn ? ctx.date(person.leftOn) : '');
    add(ctx.t('Austrittsgrund', 'Reason for leaving'), person.exitReason ? name('exit-reason', person.exitReason) : '');
    add(ctx.t('Musiker', 'Musician'), ctx.yesNo(person.musician));
    add(ctx.t('Bemerkungen (intern)', 'Remarks (internal)'), person.notes);

    const blocks: PersonDataBlock[] = [{ kind: 'fields', title: ctx.t('Person', 'Person'), rows }];
    const table = (title: string, columns: string[], data: string[][]) => {
      if (data.length) blocks.push({ kind: 'table', title, columns, rows: data });
    };

    table(
      ctx.t('Mitgliedschaften', 'Memberships'),
      [ctx.t('Abteilung', 'Department'), ctx.t('Von', 'From'), ctx.t('Bis', 'Until'), ctx.t('Art', 'Kind')],
      byDate(person.memberships.getItems(), (m) => m.from).map((m) => [m.department.shortName, ctx.date(m.from), ctx.date(m.to), m.primary ? ctx.t('Stammabteilung', 'primary department') : ctx.t('zusätzlich', 'additional')]),
    );
    table(
      ctx.t('Dienstgrade', 'Ranks'),
      [ctx.t('Dienstgrad', 'Rank'), ctx.t('Seit', 'Since'), ctx.t('Bemerkung', 'Remark')],
      byDate(person.ranks.getItems(), (r) => r.since).map((r) => [name('rank', r.rank), ctx.date(r.since), notes(r.notes)]),
    );
    table(
      ctx.t('Qualifikationen', 'Qualifications'),
      [ctx.t('Qualifikation', 'Qualification'), ctx.t('Erworben', 'Acquired'), ctx.t('Gültig bis', 'Valid until'), ctx.t('Bemerkung', 'Remark')],
      byDate(person.qualifications.getItems(), (q) => q.acquiredOn).map((q) => [name('qualification', q.qualification), ctx.date(q.acquiredOn), ctx.date(q.validUntil), notes(q.notes)]),
    );
    table(
      ctx.t('Lehrgänge', 'Courses'),
      [ctx.t('Lehrgang', 'Course'), ctx.t('Von', 'From'), ctx.t('Bis', 'Until'), ctx.t('Ergebnis', 'Result'), ctx.t('Ort', 'Place'), ctx.t('Bemerkung', 'Remark')],
      attendances.map((a) => [course(a.course, a.description), ctx.date(a.startsOn), ctx.date(a.endsOn), say(RESULT[a.result]), ctx.value(a.location), notes(a.notes)]),
    );
    table(
      ctx.t('Vormerkungen für Lehrgänge', 'Course nominations'),
      [ctx.t('Lehrgang', 'Course'), ctx.t('Priorität', 'Priority'), ctx.t('Gewünschter Zeitraum', 'Desired period'), ctx.t('Termin', 'Date'), ctx.t('Stand', 'Status'), ctx.t('Bemerkung', 'Remark')],
      nominations.map((n) => [ctx.text(n.course.name), String(n.priority), ctx.value(n.desiredPeriod), n.run ? ctx.date(n.run.startsOn) : '–', say(NOMINATION[n.status as NominationStatus]), notes(n.notes)]),
    );
    table(
      ctx.t('Ehrungen', 'Honours'),
      [ctx.t('Ehrung', 'Honour'), ctx.t('Verliehen am', 'Awarded on'), ctx.t('Bemerkung', 'Remark')],
      byDate(person.honors.getItems(), (h) => h.awardedOn).map((h) => [name('honor', h.honor), ctx.date(h.awardedOn), notes(h.notes)]),
    );
    table(
      ctx.t('Ämter', 'Offices'),
      [ctx.t('Amt', 'Office'), ctx.t('Bereich', 'Area'), ctx.t('Von', 'From'), ctx.t('Bis', 'Until'), ctx.t('Bemerkung', 'Remark')],
      byDate(person.offices.getItems(), (o) => o.from).map((o) => [name('office', o.office), department(o.departmentId), ctx.date(o.from), ctx.date(o.to), notes(o.notes)]),
    );
    table(
      ctx.t('Ruhezeiten', 'Rest periods'),
      [ctx.t('Grund', 'Reason'), ctx.t('Von', 'From'), ctx.t('Bis', 'Until'), ctx.t('Bemerkung', 'Remark')],
      byDate(person.restPeriods.getItems(), (r) => r.from).map((r) => [say(REST[r.reason]), ctx.date(r.from), ctx.date(r.to), notes(r.notes)]),
    );
    table(
      ctx.t('Gruppen', 'Groups'),
      [ctx.t('Gruppe', 'Group'), ctx.t('Abteilung', 'Department'), ctx.t('Aufgabe', 'Task')],
      groups.map((g) => [g.name, g.department.shortName, g.leader?.id === personId ? ctx.t('Gruppenleitung', 'group leader') : ctx.t('Mitglied', 'member')]),
    );

    const sections: PersonDataSection[] = [
      {
        key: 'masterdata',
        title: ctx.t('Stammdaten', 'Master data'),
        activity: 'masterdata.persons',
        categories: [
          ctx.t('Stammdaten', 'Basic data'),
          ctx.t('Kontaktdaten', 'Contact details'),
          ctx.t('Bankverbindung und Arbeitgeber', 'Bank account and employer'),
          ctx.t('Mitgliedschaft und Laufbahn', 'Membership and career'),
          ctx.t('Qualifikationen und Lehrgänge', 'Qualifications and courses'),
          ctx.t('Ehrungen und Ämter', 'Honours and offices'),
          ctx.t('Bemerkungen', 'Remarks'),
        ],
        blocks,
        records: [{ entity: 'masterdata.person', ids: [personId], label: ctx.t('Personalakte', 'Personnel file') }],
        labels: {
          'masterdata.membership': ctx.t('Mitgliedschaft', 'Membership'),
          'masterdata.person_qualification': ctx.t('Qualifikation', 'Qualification'),
          'masterdata.rank_assignment': ctx.t('Dienstgrad', 'Rank'),
          'masterdata.honor_award': ctx.t('Ehrung', 'Honour'),
          'masterdata.office_assignment': ctx.t('Amt', 'Office'),
          'masterdata.rest_period': ctx.t('Ruhezeit', 'Rest period'),
          'masterdata.course_attendance': ctx.t('Lehrgangsteilnahme', 'Course attendance'),
          'masterdata.course_nomination': ctx.t('Vormerkung für einen Lehrgang', 'Course nomination'),
          'masterdata.driver_license_check': ctx.t('Führerscheinkontrolle', 'Driving licence check'),
          'masterdata.driver_license_request': ctx.t('Aufforderung zur Vorlage des Führerscheins', 'Request to present the driving licence'),
          'masterdata.driver_license_token': ctx.t('Transponder für den Führerschein', 'Driving licence sticker'),
        },
      },
    ];

    // ----- Driving licence -----
    const checks = await em.find(DriverLicenseCheck, { person: personId }, { orderBy: { checkedOn: 'desc', recordedAt: 'desc' } });
    const requests = await em.find(DriverLicenseRequest, { person: personId }, { orderBy: { requestedAt: 'desc' } });
    const tokens = await em.find(DriverLicenseToken, { person: personId }, { orderBy: { registeredAt: 'desc' } });
    const license = person.driverLicense;
    const classes = (list: { class: string; expiresOn: string | null }[]) =>
      list.map((c) => (c.expiresOn ? ctx.t(`${c.class} (bis ${ctx.date(c.expiresOn)})`, `${c.class} (until ${ctx.date(c.expiresOn)})`) : c.class)).join(', ') || '–';
    if (license?.classes?.length || license?.documentExpiresOn || license?.legacyCheckedOn || checks.length || requests.length || tokens.length) {
      const licenseBlocks: PersonDataBlock[] = [
        {
          kind: 'fields',
          rows: [
            { label: ctx.t('Klassen', 'Classes'), value: classes(license?.classes ?? []) },
            { label: ctx.t('Dokument gültig bis', 'Document valid until'), value: ctx.date(license?.documentExpiresOn) },
            { label: ctx.t('Letzte Kontrolle', 'Last check'), value: ctx.date(license?.lastCheckedOn ?? license?.legacyCheckedOn) },
          ],
        },
      ];
      if (checks.length) {
        licenseBlocks.push({
          kind: 'table',
          title: ctx.t('Kontrollen', 'Checks'),
          columns: [ctx.t('Datum', 'Date'), ctx.t('Art', 'Kind'), ctx.t('Geprüft von', 'Checked by'), ctx.t('Original vorgelegt', 'Original presented'), ctx.t('Klassen', 'Classes'), ctx.t('Bemerkung', 'Remark')],
          rows: await Promise.all(
            checks.map(async (c) => [
              ctx.date(c.checkedOn),
              [say(METHOD[c.method]), c.device && ctx.t(`am Gerät „${c.device}“`, `at device "${c.device}"`)].filter(Boolean).join(', '),
              c.checkedBy ? await ctx.person(c.checkedBy.id) : '–',
              ctx.yesNo(c.originalPresented),
              classes(c.classes),
              [
                c.note,
                c.selfDeclaration && ctx.t('Selbsterklärung bestätigt', 'self-declaration confirmed'),
                c.cancelledAt && ctx.t(`storniert am ${ctx.date(c.cancelledAt)}${c.cancelReason ? `: ${c.cancelReason}` : ''}`, `cancelled on ${ctx.date(c.cancelledAt)}${c.cancelReason ? `: ${c.cancelReason}` : ''}`),
              ]
                .filter(Boolean)
                .join('; ') || '–',
            ]),
          ),
        });
      }
      if (requests.length) {
        licenseBlocks.push({
          kind: 'table',
          title: ctx.t('Aufforderungen zur erneuten Vorlage', 'Requests to present it again'),
          columns: [ctx.t('Angefordert am', 'Requested on'), ctx.t('Grund', 'Reason'), ctx.t('Fällig', 'Due'), ctx.t('Stand', 'Status')],
          rows: requests.map((r) => [
            ctx.date(r.requestedAt),
            r.reason,
            ctx.date(r.dueOn),
            r.completedByCheckId
              ? ctx.t('erledigt durch eine Kontrolle', 'settled by a check')
              : r.withdrawnAt
                ? ctx.t(`zurückgenommen am ${ctx.date(r.withdrawnAt)}${r.withdrawReason ? `: ${r.withdrawReason}` : ''}`, `withdrawn on ${ctx.date(r.withdrawnAt)}${r.withdrawReason ? `: ${r.withdrawReason}` : ''}`)
                : ctx.t('offen', 'open'),
          ]),
        });
      }
      if (tokens.length) {
        licenseBlocks.push({
          kind: 'table',
          title: ctx.t('Transponder und Barcodes am Führerschein', 'Stickers on the driving licence'),
          columns: [ctx.t('Art', 'Kind'), ctx.t('Kennung endet auf', 'ID ending in'), ctx.t('Registriert am', 'Registered on'), ctx.t('Gesperrt', 'Revoked')],
          rows: tokens.map((t) => [
            t.kind === 'nfc' ? ctx.t('NFC-Transponder', 'NFC sticker') : ctx.t('Barcode', 'barcode'),
            t.suffix,
            ctx.date(t.registeredAt),
            t.revokedAt ? `${ctx.date(t.revokedAt)}${t.revokeReason ? `: ${t.revokeReason}` : ''}` : ctx.t('nein', 'no'),
          ]),
        });
      }
      sections.push({
        key: 'masterdata.driver-license',
        title: ctx.t('Führerschein', 'Driving licence'),
        activity: 'masterdata.driver-licenses',
        categories: [ctx.t('Führerscheinklassen und Kontrollen', 'Driving licence classes and checks')],
        blocks: licenseBlocks,
      });
    }
    return sections;
  }
}
