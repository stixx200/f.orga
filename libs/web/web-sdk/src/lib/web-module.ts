import type { ComponentType } from 'react';
import type { RouteObject } from 'react-router';
import type { LocalizedText } from '@forga/core-contracts';
import type { Translations } from './i18n';

/** Something the module contributes to the start page. */
export interface DashboardItem {
  id: string;
  /** `kpi`: figure tile in the row of tiles; `main`: card in the main column; `side`: card in the side column. */
  area: 'kpi' | 'main' | 'side';
  /** Shown only with this permission (in any department). */
  permission?: string;
  /** Lower comes first. */
  order?: number;
  component: ComponentType;
}

/** A contribution to an extension point, e.g. a tab in the person file of the master data module. */
export interface Extension {
  /** Title, e.g. of the tab. */
  label: LocalizedText;
  /** Shown only with this permission (in any department). */
  permission?: string;
  /** Position among the contributions, lowest first (default 100). */
  order?: number;
  /** Props depend on the extension point, e.g. `{ personId }`. */
  component: ComponentType<Record<string, unknown>>;
}

/** What a module frontend hands to the shell through `./Module`. */
export interface WebModule {
  /** Routes relative to `/<module-id>/`. */
  routes: RouteObject[];
  /** UI texts of the module; registered under the module ID as i18next namespace. */
  translations: Translations;
  dashboard?: DashboardItem[];
  /** React hook returning counters for navigation entries, keyed by their path (e.g. `{ review: 4 }`). */
  useNavigationBadges?: () => Record<string, number | undefined>;
  /** Contributions to extension points of other modules, by extension point ID (e.g. `masterdata.person.tab`). */
  extensions?: Record<string, Extension>;
}

export function defineWebModule(module: WebModule): WebModule {
  return module;
}

// On `globalThis` like the i18n instance: a module frontend may evaluate its own copy of this package.
const registry = globalThis as typeof globalThis & { forgaExtensionPoints?: Map<string, (Extension & { module: string })[]> };
const extensionPoints = (registry.forgaExtensionPoints ??= new Map<string, (Extension & { module: string })[]>());

/** Called by the shell for every loaded module frontend. */
export function registerExtensions(module: string, extensions: Record<string, Extension> = {}): void {
  for (const [point, extension] of Object.entries(extensions)) {
    extensionPoints.set(point, [...(extensionPoints.get(point) ?? []).filter((e) => e.module !== module), { ...extension, module }]);
  }
}

/** Contributions of the active modules to an extension point. */
export function extensionsOf(point: string): (Extension & { module: string })[] {
  return (extensionPoints.get(point) ?? []).toSorted((a, b) => (a.order ?? 100) - (b.order ?? 100));
}
