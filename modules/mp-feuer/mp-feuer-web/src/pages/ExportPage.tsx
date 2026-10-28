import { List, Text } from '@mantine/core';
import { useLocalized, useTranslation } from '@forga/web-sdk';
import { DataTable, Notice, Panel, StatusBadge } from '@forga/web-ui';
import { useExports } from '../api';
import { ModulePage } from '../components/ModulePage';

/** Exports planned until the templates of MP-Feuer's table import are available. */
const PLANNED = [
  { id: 'persons', permission: 'masterdata.persons.read' },
  { id: 'qualifications', permission: 'masterdata.persons.read' },
  { id: 'incidents', permission: 'incidents.reports.read' },
] as const;

/** "Export nach MP-Feuer": placeholder until adapters for the templates exist. */
export function ExportPage() {
  const { t } = useTranslation('mp-feuer');
  const localized = useLocalized();
  const { data: available = [] } = useExports();
  return (
    <ModulePage tab="export">
      <Notice kind="warning">{t('export.preparing')}</Notice>
      <DataTable
        rows={[...PLANNED]}
        rowKey={(e) => e.id}
        exportable={false}
        columns={[
          { key: 'name', header: t('export.export'), render: (e) => <b>{available.find((a) => a.id === e.id)?.name ? localized(available.find((a) => a.id === e.id)!.name) : t(`export.planned.${e.id}.name`)}</b> },
          { key: 'data', header: t('export.data'), render: (e) => t(`export.planned.${e.id}.data`) },
          { key: 'permission', header: t('export.permission'), render: (e) => <code translate="no">{e.permission}</code> },
          { key: 'state', header: t('export.state'), render: (e) => (available.some((a) => a.id === e.id) ? <StatusBadge tone="done">{t('export.available')}</StatusBadge> : <StatusBadge>{t('export.templateMissing')}</StatusBadge>) },
        ]}
      />
      <Panel title={t('export.howTitle')}>
        <List type="ordered" size="sm" spacing={4}>
          <List.Item>{t('export.how1')}</List.Item>
          <List.Item>{t('export.how2')}</List.Item>
          <List.Item>{t('export.how3')}</List.Item>
        </List>
        <Text size="xs" c="dimmed" mt="xs">{t('export.permissionHint')}</Text>
      </Panel>
    </ModulePage>
  );
}
