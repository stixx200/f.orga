import { Stack, Tabs } from '@mantine/core';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useTranslation } from '@forga/web-sdk';
import { PageHeader } from '@forga/web-ui';

const TABS = ['overview', 'transfer', 'history', 'mappings', 'export', 'settings'] as const;

/** A page of the module under "Verwaltung → MP-Feuer" with the tabs between its pages. */
export function ModulePage({ children, tab }: { children: ReactNode; tab?: (typeof TABS)[number] }) {
  const { t } = useTranslation('mp-feuer');
  const navigate = useNavigate();
  const location = useLocation();
  const active = tab ?? (location.pathname.includes('/runs/') ? 'transfer' : TABS.find((name) => location.pathname.includes(`/${name}`))) ?? 'overview';
  return (
    <Stack gap="lg">
      <PageHeader breadcrumbs={[{ label: t('administration') }, { label: t('module') }]} title={t('module')} />
      <Tabs value={active} onChange={(value) => value && navigate(`/mp-feuer/${value}`)} keepMounted={false}>
        <Tabs.List aria-label={t('tabs.label')}>
          {TABS.map((name) => (
            <Tabs.Tab key={name} value={name}>{t(`tabs.${name}`)}</Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>
      {children}
    </Stack>
  );
}
