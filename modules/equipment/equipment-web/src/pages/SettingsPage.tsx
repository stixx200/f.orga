import { ActionIcon, Button, Checkbox, Group, NumberInput, Select, SimpleGrid, Stack, Table, Tabs, Text, TextInput } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import type { Category, CategoryInput, EquipmentType, EquipmentTypeInput, InspectionType } from '@forga/equipment-contracts';
import { send, useLocalized, useTranslation } from '@forga/web-sdk';
import { DataTable, Notice, PageHeader, Panel, ResponsiveDialog, StatusBadge, useAction } from '@forga/web-ui';
import { keys, useCategories, useTypes } from '../api';

/** Categories depth-first with their depth; categories of a cycle or with an unknown parent count as top level. */
function treeOrder(categories: Category[]): { category: Category; depth: number }[] {
  const known = new Set(categories.map((c) => c.key));
  const children = new Map<string | null, Category[]>();
  for (const c of categories) {
    const parent = c.parentKey && known.has(c.parentKey) && c.parentKey !== c.key ? c.parentKey : null;
    children.set(parent, [...(children.get(parent) ?? []), c]);
  }
  const result: { category: Category; depth: number }[] = [];
  const seen = new Set<string>();
  const walk = (parent: string | null, depth: number) => {
    for (const c of children.get(parent) ?? []) {
      if (seen.has(c.key)) continue;
      seen.add(c.key);
      result.push({ category: c, depth });
      walk(c.key, depth + 1);
    }
  };
  walk(null, 0);
  // Members of a cycle are not reachable from the top: show them at the top level.
  for (const c of categories) if (!seen.has(c.key)) result.push({ category: c, depth: 0 });
  return result;
}

function CategoryDialog({ category, parentKey = null, onClose }: { category?: Category; parentKey?: string | null; onClose: () => void }) {
  const { t } = useTranslation('equipment');
  const { t: common } = useTranslation('common');
  const localized = useLocalized();
  const { data: categories = [] } = useCategories();
  const [form, setForm] = useState<Required<CategoryInput>>(() => ({ key: category?.key ?? '', name: category?.name ?? { de: '', en: '' }, parentKey: category?.parentKey ?? parentKey, tracking: category?.tracking ?? 'item', breathingApparatus: category?.breathingApparatus ?? false }));
  const save = useAction(() => {
    const body = { ...form, name: { de: form.name.de, en: form.name.en || form.name.de } };
    return category ? send('PUT', `equipment/categories/${category.id}`, body) : send('POST', 'equipment/categories', body);
  }, { success: t('settings.saved'), invalidate: [keys.all], onSuccess: onClose });
  return (
    <ResponsiveDialog opened onClose={onClose} title={category ? t('settings.editCategory') : t('settings.newCategory')} actions={<Group justify="flex-end"><Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button><Button loading={save.isPending} disabled={!form.key || !form.name.de} onClick={() => save.mutate(undefined)}>{common('actions.save')}</Button></Group>}>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <TextInput label={t('settings.key')} value={form.key} onChange={(e) => setForm({ ...form, key: e.currentTarget.value })} disabled={Boolean(category)} required />
        <Select label={t('settings.parent')} data={categories.filter((c) => c.key !== form.key).map((c) => ({ value: c.key, label: localized(c.name) }))} value={form.parentKey} onChange={(v) => setForm({ ...form, parentKey: v })} clearable />
        <TextInput label={t('settings.nameDe')} value={form.name.de} onChange={(e) => setForm({ ...form, name: { ...form.name, de: e.currentTarget.value } })} required />
        <TextInput label={t('settings.nameEn')} value={form.name.en} onChange={(e) => setForm({ ...form, name: { ...form.name, en: e.currentTarget.value } })} />
        <Select label={t('settings.tracking')} data={(['item', 'stock'] as const).map((x) => ({ value: x, label: t(`tracking.${x}`) }))} value={form.tracking} onChange={(v) => v && setForm({ ...form, tracking: v as Category['tracking'] })} allowDeselect={false} />
        <Checkbox mt="xl" label={t('settings.breathing')} checked={form.breathingApparatus} onChange={(e) => setForm({ ...form, breathingApparatus: e.currentTarget.checked })} />
      </SimpleGrid>
    </ResponsiveDialog>
  );
}

const emptyInspection = (): InspectionType => ({ key: `check-${Date.now().toString(36)}`, name: { de: '', en: '' }, intervalMonths: 12, trigger: 'periodic', inspector: 'competent-person', checklist: [] });

function TypeDialog({ type, onClose }: { type?: EquipmentType; onClose: () => void }) {
  const { t } = useTranslation('equipment');
  const { t: common } = useTranslation('common');
  const localized = useLocalized();
  const { data: categories = [] } = useCategories();
  const [form, setForm] = useState<Required<EquipmentTypeInput>>(() => ({
    key: type?.key ?? '', name: type?.name ?? { de: '', en: '' }, categoryKey: type?.categoryKey ?? '', manufacturer: type?.manufacturer ?? '', model: type?.model ?? '', inspections: type?.inspections ?? [], properties: type?.properties ?? [],
  }));
  const setInspection = (index: number, change: Partial<InspectionType>) => setForm({ ...form, inspections: form.inspections.map((x, i) => (i === index ? { ...x, ...change } : x)) });
  const save = useAction(() => {
    const body = { ...form, name: { de: form.name.de, en: form.name.en || form.name.de }, inspections: form.inspections.map((x) => ({ ...x, name: { de: x.name.de, en: x.name.en || x.name.de } })) };
    return type ? send('PUT', `equipment/types/${type.id}`, body) : send('POST', 'equipment/types', body);
  }, { success: t('settings.saved'), invalidate: [keys.all], onSuccess: onClose });
  return (
    <ResponsiveDialog opened onClose={onClose} title={type ? t('settings.editType') : t('settings.newType')} size="xl" actions={<Group justify="flex-end"><Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button><Button loading={save.isPending} disabled={!form.key || !form.name.de || !form.categoryKey || form.inspections.some((x) => !x.name.de)} onClick={() => save.mutate(undefined)}>{common('actions.save')}</Button></Group>}>
      <Stack gap="sm">
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <TextInput label={t('settings.key')} value={form.key} onChange={(e) => setForm({ ...form, key: e.currentTarget.value })} disabled={Boolean(type)} required />
          <TextInput label={t('settings.nameDe')} value={form.name.de} onChange={(e) => setForm({ ...form, name: { ...form.name, de: e.currentTarget.value } })} required />
          <TextInput label={t('settings.nameEn')} value={form.name.en} onChange={(e) => setForm({ ...form, name: { ...form.name, en: e.currentTarget.value } })} />
          <Select label={t('fields.category')} data={categories.map((c) => ({ value: c.key, label: localized(c.name) }))} value={form.categoryKey || null} onChange={(v) => setForm({ ...form, categoryKey: v ?? '' })} required />
          <TextInput label={t('fields.manufacturer')} value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.currentTarget.value })} />
          <TextInput label={t('settings.model')} value={form.model} onChange={(e) => setForm({ ...form, model: e.currentTarget.value })} />
        </SimpleGrid>
        <TextInput label={t('settings.properties')} description={t('settings.propertiesHint')} value={form.properties.join(', ')} onChange={(e) => setForm({ ...form, properties: e.currentTarget.value.split(',').map((x) => x.trim()).filter(Boolean) })} />
        <Text size="sm" fw={700}>{t('settings.inspections')}</Text>
        <Table>
          <Table.Thead><Table.Tr><Table.Th>{t('settings.nameDe')}</Table.Th><Table.Th>{t('settings.interval')}</Table.Th><Table.Th>{t('inspection.trigger')}</Table.Th><Table.Th>{t('inspection.inspector')}</Table.Th><Table.Th /></Table.Tr></Table.Thead>
          <Table.Tbody>
            {form.inspections.map((x, index) => (
              <Table.Tr key={x.key}>
                <Table.Td><TextInput aria-label={t('settings.nameDe')} value={x.name.de} onChange={(e) => setInspection(index, { name: { ...x.name, de: e.currentTarget.value } })} /></Table.Td>
                <Table.Td><NumberInput aria-label={t('settings.interval')} w={90} value={x.intervalMonths ?? ''} onChange={(v) => setInspection(index, { intervalMonths: v === '' ? null : Number(v) })} min={1} /></Table.Td>
                <Table.Td><Select aria-label={t('inspection.trigger')} data={(['periodic', 'after-use', 'after-incident', 'after-washing'] as const).map((v) => ({ value: v, label: t(`trigger.${v}`) }))} value={x.trigger} onChange={(v) => v && setInspection(index, { trigger: v as InspectionType['trigger'] })} allowDeselect={false} /></Table.Td>
                <Table.Td><Select aria-label={t('inspection.inspector')} data={(['user', 'competent-person', 'fall-protection-expert', 'electrician', 'expert'] as const).map((v) => ({ value: v, label: t(`inspector.${v}`) }))} value={x.inspector} onChange={(v) => v && setInspection(index, { inspector: v as InspectionType['inspector'] })} allowDeselect={false} /></Table.Td>
                <Table.Td><ActionIcon variant="subtle" color="red" aria-label={t('settings.remove')} onClick={() => setForm({ ...form, inspections: form.inspections.filter((_, i) => i !== index) })}><IconTrash size={16} /></ActionIcon></Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        <Group><Button size="xs" variant="default" onClick={() => setForm({ ...form, inspections: [...form.inspections, emptyInspection()] })}>{t('settings.addInspection')}</Button></Group>
      </Stack>
    </ResponsiveDialog>
  );
}

/** Administration: categories, equipment types with inspection types, DGUV template, vehicles. */
export function SettingsPage() {
  const { t } = useTranslation('equipment');
  const localized = useLocalized();
  const { data: categories = [] } = useCategories();
  const { data: types = [] } = useTypes();
  const [editCategory, setEditCategory] = useState<Category | 'new' | null>(null);
  const [newParent, setNewParent] = useState<string | null>(null);
  const [editType, setEditType] = useState<EquipmentType | 'new' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const template = useAction(() => send<{ categories: number; types: number }>('POST', 'equipment/templates/dguv'), { invalidate: [keys.all], onSuccess: (r) => setNotice(t('settings.templateDone', r)) });
  const vehicles = useAction(() => send<{ created: number }>('POST', 'equipment/vehicles/sync'), { invalidate: [keys.all], onSuccess: (r) => setNotice(t('settings.vehiclesDone', r)) });
  const category = (key: string) => {
    const c = categories.find((x) => x.key === key);
    return c ? localized(c.name) : key;
  };
  return (
    <Stack gap="lg">
      <PageHeader
        breadcrumbs={[{ label: t('module') }, { label: t('settings.title') }]}
        title={t('settings.title')}
        actions={
          <Group gap="sm">
            <Button variant="default" loading={template.isPending} onClick={() => template.mutate(undefined)}>{t('settings.template')}</Button>
            <Button variant="default" loading={vehicles.isPending} onClick={() => vehicles.mutate(undefined)}>{t('settings.vehicles')}</Button>
          </Group>
        }
      />
      {notice && <Notice kind="done">{notice}</Notice>}
      <Tabs defaultValue="types">
        <Tabs.List mb="md">
          <Tabs.Tab value="types">{t('settings.types')}</Tabs.Tab>
          <Tabs.Tab value="categories">{t('settings.categories')}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="types">
          <Panel aside={<Button size="xs" onClick={() => setEditType('new')}>{t('settings.newType')}</Button>}>
            <DataTable<EquipmentType>
              rows={types}
              rowKey={(x) => x.id}
              onRowClick={setEditType}
              empty={t('settings.noTypes')}
              columns={[
                { key: 'name', header: t('fields.name'), render: (x) => <><Text size="sm" fw={700}>{localized(x.name)}</Text><Text size="xs" c="dimmed">{x.key}</Text></> },
                { key: 'category', header: t('fields.category'), render: (x) => category(x.categoryKey) },
                { key: 'inspections', header: t('settings.inspections'), render: (x) => x.inspections.map((i) => `${localized(i.name)}${i.intervalMonths ? ` (${i.intervalMonths} M.)` : ''}`).join(' · ') },
              ]}
            />
          </Panel>
        </Tabs.Panel>
        <Tabs.Panel value="categories">
          <Panel aside={<Button size="xs" onClick={() => { setNewParent(null); setEditCategory('new'); }}>{t('settings.newCategory')}</Button>}>
            <DataTable<{ category: Category; depth: number }>
              rows={treeOrder(categories)}
              rowKey={(x) => x.category.id}
              onRowClick={(x) => setEditCategory(x.category)}
              empty={t('settings.noCategories')}
              columns={[
                {
                  key: 'name',
                  header: t('fields.name'),
                  render: ({ category: x, depth }) => (
                    <div style={{ paddingLeft: depth * 24 }}>
                      <Text size="sm" fw={depth === 0 ? 700 : 400}>{depth > 0 && <Text span c="dimmed">└ </Text>}{localized(x.name)}</Text>
                      <Text size="xs" c="dimmed">{x.key}</Text>
                    </div>
                  ),
                },
                { key: 'tracking', header: t('settings.tracking'), render: ({ category: x }) => t(`tracking.${x.tracking}`) },
                { key: 'breathing', header: '', render: ({ category: x }) => x.breathingApparatus && <StatusBadge>{t('settings.breathingShort')}</StatusBadge> },
                {
                  key: 'child',
                  header: '',
                  align: 'right',
                  render: ({ category: x }) => (
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      onClick={(event) => {
                        event.stopPropagation();
                        setNewParent(x.key);
                        setEditCategory('new');
                      }}
                    >
                      {t('settings.newSubcategory')}
                    </Button>
                  ),
                },
              ]}
            />
          </Panel>
        </Tabs.Panel>
      </Tabs>
      {editCategory && (
        <CategoryDialog
          category={editCategory === 'new' ? undefined : editCategory}
          parentKey={newParent}
          onClose={() => {
            setEditCategory(null);
            setNewParent(null);
          }}
        />
      )}
      {editType && <TypeDialog type={editType === 'new' ? undefined : editType} onClose={() => setEditType(null)} />}
    </Stack>
  );
}
