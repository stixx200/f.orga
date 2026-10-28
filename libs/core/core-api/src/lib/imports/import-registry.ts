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
   * Profiles ask after their own matching failed.
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
}

/** Collects the import profiles of all modules. Modules register in `onModuleInit`. */
@Injectable()
export class ImportRegistry {
  private readonly profiles = new Map<string, { module: string; profile: ImportProfile }>();
  private readonly lookupsByKind = new Map<string, ImportLookup>();

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

  lookup(kind: string): ImportLookup | undefined {
    return this.lookupsByKind.get(kind);
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
   * Runs a profile with the chosen entries for unknown values and collects the values that stay unmatched.
   * Throws `imports.unknownLookup` or `imports.unknownMappingTarget` for mappings that point nowhere.
   */
  async run(profile: ImportProfile, rows: ImportRow[], { mappings, ...input }: ImportRunInput): Promise<ImportResult> {
    for (const [kind, values] of Object.entries(mappings)) {
      const lookup = this.lookup(kind);
      if (!lookup) throw new BadRequestException({ code: 'imports.unknownLookup', kind });
      const keys = new Set((await lookup.entries()).map((e) => e.key));
      for (const [value, key] of Object.entries(values)) {
        if (!keys.has(key)) throw new BadRequestException({ code: 'imports.unknownMappingTarget', kind, value, key });
      }
    }
    const unmatched = new Map<string, ImportUnmatched>();
    const result = await profile.run(rows, {
      ...input,
      mapped: (kind, value) => {
        const values = mappings[kind];
        const text = value.trim();
        return values && Object.hasOwn(values, text) ? values[text] : undefined;
      },
      unmatched: (kind, value) => {
        const text = value.trim();
        const id = JSON.stringify([kind, text]);
        const entry = unmatched.get(id) ?? { kind, value: text, count: 0 };
        entry.count++;
        unmatched.set(id, entry);
      },
    });
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
