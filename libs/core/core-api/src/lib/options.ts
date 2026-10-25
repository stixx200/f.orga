import type { ForgaModule } from './module/forga-module.js';
import type { PluginConfig, PluginState } from './plugins/plugin-directory.js';

export const FORGA_CORE_OPTIONS = Symbol('FORGA_CORE_OPTIONS');

export interface ForgaCoreOptions {
  /** Installed feature modules, sorted by requirements. */
  modules: ForgaModule[];
  /** URL of a module frontend's `remoteEntry.js`. */
  frontendEntry: (moduleId: string) => string;
  /** Send the session cookie only over HTTPS. */
  secureCookies: boolean;
  /** Plugin directory and the plugins found at startup (their modules are part of `modules`). */
  plugins?: { config: PluginConfig; states: PluginState[] };
}
