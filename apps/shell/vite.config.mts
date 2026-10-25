import { defaultClientConditions, defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { federation } from '@module-federation/vite';
import { nxReadySignal } from '@nx/vite/plugins/nx-ready-signal.plugin';
import { MODULE_PORTS, SERVER_PORT, SHARED } from '../../tools/federation.mts';

const PORT = 4200;

// In development the shell proxies the API and module frontends so paths look like in production.
const proxy = {
  '/api': `http://localhost:${SERVER_PORT}`,
  ...Object.fromEntries(
    Object.entries(MODULE_PORTS).map(([id, port]) => [`/modules/${id}/`, `http://localhost:${port}`]),
  ),
  // Frontends of plugins are served by the server.
  '/modules/': `http://localhost:${SERVER_PORT}`,
};

export default defineConfig({
  // Workspace packages are bundled from source, so no prior library build is needed.
  resolve: { conditions: ['@forga/source', ...defaultClientConditions] },
  server: { port: PORT, strictPort: true, host: '127.0.0.1', proxy },
  preview: { port: PORT, strictPort: true, proxy },
  build: { target: 'chrome89' },
  plugins: [
    federation({
      // Modules are loaded dynamically by manifest; generated remote types are not used.
      dts: false,
      name: 'shell',
      // No remotes at build time: src/modules.ts registers them from GET /api/core/modules.
      shared: SHARED,
    }),
    react(),
    nxReadySignal(),
  ],
});
