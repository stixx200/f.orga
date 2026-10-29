import { z } from 'zod';
import { LocalizedText } from './i18n.js';

/** Where a permission applies: the whole brigade or individual departments. */
export const PermissionScope = z.enum(['brigade', 'department']);
export type PermissionScope = z.infer<typeof PermissionScope>;

export const Permission = z.object({
  id: z.string().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/),
  name: LocalizedText,
  scope: PermissionScope,
  /**
   * Permissions that give access to the whole data (e.g. downloading and replacing it with a backup): never granted
   * to API tokens.
   */
  privileged: z.boolean().optional(),
});
export type Permission = z.infer<typeof Permission>;

export const NavigationEntry = z.object({
  label: LocalizedText,
  /** Path relative to the module, e.g. `persons` → `/masterdata/persons`. */
  path: z.string(),
  permission: z.string().optional(),
  /** Icon key known to the shell, e.g. `users`, `truck`, `check`, `chart`. */
  icon: z.string().optional(),
  /**
   * `administration`: shown in the section "Verwaltung" instead of the module section (e.g. catalogs).
   * `settings`: settings page of the module; not in the side menu but on the page "Verwaltung → Module" at its module.
   */
  section: z.enum(['module', 'administration', 'settings']).optional(),
  /** `false`: the settings page is no step of the setup list on the start page (e.g. tools needed only for a while). */
  onboarding: z.boolean().optional(),
});
export type NavigationEntry = z.infer<typeof NavigationEntry>;

/**
 * A role template. Templates with the same key are merged across modules (union of permissions),
 * so every module adds its permissions to the standard roles such as `group-leader`.
 */
export const RoleTemplate = z.object({
  key: z.string().regex(/^[a-z][a-z0-9-]*$/),
  /** Only needed by the module that introduces the key; the core names the standard roles. */
  name: LocalizedText.optional(),
  description: LocalizedText.optional(),
  permissions: z.array(z.string()).default([]),
  /** Permissions that apply in all departments even if the role is assigned to one department (e.g. reading persons). */
  permissionsAllDepartments: z.array(z.string()).default([]),
});
export type RoleTemplate = z.input<typeof RoleTemplate>;

/** Self-description of a module, shared by its backend and frontend. */
export const ModuleManifest = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  name: LocalizedText,
  version: z.string(),
  requires: z.array(z.string()).default([]),
  optional: z.array(z.string()).default([]),
  permissions: z.array(Permission).default([]),
  navigation: z.array(NavigationEntry).default([]),
  roles: z.array(RoleTemplate).default([]),
  /**
   * Federation name and exposed entry of the frontend package, e.g. `masterdata_web` / `./Module`. `kiosk`: a page
   * without shell frame and login the shell serves under `/<path>` (e.g. the info terminal at `/terminal`).
   */
  frontend: z
    .object({
      remote: z.string(),
      exposed: z.string(),
      kiosk: z.object({ path: z.string().regex(/^[a-z][a-z0-9-]*$/), exposed: z.string() }).optional(),
    })
    .optional(),
});
export type ModuleManifest = z.input<typeof ModuleManifest>;

/** The kiosk page of an active module (`GET /api/core/modules/kiosk/:path`, without login). */
export const KioskFrontend = z.object({ moduleId: z.string(), remote: z.string(), exposed: z.string(), entry: z.string() });
export type KioskFrontend = z.infer<typeof KioskFrontend>;

/**
 * Version of f.orga (core and built-in modules), raised with every release. Backups record it; a backup of a newer
 * version is not restored.
 */
export const FORGA_VERSION = '0.1.0';

/** Database schema of a module: its ID with dashes replaced by underscores. */
export function schemaName(moduleId: string): string {
  return moduleId.replaceAll('-', '_');
}

/** A module as the shell receives it from `GET /api/core/modules`. */
export const ActiveModule = z.object({
  id: z.string(),
  name: LocalizedText,
  version: z.string(),
  navigation: z.array(NavigationEntry),
  frontend: z.object({ remote: z.string(), exposed: z.string(), entry: z.string() }).optional(),
});
export type ActiveModule = z.infer<typeof ActiveModule>;
