import { Inject, Injectable, Logger } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import type { ErasureArea, LocalizedText } from '@forga/core-contracts';
import { FORGA_CORE_OPTIONS, type ForgaCoreOptions } from '../options.js';
import { OrganizationDirectory } from '../security/organization-directory.js';
import { User } from '../security/security.entities.js';

export type { ErasureArea } from '@forga/core-contracts';

/** Replaces names of anonymised persons in other records; reads the same in every language. */
export const ANONYMIZED_NAME = 'N. N.';

/** First and last name of a person, e.g. for records that keep a copy of them (promotion lists). */
export interface PersonName {
  id: string;
  firstName: string;
  lastName: string;
}

/** Collected before anything is anonymised, so modules can find copies of the names in their records. */
export interface AnonymizeContext {
  /**
   * Full names ("Vorname Nachname", "Nachname, Vorname") and display names of the accounts of the persons, as copied into
   * other records ("erfasst von", "storniert von"); only names that no other person or account carries.
   */
  names: readonly string[];
  /** The persons with their names. */
  persons: readonly PersonName[];
  /** Accounts linked to the persons. */
  userIds: readonly string[];
}

/** A retention period that still runs for a data area (Art. 17(3)): until when and why. */
export interface RetentionHold {
  until: string | null;
  reason: LocalizedText;
}

export interface ErasureContext {
  /** Today in Europe/Berlin (`YYYY-MM-DD`). */
  today: string;
  /**
   * The retention period of a category of the retention plan for records whose period starts at `since` (`null`: the
   * event has not happened yet, e.g. the person has not left). `null` if the period is over, so the area may be erased;
   * otherwise the end (`null` if no period is set) and the reason, e.g. "Personalstammrolle: 15 Jahre nach Austritt".
   */
  retain(category: string, since: string | null): RetentionHold | null;
}

/** A row of the erasure check as a module reports it; `identity`: erasing it removes the person's name. */
export type ErasureAreaInput = Omit<ErasureArea, 'module'> & { identity?: boolean };

/** What a module does with the data it keeps about persons (L7 erasure, L13 anonymisation). */
export interface PersonDataHandler {
  /**
   * Complete anonymisation (retention plan, L13): removes or neutralises everything the module stores about these
   * persons beyond what statistics need, including copies of their names (`ctx.names`) and the history holding them.
   */
  anonymize(personIds: readonly string[], ctx: AnonymizeContext): Promise<void>;
  /**
   * Erasure check (Art. 17): per data area what may be deleted, what only anonymised and what has to be kept until the
   * end of its retention period. No rows for areas without data.
   */
  erasure(personId: string, ctx: ErasureContext): Promise<ErasureAreaInput[]>;
  /** Deletes or anonymises the given areas of the check (never those to keep). */
  erase(personId: string, areas: readonly ErasureArea[], ctx: AnonymizeContext): Promise<void>;
}

/** Characters a name may have to be replaced in JSON and text columns without breaking them. */
const SAFE_NAME = /^[\p{L}\p{M} .,'-]+$/u;
/** Order of the erasure check: master data first, the core (account, protocols) last. */
const rank = (module: string) => (module === 'masterdata' ? 0 : module === 'core' ? 2 : 1);

/**
 * Modules register how they erase and anonymise the data they keep about persons. The master data module calls
 * `anonymize` when it anonymises persons (retention plan); the erasure of a request goes through `erasure`/`erase`.
 * After the modules, remaining copies of the full names in any text or JSON column (audit log, history, "by" fields)
 * become "N. N.".
 */
@Injectable()
export class PersonDataRegistry {
  private readonly logger = new Logger(PersonDataRegistry.name);
  readonly handlers = new Map<string, PersonDataHandler>();

  constructor(
    private readonly em: EntityManager,
    private readonly organization: OrganizationDirectory,
    @Inject(FORGA_CORE_OPTIONS) private readonly options: ForgaCoreOptions,
  ) {}

  register(module: string, handler: PersonDataHandler): void {
    this.handlers.set(module, handler);
  }

  /** Complete anonymisation in all modules; `except` leaves out the calling module (the master data). */
  async anonymize(personIds: readonly string[], options: { except?: string } = {}): Promise<void> {
    if (!personIds.length) return;
    const ctx = await this.context(personIds);
    for (const [module, handler] of this.handlers) if (module !== options.except) await handler.anonymize(personIds, ctx);
    await this.replaceNames(ctx.names);
  }

  /** The erasure check of all modules: master data first, the other modules in their order, the core last. */
  async erasure(personId: string, ctx: ErasureContext): Promise<ErasureArea[]> {
    const areas: ErasureArea[] = [];
    for (const [module, handler] of this.handlers) {
      for (const { identity: _identity, ...area } of await handler.erasure(personId, ctx)) areas.push({ ...area, module });
    }
    return areas.toSorted((a, b) => rank(a.module) - rank(b.module));
  }

  /**
   * Deletes or anonymises what the check allows. Once the area holding the name is erased (`identity`), the remaining
   * copies of the names are replaced, too.
   */
  async erase(personId: string, ctx: ErasureContext): Promise<ErasureArea[]> {
    const names = await this.context([personId]);
    const done: ErasureArea[] = [];
    let identity = false;
    for (const [module, handler] of this.handlers) {
      const areas = (await handler.erasure(personId, ctx)).filter((a) => a.outcome !== 'keep');
      if (!areas.length) continue;
      identity ||= areas.some((a) => a.identity);
      const rows = areas.map(({ identity: _identity, ...area }) => ({ ...area, module }));
      await handler.erase(personId, rows, names);
      done.push(...rows);
    }
    if (identity) await this.replaceNames(names.names);
    return done;
  }

  /** Names of the persons and their accounts, without those other persons or accounts carry as well. */
  async context(personIds: readonly string[]): Promise<AnonymizeContext> {
    const ids = new Set(personIds);
    const em = this.em.fork();
    const persons = ((await this.organization.persons([...ids])) ?? []).map((p) => ({ id: p.id, firstName: p.firstName, lastName: p.lastName }));
    const users = await em.find(User, { personId: { $in: [...ids] } }, { fields: ['id', 'displayName'] });
    const candidates = new Set([
      ...persons.flatMap((p) => [`${p.firstName} ${p.lastName}`, `${p.lastName}, ${p.firstName}`]),
      ...users.map((u) => u.displayName),
    ].map((n) => n.trim()));
    // A name another person or account carries as well cannot be told apart: it stays.
    const others = (await this.organization.allPersonIds()).filter((id) => !ids.has(id));
    const taken = new Set<string>();
    for (const p of (others.length ? await this.organization.persons(others) : []) ?? []) {
      taken.add(`${p.firstName} ${p.lastName}`.trim());
      taken.add(`${p.lastName}, ${p.firstName}`.trim());
    }
    for (const u of await em.find(User, { displayName: { $in: [...candidates] }, $or: [{ personId: null }, { personId: { $nin: [...ids] } }] }, { fields: ['displayName'] })) {
      taken.add(u.displayName.trim());
    }
    // Only names of at least two parts: a single word ("Admin", "Kommandant") would hit unrelated texts.
    const names = [...candidates].filter((n) => !taken.has(n) && n !== ANONYMIZED_NAME && SAFE_NAME.test(n) && /[\s,]/.test(n) && n.replace(/[\s,.]/g, '').length >= 4);
    return { names, persons, userIds: users.map((u) => u.id) };
  }

  /**
   * Replaces the names in every text and JSON column of the core and the modules (audit log, history, settings, "by"
   * fields, free texts) with "N. N.".
   */
  async replaceNames(names: readonly string[]): Promise<number> {
    if (!names.length) return 0;
    const schemas = ['core', ...this.options.modules.map((m) => m.manifest.id.replace(/-/g, '_'))];
    const connection = this.em.getConnection();
    const columns: { table_schema: string; table_name: string; column_name: string; data_type: string }[] = await connection.execute(
      `select c.table_schema, c.table_name, c.column_name, c.data_type from information_schema.columns c
         join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
        where c.table_schema in (?) and c.data_type in ('text', 'character varying', 'json', 'jsonb')`,
      [schemas],
    );
    let changed = 0;
    for (const column of columns) {
      const json = column.data_type === 'json' || column.data_type === 'jsonb';
      const value = json ? `"${column.column_name}"::text` : `"${column.column_name}"`;
      let replaced = value;
      for (let i = 0; i < names.length; i++) replaced = `replace(${replaced}, ?, '${ANONYMIZED_NAME}')`;
      const set = json ? `(${replaced})::${column.data_type}` : replaced;
      const where = names.map(() => `strpos(${value}, ?) > 0`).join(' or ');
      const result = await connection.execute(`update "${column.table_schema}"."${column.table_name}" set "${column.column_name}" = ${set} where ${where}`, [...names, ...names], 'run');
      changed += (result as { affectedRows?: number }).affectedRows ?? 0;
    }
    if (changed) this.logger.log(`Replaced names of anonymised persons in ${changed} fields.`);
    return changed;
  }
}
