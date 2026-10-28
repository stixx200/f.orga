import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  ImportField,
  ImportLookupEntry,
  ImportLookupInfo,
  ImportMapping,
  ImportOption,
  ImportProfileInfo,
  ImportResult,
  ImportUnmatched,
  ImportValueMappings,
  LocalizedText,
} from '@forga/core-contracts';
import type { AuthenticatedUser } from '../security/authenticated-user.js';
import { normalizeHeading } from './parse.js';
import type { TransferArchive } from './transfer-archive.js';

export interface ImportContext {
  user: AuthenticatedUser;
  options: Record<string, boolean>;
  /** `true` for the preview: compute the result, but change nothing. */
  dryRun: boolean;
  /**
   * Key of the entry the user chose for a value that matches no entry of the lookup `kind`, or `undefined`.
   * Profiles ask only after their own matching (names and aliases) failed: every answer counts as used, and after
   * an apply the value is remembered as alias of the chosen entry (`ImportLookup.remember`).
   */
  mapped(kind: string, value: string): string | undefined;
  /** Reports a value that matches no entry of the lookup `kind` (once per row); the result lists it with its count. */
  unmatched(kind: string, value: string): void;
}

/** What a profile returns; the core adds the unmatched values. */
export type ImportRunResult = Omit<ImportResult, 'unmatched'>;

/** The parts of the context the caller of a profile decides. */
export type ImportRunInput = Pick<ImportContext, 'user' | 'options' | 'dryRun'> & { mappings: ImportValueMappings };

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
  /** Creating entries from the import; without, entries can only be chosen. */
  create?: {
    permission: string;
    /** Throws the module's error codes, e.g. `catalog.keyTaken`. */
    run(input: { key: string; name: string }): Promise<ImportLookupEntry>;
  };
  /**
   * Remembers `value` as alias of the entry `key`, so the next import matches it without asking. Called after an
   * apply for every mapping the profile used; does nothing if the value already is a name or alias of an entry.
   */
  remember?(key: string, value: string): Promise<void>;
}

/**
 * Further targets a module offers for the values of another module's lookup `kind`, e.g. "no function – during
 * working hours" (incidents) beside the functions of the catalog (masterdata). The entries are listed after those of
 * the lookup and may be chosen like them; the module remembers a choice itself, so its profile can apply it in the
 * next import. Profiles that do not know an extra key treat it as unmatched.
 */
export interface ImportLookupExtras {
  kind: string;
  /** Keys start with `<module>:`, so they never collide with keys of the lookup, e.g. `incidents:ignore`. */
  entries(): Promise<ImportLookupEntry[]>;
  /** Called after an apply for every used mapping to one of the entries. */
  remember(key: string, value: string): Promise<void>;
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
  /** Must be idempotent: a second run with the same file updates instead of duplicating. */
  run(rows: ImportRow[], context: ImportContext): Promise<ImportRunResult>;
  /** Reads the profile's rows from the archives of a data transfer (MP-Feuer transfer files). */
  transfer?: TransferReader;
}

/** A row of a data transfer: field values and the key of the archive it comes from. */
export interface TransferRow {
  archive: string;
  values: Record<string, string>;
}

export interface TransferReader {
  /** Position in the transfer: persons first, then what refers to them. */
  order: number;
  /** All archives at once, so a reader can resolve references between them. */
  read(archives: readonly TransferArchive[]): TransferRow[];
  /**
   * Units the rows of an archive can be assigned to instead of its department (`TransferRequest.units`). The rows of
   * such an archive get the field `unit` with the key of the unit.
   */
  units?: {
    label: LocalizedText;
    none: LocalizedText;
    entries(): Promise<ImportLookupEntry[]>;
  };
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
   * Runs a profile with the chosen entries for unknown values and collects the values that stay unmatched. After an
   * apply, the chosen entries remember the values as aliases.
   * Throws `imports.unknownLookup` or `imports.unknownMappingTarget` for mappings that point nowhere.
   */
  async run(profile: ImportProfile, rows: ImportRow[], { mappings, ...input }: ImportRunInput): Promise<ImportResult> {
    // Per kind the extras offering a key; a chosen key of an extra is remembered by its module.
    const extrasOf = new Map<string, Map<string, ImportLookupExtras>>();
    for (const [kind, values] of Object.entries(mappings)) {
      const targets = await this.targets(kind);
      if (!targets) throw new BadRequestException({ code: 'imports.unknownLookup', kind });
      const keys = new Set(targets.map((t) => t.entry.key));
      extrasOf.set(kind, new Map(targets.flatMap((t) => (t.extras ? [[t.entry.key, t.extras] as const] : []))));
      for (const [value, key] of Object.entries(values)) {
        if (!keys.has(key)) throw new BadRequestException({ code: 'imports.unknownMappingTarget', kind, value, key });
      }
    }
    const unmatched = new Map<string, ImportUnmatched>();
    const used = new Map<string, { kind: string; value: string; key: string }>();
    const result = await profile.run(rows, {
      ...input,
      mapped: (kind, value) => {
        const values = mappings[kind];
        const text = value.trim();
        if (!values || !Object.hasOwn(values, text)) return undefined;
        used.set(JSON.stringify([kind, text]), { kind, value: text, key: values[text] });
        return values[text];
      },
      unmatched: (kind, value) => {
        const text = value.trim();
        const id = JSON.stringify([kind, text]);
        const entry = unmatched.get(id) ?? { kind, value: text, count: 0 };
        entry.count++;
        unmatched.set(id, entry);
      },
    });
    // The choices are remembered as aliases only when the import was applied.
    if (!input.dryRun) {
      for (const { kind, value, key } of used.values()) {
        const extras = extrasOf.get(kind)?.get(key);
        await (extras ? extras.remember(key, value) : this.lookup(kind)?.remember?.(key, value));
      }
    }
    return { ...result, unmatched: [...unmatched.values()] };
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
        transfer: !!profile.transfer,
      }));
  }

  /** Profiles the user may use that read data transfers, in import order. */
  transferProfiles(user: AuthenticatedUser): (ImportProfile & { transfer: TransferReader })[] {
    return [...this.profiles.values()]
      .map(({ profile }) => profile)
      .filter((profile): profile is ImportProfile & { transfer: TransferReader } => !!profile.transfer && user.can(profile.permission))
      .toSorted((a, b) => a.transfer.order - b.transfer.order);
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
