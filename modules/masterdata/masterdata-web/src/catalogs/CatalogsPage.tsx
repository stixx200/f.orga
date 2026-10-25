import { Button, Group, MultiSelect, NumberInput, Select, SimpleGrid, Stack, Switch, Tabs, Text, TextInput } from '@mantine/core';
import { useState } from 'react';
import { type CatalogEntry, CatalogKind, type Course, type CourseInput, type PersonStatus, VEHICLE_STATISTICS_CATEGORIES } from '@forga/masterdata-contracts';
import { send, useLocalized, useTranslation } from '@forga/web-sdk';
import { DataTable, PageHeader, ResponsiveDialog, StatusBadge, useAction } from '@forga/web-ui';
import { useCatalog, useDepartments } from '../api';
import { useCourses } from '../persons/CoursesTab';

type Editing = { kind: CatalogKind; entry?: CatalogEntry } | { kind: 'course'; course?: Course } | null;

const ATTRIBUTE_FIELDS: Record<CatalogKind, { key: string; type: 'text' | 'number' | 'category' }[]> = {
  function: [{ key: 'abbreviation', type: 'text' }],
  qualification: [{ key: 'validityMonths', type: 'number' }],
  'vehicle-type': [{ key: 'crew', type: 'text' }, { key: 'seats', type: 'number' }, { key: 'statisticsCategory', type: 'category' }],
  honor: [],
  'exit-reason': [],
  office: [],
  rank: [{ key: 'abbreviation', type: 'text' }, { key: 'level', type: 'number' }],
};

function EntryDialog({ kind, entry, onClose }: { kind: CatalogKind; entry?: CatalogEntry; onClose: () => void }) {
  const { t } = useTranslation('masterdata');
  const { t: common } = useTranslation('common');
  const localized = useLocalized();
  const [form, setForm] = useState(() => ({
    key: entry?.key ?? '',
    de: entry?.name.de ?? '',
    en: entry?.name.en ?? '',
    sortOrder: entry?.sortOrder ?? 0,
    active: entry?.active ?? true,
    attributes: { ...entry?.attributes } as Record<string, unknown>,
  }));
  const save = useAction(
    () => {
      const body = { kind, key: form.key, name: { de: form.de, en: form.en || form.de }, sortOrder: form.sortOrder, active: form.active, attributes: form.attributes };
      return entry ? send('PUT', `masterdata/catalog/${entry.id}`, body) : send('POST', 'masterdata/catalog', body);
    },
    { success: t('catalogs.saved'), invalidate: [['masterdata', 'catalog', kind]], onSuccess: onClose },
  );
  const attribute = (key: string, value: unknown) => setForm((f) => ({ ...f, attributes: { ...f.attributes, [key]: value } }));
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={entry ? t('catalogs.edit') : t('catalogs.new')}
      actions={
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button loading={save.isPending} disabled={!form.key || !form.de} onClick={() => save.mutate(undefined)}>{common('actions.save')}</Button>
        </Group>
      }
    >
      <Stack gap="sm">
        <TextInput label={t('catalogs.key')} description={t('catalogs.keyHint')} value={form.key} onChange={(e) => setForm({ ...form, key: e.currentTarget.value })} disabled={Boolean(entry)} required />
        <SimpleGrid cols={2}>
          <TextInput label={t('catalogs.nameDe')} value={form.de} onChange={(e) => setForm({ ...form, de: e.currentTarget.value })} required />
          <TextInput label={t('catalogs.nameEn')} value={form.en} onChange={(e) => setForm({ ...form, en: e.currentTarget.value })} />
        </SimpleGrid>
        <SimpleGrid cols={2}>
          {ATTRIBUTE_FIELDS[kind].map((f) =>
            f.type === 'number' ? (
              <NumberInput key={f.key} label={t(`catalogs.attributes.${f.key}`)} value={(form.attributes[f.key] as number | null) ?? ''} onChange={(v) => attribute(f.key, v === '' ? null : Number(v))} min={0} />
            ) : f.type === 'category' ? (
              <Select
                key={f.key}
                label={t(`catalogs.attributes.${f.key}`)}
                data={VEHICLE_STATISTICS_CATEGORIES.map((c) => ({ value: c.id, label: `${c.id} · ${localized(c.name)}` }))}
                value={(form.attributes[f.key] as string | null) ?? null}
                onChange={(v) => attribute(f.key, v)}
                searchable
                clearable
              />
            ) : (
              <TextInput key={f.key} label={t(`catalogs.attributes.${f.key}`)} value={(form.attributes[f.key] as string) ?? ''} onChange={(e) => attribute(f.key, e.currentTarget.value)} />
            ),
          )}
          <NumberInput label={t('catalogs.sortOrder')} value={form.sortOrder} onChange={(v) => setForm({ ...form, sortOrder: Number(v) || 0 })} />
        </SimpleGrid>
        <Switch label={t('catalogs.active')} description={t('catalogs.activeHint')} checked={form.active} onChange={(e) => setForm({ ...form, active: e.currentTarget.checked })} />
      </Stack>
    </ResponsiveDialog>
  );
}

function CourseDialog({ course, onClose }: { course?: Course; onClose: () => void }) {
  const { t } = useTranslation('masterdata');
  const { t: common } = useTranslation('common');
  const localized = useLocalized();
  const { data: qualifications = [] } = useCatalog('qualification');
  const { data: courses = [] } = useCourses();
  const { data: departments = [] } = useDepartments();
  const [form, setForm] = useState<Required<CourseInput>>(() => ({
    key: course?.key ?? '',
    name: course?.name ?? { de: '', en: '' },
    level: course?.level ?? 'district',
    grantsQualifications: course?.grantsQualifications ?? [],
    prerequisites: course?.prerequisites ?? [],
    requiredQualifications: course?.requiredQualifications ?? [],
    minimumAge: course?.minimumAge ?? null,
    allowedStatuses: (course?.allowedStatuses.filter((s) => s !== 'left') as Exclude<PersonStatus, 'left'>[] | undefined) ?? ['probation', 'active'],
    targets: course?.targets ?? {},
    active: course?.active ?? true,
    sortOrder: course?.sortOrder ?? 0,
  }));
  const save = useAction(
    () => {
      const body = { ...form, name: { de: form.name.de, en: form.name.en || form.name.de } };
      return course ? send('PUT', `masterdata/courses/${course.id}`, body) : send('POST', 'masterdata/courses', body);
    },
    { success: t('catalogs.saved'), invalidate: [['masterdata', 'courses']], onSuccess: onClose },
  );
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={course ? t('catalogs.editCourse') : t('catalogs.newCourse')}
      size="lg"
      actions={
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button loading={save.isPending} disabled={!form.key || !form.name.de} onClick={() => save.mutate(undefined)}>{common('actions.save')}</Button>
        </Group>
      }
    >
      <Stack gap="sm">
        <SimpleGrid cols={2}>
          <TextInput label={t('catalogs.key')} description={t('catalogs.keyHint')} value={form.key} onChange={(e) => setForm({ ...form, key: e.currentTarget.value })} disabled={Boolean(course)} required />
          <Select label={t('courses.level')} data={(['municipal', 'district', 'state-school'] as const).map((l) => ({ value: l, label: t(`courseLevel.${l}`) }))} value={form.level} onChange={(v) => v && setForm({ ...form, level: v as Course['level'] })} allowDeselect={false} />
          <TextInput label={t('catalogs.nameDe')} value={form.name.de} onChange={(e) => setForm({ ...form, name: { ...form.name, de: e.currentTarget.value } })} required />
          <TextInput label={t('catalogs.nameEn')} value={form.name.en} onChange={(e) => setForm({ ...form, name: { ...form.name, en: e.currentTarget.value } })} />
        </SimpleGrid>
        <MultiSelect label={t('catalogs.grants')} data={qualifications.map((q) => ({ value: q.key, label: localized(q.name) }))} value={form.grantsQualifications} onChange={(v) => setForm({ ...form, grantsQualifications: v })} searchable />
        <MultiSelect label={t('catalogs.prerequisites')} data={courses.filter((c) => c.key !== form.key).map((c) => ({ value: c.key, label: localized(c.name) }))} value={form.prerequisites} onChange={(v) => setForm({ ...form, prerequisites: v })} searchable />
        <MultiSelect label={t('catalogs.requiredQualifications')} description={t('catalogs.requiredQualificationsHint')} data={qualifications.map((q) => ({ value: q.key, label: localized(q.name) }))} value={form.requiredQualifications} onChange={(v) => setForm({ ...form, requiredQualifications: v })} searchable />
        <SimpleGrid cols={2}>
          <MultiSelect
            label={t('catalogs.allowedStatuses')}
            description={t('catalogs.allowedStatusesHint')}
            data={(['probation', 'active', 'youth', 'passive', 'veterans'] as const).map((v) => ({ value: v, label: t(`status.${v}`) }))}
            value={form.allowedStatuses}
            onChange={(v) => v.length && setForm({ ...form, allowedStatuses: v as Exclude<PersonStatus, 'left'>[] })}
          />
          <NumberInput label={t('catalogs.minimumAge')} description={t('catalogs.minimumAgeHint')} value={form.minimumAge ?? ''} onChange={(v) => setForm({ ...form, minimumAge: v === '' ? null : Number(v) })} min={0} max={99} />
        </SimpleGrid>
        <Text size="sm" fw={700}>{t('catalogs.targets')}</Text>
        <Text size="xs" c="dimmed">{t('catalogs.targetsHint')}</Text>
        <SimpleGrid cols={{ base: 2, sm: 3 }}>
          {departments.map((d) => (
            <NumberInput
              key={d.id}
              label={d.name}
              value={form.targets[d.id] ?? ''}
              onChange={(v) => {
                const { [d.id]: _old, ...rest } = form.targets;
                setForm({ ...form, targets: v === '' ? rest : { ...rest, [d.id]: Number(v) } });
              }}
              min={0}
              max={999}
            />
          ))}
        </SimpleGrid>
        <Group grow>
          <NumberInput label={t('catalogs.sortOrder')} value={form.sortOrder} onChange={(v) => setForm({ ...form, sortOrder: Number(v) || 0 })} />
          <Switch label={t('catalogs.active')} checked={form.active} onChange={(e) => setForm({ ...form, active: e.currentTarget.checked })} mt="lg" />
        </Group>
      </Stack>
    </ResponsiveDialog>
  );
}

function CatalogTable({ kind, onEdit }: { kind: CatalogKind; onEdit: (entry?: CatalogEntry) => void }) {
  const { t } = useTranslation('masterdata');
  const { data = [] } = useCatalog(kind);
  return (
    <Stack gap="sm">
      <Group justify="flex-end"><Button size="xs" variant="outline" onClick={() => onEdit()}>{t('catalogs.add')}</Button></Group>
      <DataTable<CatalogEntry>
        rows={data}
        rowKey={(e) => e.id}
        onRowClick={(e) => onEdit(e)}
        highlight={(e) => !e.active}
        columns={[
          { key: 'name', header: t('catalogs.name'), render: (e) => <Text fw={700} size="sm">{e.name.de}</Text> },
          { key: 'en', header: t('catalogs.nameEn'), render: (e) => e.name.en },
          { key: 'key', header: t('catalogs.key'), render: (e) => <code>{e.key}</code> },
          ...ATTRIBUTE_FIELDS[kind].map((f) => ({ key: f.key, header: t(`catalogs.attributes.${f.key}`), render: (e: CatalogEntry) => String(e.attributes[f.key] ?? '') })),
          { key: 'active', header: t('catalogs.status'), render: (e) => <StatusBadge tone={e.active ? 'done' : 'neutral'}>{t(e.active ? 'catalogs.activeBadge' : 'catalogs.inactiveBadge')}</StatusBadge> },
        ]}
      />
    </Stack>
  );
}

/** Catalogs of the master data (functions, qualifications, vehicle types, honours, exit reasons, ranks) and courses. */
export function CatalogsPage() {
  const { t } = useTranslation('masterdata');
  const localized = useLocalized();
  const { data: courses = [] } = useCourses();
  const [editing, setEditing] = useState<Editing>(null);
  const template = useAction(
    async () => {
      await send('POST', 'masterdata/catalog/templates/bw');
      await send('POST', 'masterdata/courses/templates/bw');
    },
    { success: t('catalogs.templateApplied'), invalidate: [['masterdata', 'catalog'], ['masterdata', 'courses']] },
  );
  return (
    <Stack gap="lg">
      <PageHeader
        breadcrumbs={[{ label: t('module') }, { label: t('catalogs.title') }]}
        title={t('catalogs.title')}
        subtitle={t('catalogs.subtitle')}
        actions={<Button variant="default" loading={template.isPending} onClick={() => template.mutate(undefined)}>{t('catalogs.applyTemplate')}</Button>}
      />
      <Tabs defaultValue="qualification" keepMounted={false}>
        <Tabs.List mb="lg">
          {CatalogKind.options.map((k) => <Tabs.Tab key={k} value={k}>{t(`catalogs.kinds.${k}`)}</Tabs.Tab>)}
          <Tabs.Tab value="course">{t('catalogs.kinds.course')}</Tabs.Tab>
        </Tabs.List>
        {CatalogKind.options.map((k) => (
          <Tabs.Panel key={k} value={k}><CatalogTable kind={k} onEdit={(entry) => setEditing({ kind: k, entry })} /></Tabs.Panel>
        ))}
        <Tabs.Panel value="course">
          <Stack gap="sm">
            <Group justify="flex-end"><Button size="xs" variant="outline" onClick={() => setEditing({ kind: 'course' })}>{t('catalogs.addCourse')}</Button></Group>
            <DataTable<Course>
              rows={courses}
              rowKey={(c) => c.id}
              onRowClick={(c) => setEditing({ kind: 'course', course: c })}
              highlight={(c) => !c.active}
              columns={[
                { key: 'name', header: t('catalogs.name'), render: (c) => <Text fw={700} size="sm">{localized(c.name)}</Text> },
                { key: 'level', header: t('courses.level'), render: (c) => t(`courseLevel.${c.level}`) },
                { key: 'grants', header: t('catalogs.grants'), render: (c) => c.grantsQualifications.join(', ') },
                { key: 'prerequisites', header: t('catalogs.prerequisites'), render: (c) => c.prerequisites.join(', ') },
                { key: 'active', header: t('catalogs.status'), render: (c) => <StatusBadge tone={c.active ? 'done' : 'neutral'}>{t(c.active ? 'catalogs.activeBadge' : 'catalogs.inactiveBadge')}</StatusBadge> },
              ]}
            />
          </Stack>
        </Tabs.Panel>
      </Tabs>
      {editing && editing.kind !== 'course' && <EntryDialog kind={editing.kind} entry={editing.entry} onClose={() => setEditing(null)} />}
      {editing?.kind === 'course' && <CourseDialog course={editing.course} onClose={() => setEditing(null)} />}
    </Stack>
  );
}
