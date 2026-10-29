import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import type { ErasureArea, ErasureAreaInput, ErasureContext, PersonDataHandler } from '@forga/core-api';
import { CourseAttendance, CourseNomination } from '../courses/course.entities.js';
import { DriverLicenseCheck, DriverLicenseRequest, DriverLicenseToken, Membership, Person, RankAssignment } from '../masterdata.entities.js';
import { MasterdataData } from './masterdata.data.js';

const iso = (date: Date | string | null | undefined) => (date ? (typeof date === 'string' ? date : date.toISOString()).slice(0, 10) : null);
const count = (n: number, de: [string, string], en: [string, string]) => (n ? { de: `${n} ${n === 1 ? de[0] : de[1]}`, en: `${n} ${n === 1 ? en[0] : en[1]}` } : null);
const join = (parts: ({ de: string; en: string } | null)[]) => {
  const present = parts.filter((p): p is { de: string; en: string } => p !== null);
  return { de: present.map((p) => p.de).join(', '), en: present.map((p) => p.en).join(', ') };
};

/**
 * Erasure of the master data (Art. 17), in three areas: contact data (deleted after leaving), the person file
 * (Personalakte, kept for its period after leaving) and the basic data (Personalstammrolle: name, memberships, ranks;
 * kept for its period, then anonymised).
 */
@Injectable()
export class MasterdataErasure implements PersonDataHandler {
  constructor(
    private readonly em: EntityManager,
    private readonly data: MasterdataData,
  ) {}

  /** The master data module itself anonymises the persons; the other modules follow (`PersonDataRegistry`). */
  async anonymize(personIds: readonly string[]): Promise<void> {
    await this.data.anonymizePersons(personIds, { cascade: false });
  }

  async erasure(personId: string, ctx: ErasureContext): Promise<ErasureAreaInput[]> {
    const em = this.em.fork();
    const person = await em.findOne(Person, personId, { populate: ['qualifications', 'honors', 'offices', 'restPeriods'] });
    if (!person) return [];
    const leftOn = person.status === 'left' ? iso(person.leftOn) : null;
    const areas: ErasureAreaInput[] = [];
    const contact = [person.street, person.postalCode, person.city, person.phonePrivate, person.phoneMobile, person.phoneWork, person.email, person.birthPlace, person.notes, person.nickname].some(Boolean) || Boolean(person.birthDate || person.employer || person.bank);
    if (contact) {
      // Contact data are needed while the person is a member; after leaving nothing requires keeping them.
      const hold = leftOn ? null : ctx.retain('masterdata.person-file', null);
      areas.push({
        key: 'masterdata.contact',
        title: { de: 'Stammdaten', en: 'Master data' },
        data: { de: 'Kontakt, Geburtsdatum, Bankverbindung, Arbeitgeber, Bemerkungen', en: 'Contact, date of birth, bank account, employer, remarks' },
        count: 1,
        outcome: hold ? 'keep' : 'delete',
        keepUntil: hold?.until ?? null,
        reason: hold?.reason ?? null,
      });
    }
    if (!person.fileAnonymizedAt) {
      const [courses, nominations, checks, requests, tokens] = await Promise.all([
        em.count(CourseAttendance, { person }),
        em.count(CourseNomination, { person }),
        em.count(DriverLicenseCheck, { person }),
        em.count(DriverLicenseRequest, { person }),
        em.count(DriverLicenseToken, { person }),
      ]);
      const license = person.driverLicense?.classes?.length || checks || requests || tokens ? 1 : 0;
      const parts = [
        count(person.qualifications.length, ['Qualifikation', 'Qualifikationen'], ['qualification', 'qualifications']),
        count(courses + nominations, ['Lehrgang', 'Lehrgänge'], ['course', 'courses']),
        count(person.honors.length, ['Ehrung', 'Ehrungen'], ['honour', 'honours']),
        count(person.offices.length, ['Amt', 'Ämter'], ['office', 'offices']),
        count(person.restPeriods.length, ['Ruhezeit', 'Ruhezeiten'], ['rest period', 'rest periods']),
        license ? { de: `Führerschein (${checks} ${checks === 1 ? 'Kontrolle' : 'Kontrollen'})`, en: `Driving licence (${checks} ${checks === 1 ? 'check' : 'checks'})` } : null,
      ];
      const total = person.qualifications.length + courses + nominations + person.honors.length + person.offices.length + person.restPeriods.length + checks + requests + tokens + license;
      if (total) {
        const hold = ctx.retain('masterdata.person-file', leftOn);
        areas.push({ key: 'masterdata.person-file', title: { de: 'Personalakte', en: 'Personnel file' }, data: join(parts), count: total, outcome: hold ? 'keep' : 'delete', keepUntil: hold?.until ?? null, reason: hold?.reason ?? null });
      }
    }
    if (!person.anonymizedAt) {
      const memberships = await em.count(Membership, { person });
      const ranks = await em.count(RankAssignment, { person });
      const hold = ctx.retain('masterdata.person-core', leftOn);
      areas.push({
        key: 'masterdata.person-core',
        title: { de: 'Grunddaten', en: 'Basic data' },
        data: join([{ de: 'Name, Personalnummer', en: 'Name, personnel number' }, count(memberships, ['Mitgliedschaft', 'Mitgliedschaften'], ['membership', 'memberships']), count(ranks, ['Dienstgrad', 'Dienstgrade'], ['rank', 'ranks'])]),
        count: 1 + memberships + ranks,
        outcome: hold ? 'keep' : 'anonymize',
        keepUntil: hold?.until ?? null,
        reason: hold?.reason ?? { de: 'Name „N. N.“; Mitgliedschaften und Dienstgrade bleiben für die Statistik', en: 'Name "N. N."; memberships and ranks stay for the statistics' },
        identity: true,
      });
    }
    return areas;
  }

  async erase(personId: string, areas: readonly ErasureArea[]): Promise<void> {
    const keys = new Set(areas.map((a) => a.key));
    if (keys.has('masterdata.contact')) await this.data.eraseContact(personId);
    if (keys.has('masterdata.person-file')) await this.data.eraseFile(personId);
    if (keys.has('masterdata.person-core')) await this.data.anonymizeNames([personId]);
  }
}
