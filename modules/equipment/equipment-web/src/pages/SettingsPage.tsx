import { Button, Checkbox, Group, MultiSelect, NumberInput, Radio, Select, SimpleGrid, Stack, Tabs, TagsInput, Text, TextInput } from '@mantine/core';
import { useState } from 'react';
import { type Category, type CategoryInput, EquipmentSettings, type EquipmentType, type EquipmentTypeInput, type InspectionCatalogEntry, type InspectionType, type Tracking } from '@forga/equipment-contracts';
import type { LocalizedText } from '@forga/core-contracts';
import { send, useLocalized, useTranslation } from '@forga/web-sdk';
import { Attachments, ConfirmDialog, DataTable, Notice, PageHeader, Panel, ResponsiveDialog, StatusBadge, treeOptions, useAction } from '@forga/web-ui';
import { keys, useCategories, useEquipmentSettings, useInspectionCatalog, useTypes } from '../api';
import { FormEditor, formComplete } from '../forms';

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

/** One table per category that has types, grouped under the top-level category, siblings by name. */
function typeGroups(categories: Category[], types: EquipmentType[], nameOf: (text: LocalizedText) => string): { groups: { root: Category; sections: { category: Category; types: EquipmentType[] }[] }[]; loose: EquipmentType[] } {
  const byName = (a: { name: LocalizedText }, b: { name: LocalizedText }) => nameOf(a.name).localeCompare(nameOf(b.name), 'de', { sensitivity: 'base' });
  const known = new Set(categories.map((c) => c.key));
  const children = new Map<string | null, Category[]>();
  for (const c of categories) {
    const parent = c.parentKey && known.has(c.parentKey) && c.parentKey !== c.key ? c.parentKey : null;
    children.set(parent, [...(children.get(parent) ?? []), c]);
  }
  for (const list of children.values()) list.sort(byName);
  const byCategory = new Map<string, EquipmentType[]>();
  const loose: EquipmentType[] = [];
  for (const type of types) {
    if (!known.has(type.categoryKey)) loose.push(type);
    else byCategory.set(type.categoryKey, [...(byCategory.get(type.categoryKey) ?? []), type]);
  }
  for (const list of byCategory.values()) list.sort(byName);
  loose.sort(byName);
  const seen = new Set<string>();
  const sectionsOf = (key: string): { category: Category; types: EquipmentType[] }[] => {
    if (seen.has(key)) return [];
    seen.add(key);
    const category = categories.find((c) => c.key === key);
    if (!category) return [];
    const own = byCategory.get(key) ?? [];
    const nested = (children.get(key) ?? []).flatMap((child) => sectionsOf(child.key));
    return [...(own.length ? [{ category, types: own }] : []), ...nested];
  };
  const roots = [...(children.get(null) ?? [])];
  const groups = roots.map((root) => ({ root, sections: sectionsOf(root.key) })).filter((g) => g.sections.length);
  for (const c of categories) {
    if (seen.has(c.key)) continue;
    const sections = sectionsOf(c.key);
    if (sections.length) groups.push({ root: c, sections });
  }
  return { groups, loose };
}

function CategoryDialog({ category, parentKey = null, onClose }: { category?: Category; parentKey?: string | null; onClose: () => void }) {
  const { t } = useTranslation('equipment');
  const { t: common } = useTranslation('common');
  const localized = useLocalized();
  const { data: categories = [] } = useCategories();
  const [form, setForm] = useState<Required<CategoryInput>>(() => ({ key: category?.key ?? '', name: category?.name ?? { de: '', en: '' }, parentKey: category?.parentKey ?? parentKey, tracking: category?.tracking ?? 'item', breathingApparatus: category?.breathingApparatus ?? false, lockWhenOverdue: category?.lockWhenOverdue ?? false }));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const save = useAction(() => {
    const body = { ...form, name: { de: form.name.de, en: form.name.en || form.name.de } };
    return category ? send('PUT', `equipment/categories/${category.id}`, body) : send('POST', 'equipment/categories', body);
  }, { success: t('settings.saved'), invalidate: [keys.all], onSuccess: onClose });
  const remove = useAction(() => send('DELETE', `equipment/categories/${category!.id}`), { success: t('settings.deleted'), invalidate: [keys.all], onSuccess: onClose });
  return (
    <>
    <ResponsiveDialog opened onClose={onClose} title={category ? t('settings.editCategory') : t('settings.newCategory')} actions={<Group justify="space-between">{category ? <Button variant="subtle" onClick={() => setConfirmDelete(true)}>{common('actions.delete')} …</Button> : <span />}<Group><Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button><Button loading={save.isPending} disabled={!form.key || !form.name.de} onClick={() => save.mutate(undefined)}>{common('actions.save')}</Button></Group></Group>}>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <TextInput label={t('settings.key')} value={form.key} onChange={(e) => setForm({ ...form, key: e.currentTarget.value })} disabled={Boolean(category)} required />
        <Select label={t('settings.parent')} data={treeOptions(categories, (c) => localized(c.name), { exclude: form.key })} value={form.parentKey} onChange={(v) => setForm({ ...form, parentKey: v })} clearable searchable />
        <TextInput label={t('settings.nameDe')} value={form.name.de} onChange={(e) => setForm({ ...form, name: { ...form.name, de: e.currentTarget.value } })} required />
        <TextInput label={t('settings.nameEn')} value={form.name.en} onChange={(e) => setForm({ ...form, name: { ...form.name, en: e.currentTarget.value } })} />
        <Select label={t('settings.tracking')} data={(['item', 'stock'] as const).map((x) => ({ value: x, label: t(`tracking.${x}`) }))} value={form.tracking} onChange={(v) => v && setForm({ ...form, tracking: v as Category['tracking'] })} allowDeselect={false} />
        <Checkbox mt="xl" label={t('settings.breathing')} checked={form.breathingApparatus} onChange={(e) => setForm({ ...form, breathingApparatus: e.currentTarget.checked })} />
        <Checkbox label={t('settings.lockWhenOverdue')} description={t('settings.lockWhenOverdueHint')} checked={form.lockWhenOverdue} onChange={(e) => setForm({ ...form, lockWhenOverdue: e.currentTarget.checked })} />
      </SimpleGrid>
    </ResponsiveDialog>
    {category && (
      <ConfirmDialog
        opened={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t('settings.deleteCategoryTitle', { name: localized(category.name) })}
        description={t('settings.deleteCategoryText')}
        confirmLabel={common('actions.delete')}
        loading={remove.isPending}
        onConfirm={() => remove.mutate(undefined)}
      />
    )}
    </>
  );
}

/** Inspection type of the shared catalog ("Prüfarten"): interval, trigger, inspector, checklist, form and its document. */
function InspectionTypeDialog({ entry, onClose }: { entry?: InspectionCatalogEntry; onClose: () => void }) {
  const { t } = useTranslation('equipment');
  const { t: common } = useTranslation('common');
  const localized = useLocalized();
  const [form, setForm] = useState<InspectionType>(() => ({
    key: entry?.key ?? '',
    name: entry?.name ?? { de: '', en: '' },
    intervalMonths: entry?.intervalMonths ?? 12,
    trigger: entry?.trigger ?? 'periodic',
    inspector: entry?.inspector ?? 'competent-person',
    checklist: entry?.checklist ?? [],
    form: entry?.form ?? { kind: 'none' },
  }));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const save = useAction(
    () => {
      const body = { ...form, name: { de: form.name.de, en: form.name.en || form.name.de }, intervalMonths: form.trigger === 'periodic' ? form.intervalMonths : null };
      return entry ? send('PUT', `equipment/inspection-types/${entry.id}`, body) : send('POST', 'equipment/inspection-types', body);
    },
    { success: t('settings.saved'), invalidate: [keys.all], onSuccess: onClose },
  );
  const remove = useAction(() => send('DELETE', `equipment/inspection-types/${entry!.id}`), { success: t('catalog.deleted'), invalidate: [keys.all], onSuccess: onClose });
  return (
    <>
      <ResponsiveDialog
        opened
        onClose={onClose}
        title={entry ? t('catalog.edit') : t('catalog.newTitle')}
        size="xl"
        actions={
          <Group justify="space-between">
            {entry ? <Button variant="subtle" onClick={() => setConfirmDelete(true)}>{common('actions.delete')} …</Button> : <span />}
            <Group>
              <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
              <Button loading={save.isPending} disabled={!form.key || !form.name.de || !formComplete(form.form)} onClick={() => save.mutate(undefined)}>{common('actions.save')}</Button>
            </Group>
          </Group>
        }
      >
        <Stack gap="sm">
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <TextInput label={t('settings.key')} value={form.key} onChange={(e) => setForm({ ...form, key: e.currentTarget.value })} disabled={Boolean(entry)} required />
            <TextInput label={t('settings.nameDe')} value={form.name.de} onChange={(e) => setForm({ ...form, name: { ...form.name, de: e.currentTarget.value } })} required />
            <TextInput label={t('settings.nameEn')} value={form.name.en} onChange={(e) => setForm({ ...form, name: { ...form.name, en: e.currentTarget.value } })} />
          </SimpleGrid>
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <Select label={t('inspection.trigger')} data={(['periodic', 'after-use', 'after-incident', 'after-washing'] as const).map((v) => ({ value: v, label: t(`trigger.${v}`) }))} value={form.trigger} onChange={(v) => v && setForm({ ...form, trigger: v as InspectionType['trigger'] })} allowDeselect={false} />
            <NumberInput label={t('settings.interval')} value={form.intervalMonths ?? ''} onChange={(v) => setForm({ ...form, intervalMonths: v === '' ? null : Number(v) })} min={1} max={240} disabled={form.trigger !== 'periodic'} />
            <Select label={t('inspection.inspector')} data={(['user', 'competent-person', 'fall-protection-expert', 'electrician', 'expert'] as const).map((v) => ({ value: v, label: t(`inspector.${v}`) }))} value={form.inspector} onChange={(v) => v && setForm({ ...form, inspector: v as InspectionType['inspector'] })} allowDeselect={false} />
          </SimpleGrid>
          <TagsInput label={t('catalog.checklist')} description={t('catalog.checklistHint')} value={form.checklist} onChange={(checklist) => setForm({ ...form, checklist })} />
          <FormEditor form={form.form} onChange={(next) => setForm({ ...form, form: next })} documentHint={entry ? undefined : t('catalog.documentSaveFirst')} />
          {form.form.kind === 'document' && entry && (
            <Stack gap={6}>
              <Text size="sm" fw={700}>{t('form.document')}</Text>
              <Attachments type="equipment.inspection-type" id={entry.id} editable />
            </Stack>
          )}
        </Stack>
      </ResponsiveDialog>
      {entry && (
        <ConfirmDialog
          opened={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          title={t('catalog.deleteTitle', { name: localized(entry.name) })}
          description={t('catalog.deleteText')}
          confirmLabel={common('actions.delete')}
          loading={remove.isPending}
          onConfirm={() => remove.mutate(undefined)}
        />
      )}
    </>
  );
}

function TypeDialog({ type, onClose }: { type?: EquipmentType; onClose: () => void }) {
  const { t } = useTranslation('equipment');
  const { t: common } = useTranslation('common');
  const localized = useLocalized();
  const { data: categories = [] } = useCategories();
  const { data: catalog = [] } = useInspectionCatalog();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState<Required<EquipmentTypeInput>>(() => ({
    key: type?.key ?? '', name: type?.name ?? { de: '', en: '' }, categoryKey: type?.categoryKey ?? '', manufacturer: type?.manufacturer ?? '', model: type?.model ?? '', inspectionKeys: type?.inspectionKeys ?? [], properties: type?.properties ?? [],
  }));
  const save = useAction(() => {
    const body = { ...form, name: { de: form.name.de, en: form.name.en || form.name.de } };
    return type ? send('PUT', `equipment/types/${type.id}`, body) : send('POST', 'equipment/types', body);
  }, { success: t('settings.saved'), invalidate: [keys.all], onSuccess: onClose });
  const remove = useAction(() => send('DELETE', `equipment/types/${type!.id}`), { success: t('settings.typeDeleted'), invalidate: [keys.all], onSuccess: onClose });
  return (
    <>
    <ResponsiveDialog opened onClose={onClose} title={type ? t('settings.editType') : t('settings.newType')} size="xl" actions={<Group justify="space-between">{type ? <Button variant="subtle" onClick={() => setConfirmDelete(true)}>{common('actions.delete')} …</Button> : <span />}<Group><Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button><Button loading={save.isPending} disabled={!form.key || !form.name.de || !form.categoryKey} onClick={() => save.mutate(undefined)}>{common('actions.save')}</Button></Group></Group>}>
      <Stack gap="sm">
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <TextInput label={t('settings.key')} value={form.key} onChange={(e) => setForm({ ...form, key: e.currentTarget.value })} disabled={Boolean(type)} required />
          <TextInput label={t('settings.nameDe')} value={form.name.de} onChange={(e) => setForm({ ...form, name: { ...form.name, de: e.currentTarget.value } })} required />
          <TextInput label={t('settings.nameEn')} value={form.name.en} onChange={(e) => setForm({ ...form, name: { ...form.name, en: e.currentTarget.value } })} />
          <Select label={t('fields.category')} data={treeOptions(categories, (c) => localized(c.name))} value={form.categoryKey || null} onChange={(v) => setForm({ ...form, categoryKey: v ?? '' })} required searchable />
          <TextInput label={t('fields.manufacturer')} value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.currentTarget.value })} />
          <TextInput label={t('settings.model')} value={form.model} onChange={(e) => setForm({ ...form, model: e.currentTarget.value })} />
        </SimpleGrid>
        <TextInput label={t('settings.properties')} description={t('settings.propertiesHint')} value={form.properties.join(', ')} onChange={(e) => setForm({ ...form, properties: e.currentTarget.value.split(',').map((x) => x.trim()).filter(Boolean) })} />
        <MultiSelect
          label={t('settings.inspections')}
          description={t('catalog.subtitle')}
          data={catalog.map((x) => ({ value: x.key, label: `${localized(x.name)}${x.intervalMonths ? ` (${x.intervalMonths} M.)` : ''}` }))}
          value={form.inspectionKeys}
          onChange={(inspectionKeys) => setForm({ ...form, inspectionKeys })}
          searchable
          clearable
          hidePickedOptions
        />
      </Stack>
    </ResponsiveDialog>
    {type && (
      <ConfirmDialog
        opened={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t('settings.deleteTypeTitle', { name: localized(type.name) })}
        description={t('settings.deleteTypeText')}
        confirmLabel={common('actions.delete')}
        loading={remove.isPending}
        onConfirm={() => remove.mutate(undefined)}
      />
    )}
    </>
  );
}

/** Adds the DGUV template; hoses as single items (own inspection record per hose) or as stock. */
function TemplateDialog({ onDone, onClose }: { onDone: (r: { categories: number; inspections: number; types: number }) => void; onClose: () => void }) {
  const { t } = useTranslation('equipment');
  const { t: common } = useTranslation('common');
  const [hoseTracking, setHoseTracking] = useState<Tracking>('item');
  const template = useAction(() => send<{ categories: number; inspections: number; types: number }>('POST', 'equipment/templates/dguv', { hoseTracking }), {
    invalidate: [keys.all],
    onSuccess: (r) => {
      onDone(r);
      onClose();
    },
  });
  return (
    <ResponsiveDialog opened onClose={onClose} title={t('settings.template')} actions={<Group justify="flex-end"><Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button><Button loading={template.isPending} onClick={() => template.mutate(undefined)}>{t('settings.templateAdd')}</Button></Group>}>
      <Stack gap="sm">
        <Text size="sm" c="dimmed">{t('settings.templateHint')}</Text>
        <Radio.Group label={t('settings.hoses')} value={hoseTracking} onChange={(v) => setHoseTracking(v as Tracking)}>
          <Stack gap={6} mt={6}>
            <Radio value="item" label={t('settings.hosesItem')} />
            <Radio value="stock" label={t('settings.hosesStock')} />
          </Stack>
        </Radio.Group>
      </Stack>
    </ResponsiveDialog>
  );
}

/** Lead times, "due soon" and bookable places (setting `equipment.settings`). */
function LeadTimes() {
  const { t } = useTranslation('equipment');
  const { t: common } = useTranslation('common');
  const { data } = useEquipmentSettings();
  const [form, setForm] = useState<EquipmentSettings | null>(null);
  const value = form ?? data ?? EquipmentSettings.parse({});
  const save = useAction(() => send('PUT', 'core/settings/equipment.settings', value), { success: t('settings.saved'), invalidate: [['core', 'settings', 'equipment.settings']], onSuccess: () => setForm(null) });
  const setDays = (key: 'inspectionLeadDays' | 'expiryLeadDays' | 'dueSoonDays', v: string | number) => setForm({ ...value, [key]: Number(v) || 0 });
  return (
    <Panel title={t('settings.leadTimes')} aside={<Button size="xs" disabled={!form} loading={save.isPending} onClick={() => save.mutate(undefined)}>{common('actions.save')}</Button>}>
      <Stack gap="md">
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <NumberInput label={t('settings.inspectionLeadDays')} description={t('settings.inspectionLeadDaysHint')} value={value.inspectionLeadDays} onChange={(v) => setDays('inspectionLeadDays', v)} min={0} max={365} />
          <NumberInput label={t('settings.expiryLeadDays')} description={t('settings.expiryLeadDaysHint')} value={value.expiryLeadDays} onChange={(v) => setDays('expiryLeadDays', v)} min={0} max={365} />
          <NumberInput label={t('settings.dueSoonDays')} description={t('settings.dueSoonDaysHint')} value={value.dueSoonDays} onChange={(v) => setDays('dueSoonDays', v)} min={0} max={365} />
        </SimpleGrid>
        <TagsInput
          label={t('settings.locations')}
          description={t('settings.locationsHint')}
          value={value.locations}
          onChange={(locations) => setForm({ ...value, locations })}
          placeholder={t('settings.locationsPlaceholder')}
        />
      </Stack>
    </Panel>
  );
}

function TypeTable({ rows, onRowClick, exportName }: { rows: EquipmentType[]; onRowClick: (type: EquipmentType) => void; exportName: string }) {
  const { t } = useTranslation('equipment');
  const localized = useLocalized();
  return (
    <DataTable<EquipmentType>
      rows={rows}
      rowKey={(x) => x.id}
      onRowClick={onRowClick}
      exportName={exportName}
      columns={[
        { key: 'name', header: t('fields.name'), render: (x) => <><Text size="sm" fw={700}>{localized(x.name)}</Text><Text size="xs" c="dimmed">{x.key}</Text></> },
        { key: 'inspections', header: t('settings.inspections'), render: (x) => x.inspections.map((i) => `${localized(i.name)}${i.intervalMonths ? ` (${i.intervalMonths} M.)` : ''}`).join(' · ') },
      ]}
    />
  );
}

const FORM_LABEL = { none: 'catalog.kindNone', document: 'catalog.kindDocument', fillable: 'catalog.kindFillable', approval: 'catalog.kindApproval' } as const;

/** The shared catalog of inspection types, with the number of equipment types and items that use each one. */
function InspectionCatalogTable({ onEdit }: { onEdit: (entry: InspectionCatalogEntry) => void }) {
  const { t } = useTranslation('equipment');
  const localized = useLocalized();
  const { data: catalog = [] } = useInspectionCatalog();
  return (
    <DataTable<InspectionCatalogEntry>
      rows={catalog}
      rowKey={(x) => x.id}
      onRowClick={onEdit}
      exportName={t('catalog.title')}
      empty={t('catalog.empty')}
      columns={[
        { key: 'name', header: t('fields.name'), render: (x) => <><Text size="sm" fw={700}>{localized(x.name)}</Text><Text size="xs" c="dimmed">{x.key}</Text></> },
        { key: 'interval', header: t('settings.interval'), render: (x) => (x.trigger === 'periodic' && x.intervalMonths ? t('inspection.months', { count: x.intervalMonths }) : '–') },
        { key: 'trigger', header: t('inspection.trigger'), render: (x) => t(`trigger.${x.trigger}`) },
        { key: 'form', header: t('catalog.formShort'), render: (x) => t(FORM_LABEL[x.form.kind]) },
        { key: 'inUse', header: t('catalog.inUse'), align: 'right', render: (x) => (x.inUse ? <StatusBadge tone="primary">{x.inUse}</StatusBadge> : <Text size="sm" c="dimmed">0</Text>) },
      ]}
    />
  );
}

/** Administration: categories, equipment types with inspection types, inspection types (catalog), DGUV template, lead times. */
export function SettingsPage() {
  const { t } = useTranslation('equipment');
  const localized = useLocalized();
  const { data: categories = [] } = useCategories();
  const { data: types = [] } = useTypes();
  const [editCategory, setEditCategory] = useState<Category | 'new' | null>(null);
  const [newParent, setNewParent] = useState<string | null>(null);
  const [editType, setEditType] = useState<EquipmentType | 'new' | null>(null);
  const [editInspection, setEditInspection] = useState<InspectionCatalogEntry | 'new' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [template, setTemplate] = useState(false);
  const { groups, loose } = typeGroups(categories, types, localized);
  return (
    <Stack gap="lg">
      <PageHeader
        breadcrumbs={[{ label: t('module') }, { label: t('settings.title') }]}
        title={t('settings.title')}
        actions={
          <Group gap="sm">
            <Button variant="default" onClick={() => setTemplate(true)}>{t('settings.template')}</Button>
          </Group>
        }
      />
      {notice && <Notice kind="done">{notice}</Notice>}
      <Tabs defaultValue="types">
        <Tabs.List mb="md">
          <Tabs.Tab value="types">{t('settings.types')}</Tabs.Tab>
          <Tabs.Tab value="inspections">{t('catalog.title')}</Tabs.Tab>
          <Tabs.Tab value="categories">{t('settings.categories')}</Tabs.Tab>
          <Tabs.Tab value="lead-times">{t('settings.leadTimes')}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="lead-times"><LeadTimes /></Tabs.Panel>
        <Tabs.Panel value="types">
          <Stack gap="md">
            <Group justify="flex-end">
              <Button size="xs" onClick={() => setEditType('new')}>{t('settings.newType')}</Button>
            </Group>
            {!types.length && <Panel><Text size="sm" c="dimmed">{t('settings.noTypes')}</Text></Panel>}
            {groups.map((group) => (
              <Panel
                key={group.root.id}
                title={localized(group.root.name)}
                aside={group.root.breathingApparatus || group.root.lockWhenOverdue ? <Group gap={4}>{group.root.breathingApparatus && <StatusBadge>{t('settings.breathingShort')}</StatusBadge>}{group.root.lockWhenOverdue && <StatusBadge tone="warning">{t('settings.lockShort')}</StatusBadge>}</Group> : undefined}
              >
                <Stack gap="lg">
                  {group.sections.map((section) => (
                    <Stack key={section.category.id} gap={6}>
                      {section.category.key !== group.root.key && <Text component="h3" size="sm" fw={700} m={0}>{localized(section.category.name)}</Text>}
                      <TypeTable rows={section.types} onRowClick={setEditType} exportName={section.category.key === group.root.key ? localized(group.root.name) : `${localized(group.root.name)} – ${localized(section.category.name)}`} />
                    </Stack>
                  ))}
                </Stack>
              </Panel>
            ))}
            {loose.length > 0 && (
              <Panel title={t('settings.unknownCategory')}>
                <TypeTable rows={loose} onRowClick={setEditType} exportName={t('settings.unknownCategory')} />
              </Panel>
            )}
          </Stack>
        </Tabs.Panel>
        <Tabs.Panel value="inspections">
          <Panel title={t('catalog.title')} aside={<Button size="xs" onClick={() => setEditInspection('new')}>{t('catalog.new')}</Button>}>
            <Stack gap="sm">
              <Text size="sm" c="dimmed">{t('catalog.subtitle')}</Text>
              <InspectionCatalogTable onEdit={setEditInspection} />
            </Stack>
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
                { key: 'breathing', header: '', render: ({ category: x }) => <Group gap={4}>{x.breathingApparatus && <StatusBadge>{t('settings.breathingShort')}</StatusBadge>}{x.lockWhenOverdue && <StatusBadge tone="warning">{t('settings.lockShort')}</StatusBadge>}</Group> },
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
      {template && <TemplateDialog onDone={(r) => setNotice(t('settings.templateDone', r))} onClose={() => setTemplate(false)} />}
      {editType && <TypeDialog type={editType === 'new' ? undefined : editType} onClose={() => setEditType(null)} />}
      {editInspection && <InspectionTypeDialog entry={editInspection === 'new' ? undefined : editInspection} onClose={() => setEditInspection(null)} />}
    </Stack>
  );
}
