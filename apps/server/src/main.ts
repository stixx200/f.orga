import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MikroORM } from '@mikro-orm/core';
import { assertStage, loadPlugins, pluginConfig } from '@forga/core-api';
import { AppModule } from './app/app.module';
import { configureHttp } from './app/http';
import { INSTALLED_MODULES } from './app/installed-modules';

// Function keeps TypeScript and webpack from rewriting the dynamic import of plugin code.
const importModule = new Function('s', 'return import(s)') as (s: string) => Promise<{ default?: unknown }>;

async function bootstrap() {
  assertStage();
  // Plugins from the plugin directory become modules like the built-in ones.
  const config = pluginConfig();
  const plugins = await loadPlugins(config, new Set(INSTALLED_MODULES.map((m) => m.manifest.id)), importModule);
  const app = await NestFactory.create(AppModule.register({ modules: [...INSTALLED_MODULES, ...plugins.modules], plugins: { config, states: plugins.states } }));
  configureHttp(app, plugins.states);
  app.enableShutdownHooks();

  // Apply pending migrations of core and modules before serving the first request.
  const executed = await app.get(MikroORM).migrator.up();
  if (executed.length) Logger.log(`${executed.length} migration(s) executed`);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  // Set when Nx waits for this server to be ready
  if (process.env.NX_READY_SIGNAL_SOCKET) {
    try {
      // Function keeps TypeScript and bundlers from rewriting or bundling the import
      const load = new Function('s', 'return import(s)') as (
        s: string,
      ) => Promise<{ emitReadySignal(server: unknown): boolean }>;
      (await load('@nx/js/ready-signal')).emitReadySignal(app.getHttpServer());
    } catch {
      // @nx/js isn't installed
    }
  }
  Logger.log(`f.orga is running at http://localhost:${port}/api`);
}

bootstrap();
