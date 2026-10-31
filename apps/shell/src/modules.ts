import { loadRemote, registerRemotes } from '@module-federation/runtime';
import type { ActiveModule, KioskFrontend } from '@forga/core-contracts';
import { addTranslations, api, type KioskModule, registerExtensions, type WebModule } from '@forga/web-sdk';

export interface LoadedModule {
  info: ActiveModule;
  /** Missing if the module has no frontend or its bundle could not be loaded. */
  web?: WebModule;
  error?: string;
}

/** Fetches the active modules from the server and loads their frontends via Module Federation. */
export async function loadModules(): Promise<LoadedModule[]> {
  const active = await api<ActiveModule[]>('core/modules');

  registerRemotes(
    active.flatMap(({ frontend }) =>
      frontend ? [{ name: frontend.remote, entry: frontend.entry, type: 'module' as const }] : [],
    ),
  );

  return Promise.all(
    active.map(async (info): Promise<LoadedModule> => {
      if (!info.frontend) return { info };
      const path = `${info.frontend.remote}/${info.frontend.exposed.replace(/^\.\//, '')}`;
      try {
        const loaded = await loadRemote<{ default: WebModule }>(path);
        const web = loaded?.default;
        if (web) {
          addTranslations(info.id, web.translations);
          registerExtensions(info.id, web.extensions);
        }
        return { info, web };
      } catch (error) {
        return { info, error: error instanceof Error ? error.message : String(error) };
      }
    }),
  );
}

/** Pages without shell frame and login, served by a module (`frontend.kiosk` of its manifest). */
export const KIOSK_PATHS = ['terminal', 'privacy-notice', 'personal'];

/** Loads the kiosk page of the module serving `/<path>`; fails with `modules.inactive` while the module is off. */
export async function loadKiosk(path: string): Promise<KioskModule> {
  const kiosk = await api<KioskFrontend>(`core/modules/kiosk/${path}`);
  registerRemotes([{ name: kiosk.remote, entry: kiosk.entry, type: 'module' }]);
  const loaded = await loadRemote<{ default: KioskModule }>(`${kiosk.remote}/${kiosk.exposed.replace(/^\.\//, '')}`);
  if (!loaded?.default) throw new Error(`Kiosk page of ${kiosk.moduleId} not found`);
  addTranslations(kiosk.moduleId, loaded.default.translations);
  return loaded.default;
}
