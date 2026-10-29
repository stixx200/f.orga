import type { ComponentType } from 'react';
import { ACCESS_REPORT_PERMISSION } from '@forga/core-contracts';
import { registerExtensions } from '@forga/web-sdk';
import { AccessReportButton } from './AccessReports';

type ExtensionComponent = ComponentType<Record<string, unknown>>;

/** Contributions of the core to extension points of modules: „Auskunft erstellen“ in the person file (the tab „Datenschutz“ shows the reports). */
export function registerCoreExtensions(): void {
  registerExtensions('core', {
    'masterdata.person.actions': {
      label: { de: 'Auskunft erstellen', en: 'Create access report' },
      permission: ACCESS_REPORT_PERMISSION,
      component: AccessReportButton as unknown as ExtensionComponent,
    },
  });
}
