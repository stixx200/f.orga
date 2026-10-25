import { type DynamicModule, type INestApplication, Module } from '@nestjs/common';
import express from 'express';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { ServeStaticModule, type ServeStaticModuleOptions } from '@nestjs/serve-static';
import { join } from 'node:path';
import { type ForgaModule, ForgaCoreModule, type PluginConfig, type PluginState } from '@forga/core-api';
import { INSTALLED_MODULES } from './installed-modules';
import { ormConfig } from './orm';

/**
 * In production the server also serves the built frontends:
 * `<FORGA_WEB_DIR>/shell` at `/` and `<FORGA_WEB_DIR>/modules/<id>` at `/modules/<id>/`.
 * During development the shell's Vite server does this.
 */
function frontends(): DynamicModule[] {
  const webDir = process.env.FORGA_WEB_DIR;
  if (!webDir) return [];
  const roots: ServeStaticModuleOptions[] = [
    { rootPath: join(webDir, 'modules'), serveRoot: '/modules' },
    { rootPath: join(webDir, 'shell'), exclude: ['/api/{*path}', '/modules/{*path}'] },
  ];
  return [ServeStaticModule.forRoot(...roots)];
}

/** Serves the frontends of loaded plugins at `/modules/<id>/` (also during development). Call before `init`. */
export function servePluginFrontends(app: INestApplication, plugins: PluginState[]): void {
  for (const plugin of plugins) {
    if (plugin.status === 'loaded' && plugin.frontendDir) app.use(`/modules/${plugin.id}`, express.static(plugin.frontendDir, { fallthrough: false }));
  }
}

@Module({})
export class AppModule {
  /** The server with the built-in modules and, if given, the modules of loaded plugins. */
  static register(options: { modules?: ForgaModule[]; plugins?: { config: PluginConfig; states: PluginState[] } } = {}): DynamicModule {
    const modules = options.modules ?? INSTALLED_MODULES;
    return {
      module: AppModule,
      imports: [
        MikroOrmModule.forRoot(ormConfig(process.env.DATABASE_URL, modules)),
        ForgaCoreModule.forRoot({
          modules,
          frontendEntry: (id) => `/modules/${id}/remoteEntry.js`,
          secureCookies: process.env.FORGA_SECURE_COOKIES === 'true',
          plugins: options.plugins,
        }),
        ...frontends(),
      ],
    };
  }
}
