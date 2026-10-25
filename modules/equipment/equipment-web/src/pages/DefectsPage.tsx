import { Button, Group, Select, Stack, Switch, Text, TextInput } from '@mantine/core';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { Defect, DefectStatus } from '@forga/equipment-contracts';
import { can, formatDate, send, useSession, useTranslation } from '@forga/web-sdk';
import { Attachments, DataTable, PageHeader, ResponsiveDialog, StatusBadge, useAction } from '@forga/web-ui';
import { keys, useDefects, WRITE } from '../api';

function DefectStatusDialog({ defect, onClose }: { defect: Defect; onClose: () => void }) {
  const { t } = useTranslation('equipment');
  const { t: common } = useTranslation('common');
  const [status, setStatus] = useState<DefectStatus>(defect.status === 'reported' ? 'in-progress' : defect.status);
  const [resolution, setResolution] = useState(defect.resolution);
  const save = useAction(() => send('PUT', `equipment/defects/${defect.id}`, { status, resolution }), { success: t('defect.updated'), invalidate: [keys.all], onSuccess: onClose });
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={t('defect.handle')}
      actions={
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button loading={save.isPending} onClick={() => save.mutate(undefined)}>{common('actions.save')}</Button>
        </Group>
      }
    >
      <Text size="sm">{defect.inventoryNumber} · {defect.itemName}: {defect.description}</Text>
      <Select label={t('fields.status')} data={(['reported', 'in-progress', 'fixed'] as const).map((s) => ({ value: s, label: t(`defectStatus.${s}`) }))} value={status} onChange={(v) => v && setStatus(v as DefectStatus)} allowDeselect={false} />
      <TextInput label={t('defect.resolution')} value={resolution} onChange={(e) => setResolution(e.currentTarget.value)} />
      <Text size="sm" fw={700} mt="sm">{common('attachments.title')}</Text>
      <Attachments type="equipment.defect" id={defect.id} editable />
    </ResponsiveDialog>
  );
}

/** Defects of the visible equipment; the equipment officer handles them. */
export function DefectsPage() {
  const { t, i18n } = useTranslation('equipment');
  const navigate = useNavigate();
  const session = useSession().data;
  const [all, setAll] = useState(false);
  const { data = [], isLoading } = useDefects({ open: all ? undefined : 'true' });
  const [handling, setHandling] = useState<Defect | null>(null);
  return (
    <Stack gap="lg">
      <PageHeader breadcrumbs={[{ label: t('module') }, { label: t('defect.title') }]} title={t('defect.title')} actions={<Switch label={t('defect.showAll')} checked={all} onChange={(e) => setAll(e.currentTarget.checked)} />} />
      <DataTable<Defect>
        rows={data}
        rowKey={(d) => d.id}
        empty={isLoading ? t('loading') : t('defect.none')}
        columns={[
          { key: 'date', header: t('defect.reportedAt'), render: (d) => formatDate(d.reportedAt, i18n.language) },
          { key: 'item', header: t('fields.name'), render: (d) => <Text size="sm" fw={700} c="brand" style={{ cursor: 'pointer' }} onClick={() => navigate(`/equipment/items/${d.itemId}`)}>{d.inventoryNumber} · {d.itemName}</Text> },
          { key: 'description', header: t('defect.description'), render: (d) => <><Text size="sm">{d.description}</Text>{d.resolution && <Text size="xs" c="dimmed">{d.resolution}</Text>}</> },
          { key: 'by', header: t('defect.by'), render: (d) => d.reportedBy },
          { key: 'status', header: t('fields.status'), render: (d) => <StatusBadge tone={d.status === 'fixed' ? 'done' : d.status === 'retired' ? 'neutral' : d.status === 'in-progress' ? 'warning' : 'error'}>{t(`defectStatus.${d.status}`)}</StatusBadge> },
          { key: 'actions', header: '', align: 'right', render: (d) => can(session, WRITE, d.departmentId) && (d.status === 'reported' || d.status === 'in-progress') && <Button size="compact-xs" onClick={() => setHandling(d)}>{t('defect.handle')}</Button> },
        ]}
      />
      {handling && <DefectStatusDialog defect={handling} onClose={() => setHandling(null)} />}
    </Stack>
  );
}
