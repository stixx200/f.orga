import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/** Shared Vitest config for Node packages (API, contracts, SDK). SWC keeps Nest decorator metadata. */
export function nodeVitestConfig(metaUrl: string, name: string) {
  return defineConfig({
    root: dirname(fileURLToPath(metaUrl)),
    plugins: [swc.vite({ module: { type: 'es6' } })],
    // Load workspace packages from source, not from a possibly stale dist build.
    ssr: { resolve: { conditions: ['@forga/source'], externalConditions: ['@forga/source'] } },
    test: {
      name,
      include: ['src/**/*.{spec,test}.{ts,tsx}'],
      environment: 'node',
      globals: true,
      passWithNoTests: true,
    },
  });
}
