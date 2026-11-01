import { nodeVitestConfig } from '../../../tools/vitest-node.mts';

export default nodeVitestConfig(import.meta.url, '@forga/backup-contracts');
