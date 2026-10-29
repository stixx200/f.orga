import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { applyTrustProxy, type PluginState, protectApiDocs, securityHeaders } from '@forga/core-api';
import { servePluginFrontends } from './app.module';

/**
 * HTTP setup shared by the server and the integration tests: global prefix, trusted proxy, security headers on every
 * response, plugin frontends, cookies and the API documentation (signed-in users only). Call before `init`/`listen`.
 */
export function configureHttp(app: INestApplication, plugins: PluginState[]): void {
  app.setGlobalPrefix('api');
  applyTrustProxy(app);
  // First, so the headers are also on static files of the frontends and on errors.
  app.use(securityHeaders);
  servePluginFrontends(app, plugins);
  app.use(cookieParser());
  protectApiDocs(app);

  // OpenAPI description of all endpoints (paths, methods, parameters) under /api/docs.
  const openApi = new DocumentBuilder()
    .setTitle('f.orga')
    .setDescription('API of f.orga. Requests from the browser use the session cookie and the header `x-forga: 1`; other systems use `Authorization: Bearer <api-token>`.')
    .addBearerAuth()
    .addCookieAuth('forga_session')
    .build();
  SwaggerModule.setup('api/docs', app, () => SwaggerModule.createDocument(app, openApi), { jsonDocumentUrl: 'api/docs/openapi.json' });
}
