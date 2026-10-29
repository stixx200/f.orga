import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  ImportField,
  ImportLookupEntry,
  ImportLookupInfo,
  ImportMapping,
  ImportMappingTargetState,
  ImportOption,
  ImportProfileInfo,
  ImportResult,
  ImportSource,
  ImportUnmatched,
  ImportValueMappings,
  LocalizedText,
} from '@forga/core-contracts';
import type { AuthenticatedUser } from '../security/authenticated-user.js';
import { isTestStage } from '../stage.js';
import { normalizeHeading } from './parse.js';

export interface ImportContext {
  user: AuthenticatedUser;
  options: Record<string, boolean>;
  /** `true` for the preview: compute the result, but change nothing. */
  dryRun: boolean;
  /** Who runs the import: the table import (`core`) or a module, e.g. `mp-feuer` with the ID of its run. */
  source: ImportSource;
  /**
   * Key of the entry chosen for a value that matches no entry of the lookup `kind`, or `undefined`: first the
   * mappings of the request, then the remembered mappings of the caller's list. Profiles ask only after their own
   * matching (key, name, abbreviation) failed; every answer counts as used and is remembered after an apply.
   */
  mapped(kind: string, value: string): string | undefined;
  /** Reports a value that matches no entry of the lookup `kind` (once per row); the result lists it with its count. */
  unmatched(kind: string, value: string): void;
}

/** What a profile returns; the core adds the unmatched values. */
export type ImportRunResult = Omit<ImportResult, 'unmatched'>;

/** Remembered mappings: lookup kind → normalized value (`normalizeHeading`) → key of the target. */
export type RememberedValues = ReadonlyMap<string, ReadonlyMap<string, string>>;

/** The parts of the context the caller of a profile decides. */
export type ImportRunInput = Pick<ImportContext, 'user' | 'options' | 'dryRun' | 'source'> & {
  mappings: ImportValueMappings;
  /** Mappings of earlier imports, consulted after `mappings`; only with active targets. */
  remembered?: RememberedValues;
};

/** A mapping a profile used in a run. */
export interface UsedMapping {
  kind: string;
  /** The value as the profile asked for it (trimmed). */
  value: string;
  key: string;
  /** Came from the remembered mappings, not from the request. */
  remembered: boolean;
}

export interface ImportRunOutcome {
  result: ImportResult;
  used: UsedMapping[];
}

/**
 * Entries that values of an import can be mapped to, e.g. the qualifications of the catalog. Modules register a
 * lookup for every kind their profiles report as unmatched.
 */
export interface ImportLookup {
  kind: string;
  name: LocalizedText;
  keyFormat: ImportLookupInfo['keyFormat'];
  /** Active entries that may be chosen. */
  entries(): Promise<ImportLookupEntry[]>;
  /**
   * All entries including inactive ones, so lists of remembered mappings can tell an inactive target from a deleted
   * one; without, every entry missing in `entries` counts as deleted.
   */
  all?(): Promise<ImportLookupEntry[]>;
  /** Creating entries from the import; without, entries can only be chosen. */
  create?: {
    permission: string;
    /** Throws the module's error codes, e.g. `catalog.keyTaken`. */
    run(input: { key: string; name: string }): Promise<ImportLookupEntry>;
  };
}

/**
 * Further targets a module offers for the values of another module's lookup `kind`, e.g. "no function – during
 * working hours" (incidents) beside the functions of the catalog (masterdata). The entries are listed after those of
 * the lookup and may be chosen and remembered like them. Profiles that do not know an extra key treat it as unmatched.
 */
export interface ImportLookupExtras {
  kind: string;
  /** Keys start with `<module>:`, so they never collide with keys of the lookup, e.g. `incidents:ignore`. */
  entries(): Promise<ImportLookupEntry[]>;
}

/** One data row with field keys and the 1-based row number in the file. */
export interface ImportRow {
  row: number;
  values: Record<string, string>;
}

export interface ImportProfile {
  id: string;
  name: LocalizedText;
  description?: LocalizedText;
  /** Needed in at least one department; profiles check departments per row themselves. */
  permission: string;
  fields: ImportField[];
  options?: ImportOption[];
  /**
   * Brings personal data of the members (e.g. the persons themselves): locked on the test system (`FORGA_STAGE=test`),
   * which is only for demo data. The demo data of `npm run seed` passes `demoData`.
   */
  personData?: boolean;
  /** Must be idempotent: a second run with the same file updates instead of duplicating. */
  run(rows: ImportRow[], context: ImportContext): Promise<ImportRunResult>;
}

/** Target of a remembered mapping: its name and whether it may still be applied. */
export interface MappingTarget {
  name: LocalizedText | null;
  state: ImportMappingTargetState;
}

/** Collects the import profiles of all modules. Modules register in `onModuleInit`. */
@Injectable()
export class ImportRegistry {
  private readonly profiles = new Map<string, { module: string; profile: ImportProfile }>();
  private readonly lookupsByKind = new Map<string, ImportLookup>();
  private readonly extrasByKind = new Map<string, { module: string; extras: ImportLookupExtras }[]>();

  register(module: string, profile: ImportProfile): void {
    if (!profile.id.startsWith(`${module}.`)) {
      throw new Error(`Import profile "${profile.id}" of module "${module}" must start with "${module}.".`);
    }
    this.profiles.set(profile.id, { module, profile });
  }

  registerLookup(module: string, lookup: ImportLookup): void {
    if (this.lookupsByKind.has(lookup.kind)) throw new Error(`Import lookup "${lookup.kind}" of module "${module}" is already registered.`);
    this.lookupsByKind.set(lookup.kind, lookup);
  }

  /** Adds the targets of `module` to the lookup `extras.kind` (which may be registered by another module). */
  registerLookupExtras(module: string, extras: ImportLookupExtras): void {
    this.extrasByKind.set(extras.kind, [...(this.extrasByKind.get(extras.kind) ?? []), { module, extras }]);
  }

  lookup(kind: string): ImportLookup | undefined {
    return this.lookupsByKind.get(kind);
  }

  /** The entries of the lookup `kind` followed by the extras of other modules; `undefined` for an unknown lookup. */
  async entries(kind: string): Promise<ImportLookupEntry[] | undefined> {
    return (await this.targets(kind))?.map((t) => t.entry);
  }

  /**
   * The state of the targets `keys` of the lookup `kind`: `active` (an entry or extra that may be chosen), `inactive`
   * (an entry of `ImportLookup.all` only) or `deleted` (unknown, also for a lookup nobody offers).
   */
  async describeTargets(kind: string, keys: readonly string[]): Promise<Map<string, MappingTarget>> {
    const lookup = this.lookup(kind);
    const active = new Map(((await this.targets(kind)) ?? []).map((t) => [t.entry.key, t.entry.name]));
    const all = new Map(((lookup?.all ? await lookup.all() : undefined) ?? []).map((e) => [e.key, e.name]));
    return new Map(
      keys.map((key): [string, MappingTarget] => [
        key,
        { name: active.get(key) ?? all.get(key) ?? null, state: active.has(key) ? 'active' : all.has(key) ? 'inactive' : 'deleted' },
      ]),
    );
  }

  /** Entries of a lookup with the extras that offer them (none for the lookup's own entries). */
  private async targets(kind: string): Promise<{ entry: ImportLookupEntry; extras?: ImportLookupExtras }[] | undefined> {
    const lookup = this.lookup(kind);
    if (!lookup) return undefined;
    const own = (await lookup.entries()).map((entry) => ({ entry }));
    const added = await Promise.all(
      (this.extrasByKind.get(kind) ?? []).map(async ({ module, extras }) =>
        (await extras.entries()).map((entry) => {
          if (!entry.key.startsWith(`${module}:`)) throw new Error(`Import lookup extra "${entry.key}" of module "${module}" must start with "${module}:".`);
          return { entry, extras };
        }),
      ),
    );
    return [...own, ...added.flat()];
  }

  lookups(user: AuthenticatedUser): ImportLookupInfo[] {
    return [...this.lookupsByKind.values()].map((l) => ({
      kind: l.kind,
      name: l.name,
      keyFormat: l.keyFormat,
      creatable: !!l.create && user.can(l.create.permission),
    }));
  }

  /**
   * Runs a profile with the chosen entries for unknown values and collects the values that stay unmatched and the
   * mappings the profile used (the caller remembers them after an apply).
   * Throws `imports.unknownLookup` or `imports.unknownMappingTarget` for mappings that point nowhere.
   */
  async run(profile: ImportProfile, rows: ImportRow[], { mappings, remembered, ...input }: ImportRunInput): Promise<ImportRunOutcome> {
    await this.assertMappings(mappings);
    const unmatched = new Map<string, ImportUnmatched>();
    const used = new Map<string, UsedMapping>();
    const result = await profile.run(rows, {
      ...input,
      mapped: (kind, value) => {
        const text = value.trim();
        if (!text) return undefined;
        const values = mappings[kind];
        const chosen = values && Object.hasOwn(values, text) ? values[text] : undefined;
        const key = chosen ?? remembered?.get(kind)?.get(normalizeHeading(text));
        if (key === undefined) return undefined;
        used.set(JSON.stringify([kind, text]), { kind, value: text, key, remembered: chosen === undefined });
        return key;
      },
      unmatched: (kind, value) => {
        const text = value.trim();
        const id = JSON.stringify([kind, text]);
        const entry = unmatched.get(id) ?? { kind, value: text, count: 0 };
        entry.count++;
        unmatched.set(id, entry);
      },
    });
    return { result: { ...result, unmatched: [...unmatched.values()] }, used: [...used.values()] };
  }

  /** Throws `imports.unknownLookup` or `imports.unknownMappingTarget` unless every mapping points to an active target. */
  async assertMappings(mappings: ImportValueMappings): Promise<void> {
    for (const [kind, values] of Object.entries(mappings)) {
      const targets = await this.targets(kind);
      if (!targets) throw new BadRequestException({ code: 'imports.unknownLookup', kind });
      const keys = new Set(targets.map((t) => t.entry.key));
      for (const [value, key] of Object.entries(values)) {
        if (!keys.has(key)) throw new BadRequestException({ code: 'imports.unknownMappingTarget', kind, value, key });
      }
    }
  }

  get(id: string): ImportProfile | undefined {
    return this.profiles.get(id)?.profile;
  }

  available(user: AuthenticatedUser): ImportProfileInfo[] {
    return [...this.profiles.values()]
      .filter(({ profile }) => user.can(profile.permission))
      .map(({ module, profile }) => ({
        id: profile.id,
        module,
        name: profile.name,
        description: profile.description,
        fields: profile.fields,
        options: profile.options ?? [],
        lockedInTestStage: Boolean(profile.personData) && isTestStage(),
      }));
  }

  /** Suggests a column for every field whose aliases or labels match a heading. */
  suggest(profile: ImportProfile, headers: readonly string[]): ImportMapping {
    const byNormalized = new Map(headers.map((h) => [normalizeHeading(h), h]));
    return Object.fromEntries(
      profile.fields.map((field) => {
        const candidates = [...field.aliases, field.label.de, field.label.en, field.key].map(normalizeHeading);
        const match = candidates.map((c) => byNormalized.get(c)).find(Boolean);
        return [field.key, match ?? null];
      }),
    );
  }
}
