import { Button, Group, Stack, Select, Text } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { Due, Item } from '@forga/equipment-contracts';
import { apiUrl, formatDate, useLocalized, useTranslation } from '@forga/web-sdk';
import { DataTable, PageHeader } from '@forga/web-ui';
import { useDepartments, useDueSoon, useItemAccess, useItems, usePlace } from '../api';
import { DueDate } from '../parts';

type Row = { item: Item; due: Due };

const label = (item: Item) => `${item.inventoryNumber} · ${item.name}`;

/** Inspections due until a date; recording many at once is on the bulk inspection page. */
export function InspectionsPage() {
  const { t, i18n } = useTranslation('equipment');
  const localized = useLocalized();
  const navigate = useNavigate();
  const place = usePlace();
  const access = useItemAccess();
  const { soon } = useDueSoon();
  const { data: departments = [] } = useDepartments();
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [until, setUntil] = useState<string | null>(soon);
  const { data: items = [], isLoading } = useItems({ departmentId: departmentId ?? undefined });
  const rows: Row[] = items.flatMap((item) => item.dues.filter((d) => d.dueOn && (!until || d.dueOn <= until)).map((due) => ({ item, due }))).toSorted((a, b) => String(a.due.dueOn).localeCompare(String(b.due.dueOn)));

  return (
    <Stack gap="lg">
      <PageHeader
        breadcrumbs={[{ label: t('module') }, { label: t('duePage.title') }]}
        title={t('duePage.title')}
        subtitle={t('duePage.subtitle')}
        actions={
          <Group gap="sm">
            {access.inspectsAnything && <Button component={Link} to="/equipment/bulk" variant="default">{t('bulk.title')}</Button>}
            <Button component="a" href={apiUrl('core/lists/equipment.inspection-report/export/pdf', { departmentId: departmentId ?? undefined, lang: i18n.language })} target="_blank" variant="default">{t('protocol.today')}</Button>
          </Group>
        }
      />
      <Group align="end">
        <DateInput label={t('duePage.until')} value={until} onChange={setUntil} valueFormat="DD.MM.YYYY" clearable />
        <Select label={t('fields.department')} placeholder={t('items.all')} data={departments.map((d) => ({ value: d.id, label: d.name }))} value={departmentId} onChange={setDepartmentId} clearable />
      </Group>
      <DataTable<Row>
        rows={rows}
        rowKey={(r) => `${r.item.id}:${r.due.key}`}
        empty={isLoading ? t('loading') : t('duePage.empty')}
        columns={[
          { key: 'due', header: t('inspection.due'), render: (r) => <DueDate dueOn={r.due.dueOn} /> },
          { key: 'type', header: t('inspection.type'), render: (r) => localized(r.due.name) },
          { key: 'item', header: t('fields.name'), render: (r) => <Text size="sm" fw={700} c="brand" style={{ cursor: 'pointer' }} onClick={() => navigate(`/equipment/items/${r.item.id}?tab=inspections`)}>{label(r.item)}</Text> },
          { key: 'place', header: t('fields.place'), render: (r) => place(r.item) },
          { key: 'last', header: t('inspection.last'), render: (r) => formatDate(r.due.lastDate, i18n.language) },
        ]}
      />
    </Stack>
  );
}
