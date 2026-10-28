import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '@forga/core-api';
import type { ImportMessage, LocalizedText } from '@forga/core-contracts';
import type { MpFeuerExportInfo } from '@forga/mp-feuer-contracts';

/** A parameter of an export in the UI, e.g. department or period. */
export interface ExportParameter {
  key: string;
  label: LocalizedText;
  type: 'department' | 'date' | 'text';
  required: boolean;
}

/**
 * Writes a file for the table import of MP-Feuer (CSV/Excel after a template of MP-Feuer). One adapter per template,
 * each with a test against the sample file of the template. No adapter exists yet: the templates are missing.
 */
export interface MpFeuerExportAdapter {
  /** E.g. `persons`. */
  id: string;
  name: LocalizedText;
  /** Permissions the user needs, e.g. `['masterdata.persons.read']`. */
  permissions: string[];
  parameters: ExportParameter[];
  /** Reads through the contracts of the modules (e.g. `PERSON_DIRECTORY`) and writes the file after the template. */
  build(user: AuthenticatedUser, params: Record<string, string>): Promise<{ fileName: string; mediaType: string; data: Uint8Array; warnings: ImportMessage[] }>;
}

/** The export adapters of the module. */
@Injectable()
export class MpFeuerExports {
  private readonly adapters = new Map<string, MpFeuerExportAdapter>();

  register(adapter: MpFeuerExportAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  /** Adapters the user may use. */
  available(user: AuthenticatedUser): MpFeuerExportInfo[] {
    return [...this.adapters.values()]
      .filter((a) => a.permissions.every((p) => user.can(p)))
      .map((a) => ({ id: a.id, name: a.name, permissions: a.permissions }));
  }
}
