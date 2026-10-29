import { defaultClientConditions, defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { federation } from '@module-federation/vite';
import { nxReadySignal } from '@nx/vite/plugins/nx-ready-signal.plugin';
import { MODULE_PORTS, SHARED } from '../../../tools/federation.mts';

const PORT = MODULE_PORTS['backup'];

export default defineConfig({
  // Workspace packages are bundled from source, so no prior library build is needed.
  resolve: { conditions: ['@forga/source', ...defaultClientConditions] },
  // Same path in development and production: the shell loads /modules/backup/remoteEntry.js.
  base: '/modules/backup/',
  server: {
    port: PORT,
    strictPort: true,
    origin: `http://localhost:${PORT}`,
    host: '127.0.0.1',
    cors: true,
  },
  preview: { port: PORT, strictPort: true, cors: true },
  build: { target: 'chrome89' },
  plugins: [
    federation({
      // Modules are loaded dynamically by manifest; generated remote types are not used.
      dts: false,
      name: 'backup_web',
      filename: 'remoteEntry.js',
      exposes: { './Module': './src/module.tsx' },
      shared: SHARED,
    }),
    react(),
    nxReadySignal(),
  ],
});
