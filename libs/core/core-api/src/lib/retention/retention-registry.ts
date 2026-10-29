import { Injectable } from '@nestjs/common';
import type { LocalizedText, PrivacySettings, RetentionAction, RetentionFinalAction, RetentionRuleInput, RetentionSubtype } from '@forga/core-contracts';

/** A record whose retention period has passed. */
export interface RetentionCandidate {
  id: string;
  /** Name in the list „Aussonderung“; may name persons. */
  label: string;
  /** Name kept on the case after the execution: category, date and number, never names of persons. */
  neutralLabel: string;
  /** Day the period started (leaving, alarm, …), `YYYY-MM-DD`. */
  eventDate: string;
  /** Why the record belongs to its subtype, e.g. „Verletzte oder Tote“. */
  reason?: LocalizedText | null;
  /** Number of attachments that follow the record. */
  attachments?: number;
}

/** Which records a rule (row of the settings page) covers. */
export interface RetentionQuery {
  /** Subtype of the row; `null` = the row of the category key (the other records). */
  subtype: string | null;
  /** Records whose period started before this moment are due. */
  cutoff: Date;
  /** Subtypes with a row of their own; the row of the category key leaves their records out. */
  ownSubtypes: readonly string[];
  /** What finally happens with the records: e.g. anonymised records are no candidates for anonymising again. */
  final: RetentionFinalAction;
}

/** One record for the archive: readable fields for the PDF, all data for the JSON, and its attachments. */
export interface RetentionExportRecord {
  id: string;
  title: string;
  fields: { label: LocalizedText; value: string }[];
  data: Record<string, unknown>;
  attachments: { ownerType: string; ownerId: string }[];
  /** Documents the module keeps itself, e.g. the issued PDF of a notice. */
  files?: { name: string; data: Buffer }[];
}

/** A record with the IDs of its parts other modules refer to, e.g. an incident with its reports. */
export interface RetentionRecordRef {
  id: string;
  children: string[];
}

/**
 * A data category with its own retention period, registered by the module that owns the records. Attachments always
 * follow their record: `export` lists them, `execute` removes them with the record.
 */
export interface RetentionCategoryDefinition {
  key: string;
  module: string;
  name: LocalizedText;
  description?: LocalizedText;
  /** Event the period runs from. */
  event: LocalizedText;
  actions: RetentionAction[];
  subtypeMode?: 'fixed' | 'optional';
  subtypes?: () => Promise<RetentionSubtype[]>;
  otherName?: LocalizedText;
  financial?: boolean;
  defaultRule?: RetentionRuleInput;
  /** Keeps its records at least as long as this category (e.g. the basic data as long as the person file). */
  atLeastAs?: string;
  /** Categories whose records refer to these records: the settings page warns if these are deleted earlier. */
  referencedBy?: string[];
  candidates(query: RetentionQuery): Promise<RetentionCandidate[]>;
  export(ids: readonly string[]): Promise<RetentionExportRecord[]>;
  /** Anonymises or deletes the records with everything that belongs to them; returns the number of records. */
  execute(ids: readonly string[], action: RetentionFinalAction): Promise<number>;
  /** Records that cannot be processed now, with an error code (e.g. `retention.referenced`). */
  blockedBy?(ids: readonly string[], action: RetentionFinalAction): Promise<Map<string, string>>;
  /** Parts of the records other modules refer to (e.g. the reports of incidents), for the dependents. */
  children?(ids: readonly string[]): Promise<Map<string, string[]>>;
  /**
   * For categories with many small records (audit log, history): counts and processes without single cases when the rule
   * acts directly (no archive, no special case).
   */
  bulk?: {
    count(query: RetentionQuery): Promise<number>;
    run(query: RetentionQuery, action: RetentionFinalAction): Promise<number>;
  };
}

/** What another module keeps about the records of a category (e.g. cost notices of an incident). */
export interface RetentionDependent {
  /** Records the module does not allow to process now, with an error code (e.g. `retention.costNoticeOpen`). */
  blockedBy?(records: readonly RetentionRecordRef[], action: RetentionFinalAction): Promise<Map<string, string>>;
  /** Anonymises or removes the module's data about the records; runs before the records themselves. */
  execute?(records: readonly RetentionRecordRef[], action: RetentionFinalAction): Promise<void>;
}

export interface RetentionRule {
  /** Applies the rule (or only counts when `dryRun`); returns the number of affected records. */
  run(settings: PrivacySettings, dryRun: boolean): Promise<number>;
}

/**
 * Data categories with retention periods (`registerCategory`), what other modules keep about their records
 * (`registerDependent`), and technical clean-up rules without settings (`register`, e.g. rows of old transfers).
 */
@Injectable()
export class RetentionRegistry {
  readonly rules = new Map<string, RetentionRule>();
  readonly categories = new Map<string, RetentionCategoryDefinition>();
  readonly dependents = new Map<string, { module: string; dependent: RetentionDependent }[]>();

  register(key: string, rule: RetentionRule): void {
    this.rules.set(key, rule);
  }

  registerCategory(definition: RetentionCategoryDefinition): void {
    if (this.categories.has(definition.key)) throw new Error(`Retention category "${definition.key}" is already registered.`);
    this.categories.set(definition.key, definition);
  }

  registerDependent(category: string, module: string, dependent: RetentionDependent): void {
    this.dependents.set(category, [...(this.dependents.get(category) ?? []), { module, dependent }]);
  }
}
