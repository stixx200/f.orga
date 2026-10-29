import type { ComponentType } from 'react';
import { ACCESS_REPORT_PERMISSION } from '@forga/core-contracts';
import { registerExtensions } from '@forga/web-sdk';
import { AccessReportButton, PersonPrivacyTab } from './AccessReports';

type ExtensionComponent = ComponentType<Record<string, unknown>>;

/** Contributions of the core to extension points of modules: access reports in the person file. */
export function registerCoreExtensions(): void {
  registerExtensions('core', {
    'masterdata.person.actions': {
      label: { de: 'Auskunft erstellen', en: 'Create access report' },
      permission: ACCESS_REPORT_PERMISSION,
      component: AccessReportButton as unknown as ExtensionComponent,
    },
    'masterdata.person.tab': {
      label: { de: 'Datenschutz', en: 'Data protection' },
      permission: ACCESS_REPORT_PERMISSION,
      order: 900,
      component: PersonPrivacyTab as unknown as ExtensionComponent,
    },
  });
}
