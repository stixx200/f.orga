import { Injectable, Optional } from '@nestjs/common';
import type { z } from 'zod';
import { type Language, LIST_PURPOSE_OTHER, type ListCell, type ListColumn, type ListInfo, type ListOption, type ListParameter, type ListPersonalData, type ListPurpose, PURPOSE_REQUIRED_DATA } from '@forga/core-contracts';
import type { AuthenticatedUser } from '../security/authenticated-user.js';
import { PermissionRegistry } from '../security/permission-registry.js';

export interface ListContent {
  /** Overrides the declared columns, e.g. for matrices with one column per qualification. */
  columns?: ListColumn[];
  rows: Record<string, ListCell>[];
  /** Shown below the title, e.g. the chosen period or department. */
  subtitle?: string;
  /**
   * Persons the list names (lists about persons): recorded with the export in the audit log, so the persons affected by
   * a lost printout can be determined later (data breach, Art. 33/34).
   */
  personIds?: string[];
}

/**
 * A parameter of a list template. `choice` parameters provide their choices (only what the user may see, filtered by
 * the typed text); `person` parameters search the master data unless they provide their own.
 */
export type ListParameterDefinition = ListParameter & {
  choices?: (user: AuthenticatedUser, query: string, language: Language) => Promise<ListOption[]>;
};

/** A purpose of a list; `permission` (any department) is needed to choose it, e.g. contact details of the members. */
export type ListPurposeDefinition = ListPurpose & { permission?: string };

/** The purpose "other" offered with every list that needs a purpose. */
export const OTHER_PURPOSE: ListPurpose = {
  key: LIST_PURPOSE_OTHER,
  label: { de: 'Anderer Zweck (bitte angeben)', en: 'Other purpose (please describe)' },
};

/** A list template a module offers. Rows must respect the user's permissions (e.g. departments). */
export interface ListDefinition<P = Record<string, unknown>> {
  id: string;
  name: ListInfo['name'];
  description?: ListInfo['description'];
  /** Needed in at least one department to see and run the list. */
  permission: string;
  parameters?: ListParameterDefinition[];
  /** Validates the query parameters (all values arrive as strings). */
  schema: z.ZodType<P>;
  columns: ListColumn[];
  signatureColumn?: boolean;
  orientation?: ListInfo['orientation'];
  /** Personal data of the list; lists with contact, sensitive or health data are exported only with a purpose. */
  personalData?: ListPersonalData;
  /**
   * Purposes to choose from, each with the columns it needs (L11). The first is the default of the preview. Lists that need
   * a purpose also offer "other" with a description.
   */
  purposes?: ListPurposeDefinition[];
  /** `purpose`: key of the chosen purpose (`null` if none was chosen; `other` with a description). */
  rows(user: AuthenticatedUser, params: P, language: Language, purpose: string | null): Promise<ListContent>;
}

/** Exports of the list need a purpose. */
export function purposeRequired(definition: Pick<ListDefinition<never>, 'personalData'>): boolean {
  return definition.personalData !== undefined && PURPOSE_REQUIRED_DATA.includes(definition.personalData);
}

/** The purposes the user may choose, with "other" when the list needs a purpose. */
export function purposesFor(definition: Pick<ListDefinition<never>, 'personalData' | 'purposes'>, user: AuthenticatedUser): ListPurposeDefinition[] {
  const own = (definition.purposes ?? []).filter((p) => !p.permission || user.holds(p.permission));
  return purposeRequired(definition) ? [...own, OTHER_PURPOSE] : own;
}

/** Collects the list templates of all modules. Modules register in `onModuleInit`. */
@Injectable()
export class ListRegistry {
  private readonly lists = new Map<string, { module: string; definition: ListDefinition<never> }>();

  constructor(@Optional() private readonly permissions?: PermissionRegistry) {}

  register<P>(module: string, definition: ListDefinition<P>): void {
    if (!definition.id.startsWith(`${module}.`)) {
      throw new Error(`List "${definition.id}" of module "${module}" must start with "${module}.".`);
    }
    this.lists.set(definition.id, { module, definition: definition as unknown as ListDefinition<never> });
  }

  get(id: string): { module: string; definition: ListDefinition<unknown> } | undefined {
    return this.lists.get(id) as { module: string; definition: ListDefinition<unknown> } | undefined;
  }

  available(user: AuthenticatedUser): ListInfo[] {
    return [...this.lists.values()]
      // Lists with sensitive data are offered without step-up; creating them asks for the second factor.
      .filter(({ definition }) => user.holds(definition.permission))
      .map(({ module, definition }) => ({
        ...toInfo(module, definition, user.heldGrant(definition.permission) ?? [], this.permissions?.stepUp.has(definition.permission) ?? false),
        purposes: purposesFor(definition, user).map(({ permission: _permission, ...purpose }) => purpose),
      }));
  }
}

export function toInfo(module: string, definition: ListDefinition<never> | ListDefinition<unknown>, departments: ListInfo['departments'], stepUp = false): ListInfo {
  return {
    id: definition.id,
    module,
    name: definition.name,
    description: definition.description,
    // The functions providing choices stay on the server.
    parameters: (definition.parameters ?? []).map(({ choices: _choices, ...p }) => ({ required: false, ...p })),
    signatureColumn: definition.signatureColumn ?? false,
    orientation: definition.orientation ?? 'portrait',
    departments,
    stepUp,
    personalData: definition.personalData ?? null,
    purposes: (definition.purposes ?? []).map(({ permission: _permission, ...purpose }) => purpose),
    purposeRequired: purposeRequired(definition),
  };
}
