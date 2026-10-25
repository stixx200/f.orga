import { Button, Group, Select, Stack, Text, TextInput } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { Item } from '@forga/equipment-contracts';
import { can, useLocalized, useSession, useTranslation } from '@forga/web-sdk';
import { DataTable, PageHeader, StatusBadge } from '@forga/web-ui';
import { useCategories, useCategoryName, useDepartments, useDueSoon, useItems, usePlace, WRITE } from '../api';
import { DueDate, ItemStatusBadge } from '../parts';
import { ItemDialog } from './ItemDialog';

/** Equipment with search and filters; next inspection with traffic light. */
export function ItemsPage() {
  const { t } = useTranslation('equipment');
  const navigate = useNavigate();
  const session = useSession().data;
  const localized = useLocalized();
  const category = useCategoryName();
  const place = usePlace();
  const { data: categories = [] } = useCategories();
  const { data: departments = [] } = useDepartments();
  const [q, setQ] = useState('');
  const [categoryKey, setCategoryKey] = useState<string | null>(null);
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [due, setDue] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const { soon, today, days } = useDueSoon();
  const { data = [], isLoading } = useItems({
    q: q.trim() || undefined,
    categoryKey: categoryKey ?? undefined,
    departmentId: departmentId ?? undefined,
    status: status ?? undefined,
    dueBefore: due === 'overdue' ? today : due === 'soon' ? soon : undefined,
  });

  return (
    <Stack gap="lg">
      <PageHeader
        breadcrumbs={[{ label: t('module') }, { label: t('items.title') }]}
        title={t('items.title')}
        actions={
          <Group gap="sm">
            <Button component={Link} to="/equipment/labels" variant="default">{t('labels.title')}</Button>
            {can(session, WRITE) && <Button onClick={() => setCreating(true)}>{t('item.new')}</Button>}
          </Group>
        }
      />
      <Group align="end">
        <TextInput label={t('items.search')} leftSection={<IconSearch size={16} />} value={q} onChange={(e) => setQ(e.currentTarget.value)} w={260} />
        <Select label={t('fields.category')} placeholder={t('items.all')} data={categories.map((c) => ({ value: c.key, label: localized(c.name) }))} value={categoryKey} onChange={setCategoryKey} clearable />
        <Select label={t('fields.department')} placeholder={t('items.all')} data={departments.map((d) => ({ value: d.id, label: d.name }))} value={departmentId} onChange={setDepartmentId} clearable />
        <Select label={t('fields.status')} placeholder={t('items.active')} data={(['ready', 'in-inspection', 'defective', 'in-repair', 'retired'] as const).map((s) => ({ value: s, label: t(`status.${s}`) }))} value={status} onChange={setStatus} clearable />
        <Select label={t('items.due')} placeholder={t('items.all')} data={[{ value: 'overdue', label: t('items.overdue') }, { value: 'soon', label: t('items.dueSoon', { count: days }) }]} value={due} onChange={setDue} clearable />
      </Group>
      <DataTable<Item>
        rows={data}
        rowKey={(i) => i.id}
        onRowClick={(i) => navigate(`/equipment/items/${i.id}`)}
        empty={isLoading ? t('loading') : t('items.empty')}
        columns={[
          { key: 'number', header: t('fields.inventoryNumber'), render: (i) => <Text fw={700} size="sm" c="brand">{i.inventoryNumber}</Text> },
          { key: 'name', header: t('fields.name'), render: (i) => <><Text size="sm" fw={700}>{i.name}{i.quantity > 1 ? ` × ${i.quantity}` : ''}</Text><Text size="xs" c="dimmed">{category(i.categoryKey)}</Text></> },
          { key: 'place', header: t('fields.place'), render: (i) => place(i) },
          { key: 'status', header: t('fields.status'), render: (i) => <Group gap={4}><ItemStatusBadge status={i.status} blocked={i.blocked} />{i.openDefects > 0 && <StatusBadge tone="error">{t('items.defects', { count: i.openDefects })}</StatusBadge>}</Group> },
          { key: 'next', header: t('items.nextInspection'), render: (i) => <DueDate dueOn={i.nextDue} /> },
        ]}
      />
      {creating && <ItemDialog onClose={() => setCreating(false)} />}
    </Stack>
  );
}
