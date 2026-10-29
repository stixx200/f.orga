/**
 * Shared Module Federation settings for the shell and the module frontends.
 * Everything listed here exists exactly once at runtime: all modules share theme, router, query cache, i18n and SDK.
 */
export const SHARED = {
  react: { singleton: true },
  'react-dom': { singleton: true },
  'react-router': { singleton: true },
  '@mantine/core': { singleton: true },
  '@mantine/hooks': { singleton: true },
  '@mantine/notifications': { singleton: true },
  '@mantine/dates': { singleton: true },
  '@tanstack/react-query': { singleton: true },
  i18next: { singleton: true },
  'react-i18next': { singleton: true },
  '@forga/web-sdk': { singleton: true },
  '@forga/web-ui': { singleton: true },
};

/** Dev ports of the module frontends. The shell proxies `/modules/<id>/` to them. */
export const MODULE_PORTS: Record<string, number> = {
  masterdata: 4201,
  incidents: 4202,
  training: 4203,
  'respiratory-protection': 4204,
  compensation: 4205,
  equipment: 4206,
  'cost-recovery': 4207,
  promotions: 4208,
  clothing: 4209,
  'duty-officer': 4210,
  'info-terminal': 4211,
  'mp-feuer': 4212,
  backup: 4213,
};

export const SERVER_PORT = 3000;
