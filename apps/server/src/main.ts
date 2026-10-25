import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { MikroORM } from '@mikro-orm/core';
import cookieParser from 'cookie-parser';
import { applyTrustProxy, loadPlugins, pluginConfig } from '@forga/core-api';
import { AppModule, servePluginFrontends } from './app/app.module';
import { INSTALLED_MODULES } from './app/installed-modules';

// Function keeps TypeScript and webpack from rewriting the dynamic import of plugin code.
const importModule = new Function('s', 'return import(s)') as (s: string) => Promise<{ default?: unknown }>;

async function bootstrap() {
  // Plugins from the plugin directory become modules like the built-in ones.
  const config = pluginConfig();
  const plugins = await loadPlugins(config, new Set(INSTALLED_MODULES.map((m) => m.manifest.id)), importModule);
  const app = await NestFactory.create(AppModule.register({ modules: [...INSTALLED_MODULES, ...plugins.modules], plugins: { config, states: plugins.states } }));
  app.setGlobalPrefix('api');
  applyTrustProxy(app);
  servePluginFrontends(app, plugins.states);
  app.use(cookieParser());
  app.enableShutdownHooks();

  // Apply pending migrations of core and modules before serving the first request.
  const executed = await app.get(MikroORM).migrator.up();
  if (executed.length) Logger.log(`${executed.length} migration(s) executed`);

  // OpenAPI description of all endpoints (paths, methods, parameters) under /api/docs.
  const openApi = new DocumentBuilder()
    .setTitle('f.orga')
    .setDescription('API of f.orga. Requests from the browser use the session cookie and the header `x-forga: 1`; other systems use `Authorization: Bearer <api-token>`.')
    .addBearerAuth()
    .addCookieAuth('forga_session')
    .build();
  SwaggerModule.setup('api/docs', app, () => SwaggerModule.createDocument(app, openApi), { jsonDocumentUrl: 'api/docs/openapi.json' });

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
