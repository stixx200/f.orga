import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/** Integration tests against PostgreSQL (TEST_DATABASE_URL). */
export default defineConfig({
  // SWC instead of esbuild: NestJS dependency injection needs decorator metadata.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  // Load workspace packages from source, not from a possibly stale dist build.
  ssr: { resolve: { conditions: ['@forga/source'], externalConditions: ['@forga/source'] } },
  test: {
    include: ['src/**/*.integration.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
