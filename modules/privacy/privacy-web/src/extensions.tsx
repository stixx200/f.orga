import { Loader, Stack } from '@mantine/core';
import type { ComponentType, ReactNode } from 'react';
import type { Session } from '@forga/core-contracts';
import { ACCESS_REPORT_PERMISSION, CONSENTS_PERMISSION, PRIVACY_PERMISSION } from '@forga/privacy-contracts';
import type { Extension } from '@forga/web-sdk';
import { useNoticeState } from './api';
import { MyConsentsPanel } from './consents/MyConsents';
import { AccessLogView } from './pages/AccessLogView';
import { AccessReportButton, MyAccessReports } from './pages/AccessReports';
import { MyPrivacy } from './pages/MyPrivacy';
import { FirstLoginPage } from './pages/NoticePage';
import { PersonPrivacyTab } from './pages/PersonPrivacyTab';
import { RectificationButton } from './pages/Rectification';

type ExtensionComponent = ComponentType<Record<string, unknown>>;

/** Before working: the privacy notice at the first sign-in and after a new version (extension point `core.session.gate`). */
function NoticeGate({ session, children }: { session: Session; children: ReactNode }) {
  const { data: notice, error } = useNoticeState();
  // Without an answer (e.g. the module was just switched off) nothing blocks the work.
  if (error) return children;
  if (!notice) return <Loader m="xl" />;
  if (notice.due) return <FirstLoginPage session={session} notice={notice} />;
  return children;
}

/** „Berichtigung beantragen …“ below every section of "My area" except the data protection section itself. */
function SectionRectification({ area }: { area: string }) {
  return area === 'privacy' ? null : <RectificationButton area={area} />;
}

/** Data protection section of "My area": own consents and requests, notice and contacts. */
function MySection() {
  return (
    <Stack gap="lg">
      <MyConsentsPanel />
      <MyPrivacy />
    </Stack>
  );
}

/** Contributions to extension points of the shell and of the master data module. */
export const extensions: Record<string, Extension> = {
  'core.session.gate': { label: { de: 'Datenschutzhinweis', en: 'Privacy notice' }, component: NoticeGate as unknown as ExtensionComponent },
  'core.me.top': { label: { de: 'Meine Daten', en: 'My data' }, component: MyAccessReports as ExtensionComponent },
  'core.me.sections': { label: { de: 'Datenschutz', en: 'Data protection' }, order: 1000, component: MySection as ExtensionComponent },
  'core.me.section-actions': { label: { de: 'Berichtigung beantragen', en: 'Request rectification' }, component: SectionRectification as unknown as ExtensionComponent },
  'core.audit.tabs': { label: { de: 'Leseprotokoll', en: 'Read log' }, permission: 'core.audit.read', component: AccessLogView as ExtensionComponent },
  // Tab „Datenschutz“ of the person file (`?tab=privacy`): requests, consents, information and restriction of processing.
  'masterdata.person.tab': {
    label: { de: 'Datenschutz', en: 'Data protection' },
    // Data protection, or recording consents for the department (L9).
    anyPermission: [PRIVACY_PERMISSION, CONSENTS_PERMISSION],
    order: 900,
    component: PersonPrivacyTab as unknown as ExtensionComponent,
  },
  'masterdata.person.actions': { label: { de: 'Auskunft erstellen', en: 'Create access report' }, permission: ACCESS_REPORT_PERMISSION, component: AccessReportButton as unknown as ExtensionComponent },
};
