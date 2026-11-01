const nxPreset = require('@nx/jest/preset').default;

// Nest 12 packages are ESM-only. Jest loads them via require(esm), which needs
// Node's experimental VM modules API (`NODE_OPTIONS=--experimental-vm-modules`,
// set in package.json scripts, nx.json targetDefaults, and CI).
module.exports = { ...nxPreset, passWithNoTests: true };
