import { Injectable } from '@nestjs/common';
import type { z } from 'zod';
import type { Language, ListCell, ListColumn, ListInfo, ListOption, ListParameter } from '@forga/core-contracts';
import type { AuthenticatedUser } from '../security/authenticated-user.js';

export interface ListContent {
  /** Overrides the declared columns, e.g. for matrices with one column per qualification. */
  columns?: ListColumn[];
  rows: Record<string, ListCell>[];
  /** Shown below the title, e.g. the chosen period or department. */
  subtitle?: string;
}

/**
 * A parameter of a list template. `choice` parameters provide their choices (only what the user may see, filtered by
 * the typed text); `person` parameters search the master data unless they provide their own.
 */
export type ListParameterDefinition = ListParameter & {
  choices?: (user: AuthenticatedUser, query: string, language: Language) => Promise<ListOption[]>;
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
  rows(user: AuthenticatedUser, params: P, language: Language): Promise<ListContent>;
}

/** Collects the list templates of all modules. Modules register in `onModuleInit`. */
@Injectable()
export class ListRegistry {
  private readonly lists = new Map<string, { module: string; definition: ListDefinition<never> }>();

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
      .filter(({ definition }) => user.can(definition.permission))
      .map(({ module, definition }) => toInfo(module, definition, user.grant(definition.permission) ?? []));
  }
}

export function toInfo(module: string, definition: ListDefinition<never> | ListDefinition<unknown>, departments: ListInfo['departments']): ListInfo {
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
  };
}
