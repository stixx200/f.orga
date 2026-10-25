import { loadRemote, registerRemotes } from '@module-federation/runtime';
import type { ActiveModule } from '@forga/core-contracts';
import { addTranslations, api, registerExtensions, type WebModule } from '@forga/web-sdk';

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
