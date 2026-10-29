import type { Language, LocalizedText } from '@forga/core-contracts';
import type { DescribeContext } from './person-description.js';

/** What the context needs to know about a user account to name it by its function. */
export interface DescribedAccount {
  /** Technical users carry API tokens: named by the token („Schnittstelle …“). */
  technical: boolean;
  roles: LocalizedText[];
  tokenName: string | null;
}

const LOCALE: Record<Language, string> = { de: 'de-DE', en: 'en-GB' };
const ZONE = 'Europe/Berlin';
const EMPTY = '–';

const isEmpty = (value: unknown) => value === null || value === undefined || value === '';

/** `YYYY-MM-DD` without time (a day) or an instant. */
function toDate(value: Date | string): { day: string } | { instant: Date } | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : { instant: value };
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return { day: value };
  const instant = new Date(value);
  return Number.isNaN(instant.getTime()) ? null : { instant };
}

/** Formats a day: `21.10.2026` in German, `21 Oct 2026` in English. */
export function formatReportDay(day: string, language: Language): string {
  const [year, month, date] = day.split('-');
  if (language === 'de') return `${date}.${month}.${year}`;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(date))).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function dayOf(instant: Date): string {
  return instant.toLocaleDateString('sv-SE', { timeZone: ZONE });
}

function timeOf(instant: Date): string {
  return instant.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: ZONE });
}

export interface DescribeContextOptions {
  language: Language;
  asOf: Date;
  personId: string;
  /** Name of the person, used where the person itself is referenced. */
  personName: string;
  ownUserIds: readonly string[];
  /** A user account by ID; `null` if unknown. */
  account?: (userId: string) => Promise<DescribedAccount | null>;
  /** The active user account linked to another person, to name the person by function. */
  accountOfPerson?: (personId: string) => Promise<DescribedAccount | null>;
}

/** The helpers for `describePerson`: formatting in the language of the report and naming others only by function. */
export function createDescribeContext(options: DescribeContextOptions): DescribeContext {
  const { language, personId, personName } = options;
  const own = new Set(options.ownUserIds);
  const t = (de: string, en: string) => (language === 'de' ? de : en);
  const text = (value: LocalizedText) => value[language] || value.de;
  const actors = new Map<string, Promise<string>>();
  const persons = new Map<string, Promise<string>>();

  const functionOf = (account: DescribedAccount | null): string => {
    if (!account) return t('Benutzer der Feuerwehr', 'user of the brigade');
    const roles = [...new Set(account.roles.map(text))].toSorted((a, b) => a.localeCompare(b, LOCALE[language]));
    return roles.length ? roles.join(', ') : t('Benutzer der Feuerwehr', 'user of the brigade');
  };

  const date = (value: Date | string | null | undefined): string => {
    if (isEmpty(value)) return EMPTY;
    const parsed = toDate(value!);
    if (!parsed) return EMPTY;
    return formatReportDay('day' in parsed ? parsed.day : dayOf(parsed.instant), language);
  };

  return {
    language,
    asOf: options.asOf,
    personId,
    ownUserIds: own,
    text,
    t,
    date,
    dateTime(value) {
      if (isEmpty(value)) return EMPTY;
      const parsed = toDate(value!);
      if (!parsed) return EMPTY;
      return 'day' in parsed ? formatReportDay(parsed.day, language) : `${formatReportDay(dayOf(parsed.instant), language)} ${timeOf(parsed.instant)}`;
    },
    time(value) {
      if (isEmpty(value)) return EMPTY;
      const parsed = toDate(value!);
      return parsed && 'instant' in parsed ? timeOf(parsed.instant) : EMPTY;
    },
    money(amount) {
      if (amount === null || amount === undefined || Number.isNaN(amount)) return EMPTY;
      return amount.toLocaleString(LOCALE[language], { style: 'currency', currency: 'EUR' });
    },
    number(value, fractionDigits) {
      return value.toLocaleString(LOCALE[language], fractionDigits === undefined ? {} : { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
    },
    yesNo(value) {
      if (value === null || value === undefined) return EMPTY;
      return value ? t('ja', 'yes') : t('nein', 'no');
    },
    iban(value) {
      const compact = (value ?? '').replace(/\s+/g, '');
      if (!compact) return EMPTY;
      return t(`IBAN endet auf ${compact.slice(-4)}`, `IBAN ending in ${compact.slice(-4)}`);
    },
    value(value) {
      if (isEmpty(value)) return EMPTY;
      return typeof value === 'number' ? value.toLocaleString(LOCALE[language]) : String(value);
    },
    actor(userId) {
      if (!userId) return Promise.resolve(t('automatisch (System)', 'automatically (system)'));
      if (own.has(userId)) return Promise.resolve(t('Sie selbst', 'you'));
      let cached = actors.get(userId);
      if (!cached) {
        cached = (async () => {
          const account = options.account ? await options.account(userId) : null;
          if (account?.technical) return account.tokenName ? t(`Schnittstelle „${account.tokenName}“`, `interface "${account.tokenName}"`) : t('Schnittstelle', 'interface');
          return functionOf(account);
        })();
        actors.set(userId, cached);
      }
      return cached;
    },
    person(otherId) {
      if (!otherId) return Promise.resolve(EMPTY);
      if (otherId === personId) return Promise.resolve(personName);
      let cached = persons.get(otherId);
      if (!cached) {
        cached = (async () => {
          const account = options.accountOfPerson ? await options.accountOfPerson(otherId) : null;
          return account ? functionOf(account) : t('andere Person', 'another person');
        })();
        persons.set(otherId, cached);
      }
      return cached;
    },
  };
}
