import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/dates/styles.css';
import 'dayjs/locale/de';
import '@forga/web-ui/forga.css';
import { type ComponentType, type ReactNode, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { addTranslations, registerExtensions, useTranslation } from '@forga/web-sdk';
import { forgaTheme } from '@forga/web-ui';
import { App } from './App';
import { shellTranslations } from './i18n';
import { PersonPrivacyTab } from './pages/privacy/PersonPrivacyTab';

addTranslations('shell', shellTranslations);
// Tab „Datenschutz“ of the person file (`?tab=privacy`): requests, information and restriction of processing.
registerExtensions('privacy', {
  'masterdata.person.tab': {
    label: { de: 'Datenschutz', en: 'Data protection' },
    permission: 'core.privacy.manage',
    order: 900,
    component: PersonPrivacyTab as ComponentType<Record<string, unknown>>,
  },
});

/** Date pickers follow the UI language (month names, first weekday). */
function LocalizedDates({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  return <DatesProvider settings={{ locale: i18n.language, firstDayOfWeek: 1 }}>{children}</DatesProvider>;
}

const container = document.getElementById('root');
if (!container) throw new Error('#root element not found');

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });

createRoot(container).render(
  <StrictMode>
    <MantineProvider theme={forgaTheme}>
      <Notifications position="top-right" />
      <QueryClientProvider client={queryClient}>
        <LocalizedDates>
          <App />
        </LocalizedDates>
      </QueryClientProvider>
    </MantineProvider>
  </StrictMode>,
);
