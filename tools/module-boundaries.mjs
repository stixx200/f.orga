/**
 * Checks module boundaries using the Nx tags (`scope:*`, `type:*`).
 * Usage: node tools/module-boundaries.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Which types a project of a given type may import. */
const ALLOWED_TYPES = {
  'type:contracts': ['type:contracts'],
  'type:api': ['type:api', 'type:contracts'],
  'type:web': ['type:web', 'type:contracts'],
  'type:server': ['type:api', 'type:contracts'],
  'type:shell': ['type:web', 'type:contracts'],
  // Playwright projects only share helpers via relative imports under `e2e/support`, not Nx graph edges.
  'type:e2e': [],
};

function tag(tags, prefix) {
  return tags.find((t) => t.startsWith(prefix));
}

/**
 * Scope rules:
 * - core may only use core.
 * - a module may use core, itself and the contracts of other modules.
 * - apps may use everything (the type rule limits them).
 */
function scopeAllowed(source, target, targetType) {
  if (source === 'scope:app') return true;
  if (target === 'scope:core') return true;
  if (source === 'scope:core') return false;
  return source === target || targetType === 'type:contracts';
}

const dir = mkdtempSync(join(tmpdir(), 'forga-graph-'));
const file = join(dir, 'graph.json');
try {
  execFileSync('npx', ['nx', 'graph', `--file=${file}`], { stdio: 'ignore' });
  const { graph } = JSON.parse(readFileSync(file, 'utf8'));
  const errors = [];

  for (const [name, node] of Object.entries(graph.nodes)) {
    const tags = node.data.tags ?? [];
    const type = tag(tags, 'type:');
    const scope = tag(tags, 'scope:');
    if (!type || !scope) {
      errors.push(`${name}: tags scope:* and type:* are missing`);
      continue;
    }
    // Playwright projects only declare `implicitDependencies` for `nx affected`; they do not import module code.
    if (type === 'type:e2e') continue;
    for (const { target } of graph.dependencies[name] ?? []) {
      const targetNode = graph.nodes[target];
      if (!targetNode) continue; // npm package
      const targetTags = targetNode.data.tags ?? [];
      const targetType = tag(targetTags, 'type:');
      const targetScope = tag(targetTags, 'scope:');
      if (!ALLOWED_TYPES[type]?.includes(targetType)) {
        errors.push(`${name} (${type}) must not import ${target} (${targetType})`);
      }
      if (!scopeAllowed(scope, targetScope, targetType)) {
        errors.push(`${name} (${scope}) must not import ${target} (${targetScope})`);
      }
    }
  }

  if (errors.length) {
    console.error(`Module boundaries violated:\n  ${errors.join('\n  ')}`);
    process.exit(1);
  }
  console.log(`Module boundaries respected (${Object.keys(graph.nodes).length} projects).`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
