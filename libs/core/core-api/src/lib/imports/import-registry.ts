import { Injectable } from '@nestjs/common';
import type {
  ImportField,
  ImportMapping,
  ImportOption,
  ImportProfileInfo,
  ImportResult,
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
  run(rows: ImportRow[], context: ImportContext): Promise<ImportResult>;
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

  register(module: string, profile: ImportProfile): void {
    if (!profile.id.startsWith(`${module}.`)) {
      throw new Error(`Import profile "${profile.id}" of module "${module}" must start with "${module}.".`);
    }
    this.profiles.set(profile.id, { module, profile });
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
