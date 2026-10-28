import { ActionIcon, Button, Checkbox, Group, NumberInput, Select, SimpleGrid, Stack, Switch, Tabs, Text, Textarea, TextInput } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import type { SessionType, SessionTypeInput, TrainingSettings } from '@forga/training-contracts';
import { apiUrl, send, useLocalized, useTranslation } from '@forga/web-sdk';
import { AliasesInput, DataTable, PageHeader, Panel, ResponsiveDialog, StatusBadge, useAction } from '@forga/web-ui';
import { keys, useDepartments, useTrainingSettings, useTypes } from '../api';

const SETTINGS_KEY = ['core', 'settings', 'training.general'];
const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');

function TypeDialog({ type, onClose }: { type?: SessionType; onClose: () => void }) {
  const { t } = useTranslation('training');
  const { t: common } = useTranslation('common');
  const [form, setForm] = useState<Required<SessionTypeInput>>(() => ({
    key: type?.key ?? '',
    name: type?.name ?? { de: '', en: '' },
    category: type?.category ?? 'training',
    countsForParticipation: type?.countsForParticipation ?? true,
    compensation: type?.compensation ?? 'training',
    record: type?.record ?? null,
    active: type?.active ?? true,
    sortOrder: type?.sortOrder ?? 0,
    aliases: type?.aliases ?? [],
  }));
  const save = useAction(
    () => {
      const body = { ...form, name: { de: form.name.de, en: form.name.en || form.name.de } };
      return type ? send('PUT', `training/types/${type.id}`, body) : send('POST', 'training/types', body);
    },
    { success: t('settingsPage.saved'), invalidate: [keys.types], onSuccess: onClose },
  );
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={type ? t('settingsPage.editType') : t('settingsPage.newType')}
      size="lg"
      actions={
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button loading={save.isPending} disabled={!form.key || !form.name.de} onClick={() => save.mutate(undefined)}>{common('actions.save')}</Button>
        </Group>
      }
    >
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <TextInput label={t('settingsPage.key')} value={form.key} onChange={(e) => setForm({ ...form, key: e.currentTarget.value })} disabled={Boolean(type)} required />
        <NumberInput label={t('settingsPage.sortOrder')} value={form.sortOrder} onChange={(v) => setForm({ ...form, sortOrder: Number(v) || 0 })} />
        <TextInput label={t('settingsPage.nameDe')} value={form.name.de} onChange={(e) => setForm({ ...form, name: { ...form.name, de: e.currentTarget.value } })} required />
        <TextInput label={t('settingsPage.nameEn')} value={form.name.en} onChange={(e) => setForm({ ...form, name: { ...form.name, en: e.currentTarget.value } })} />
        <Select
          label={t('settingsPage.category')}
          description={t('settingsPage.categoryHint')}
          data={(['training', 'special-service', 'other'] as const).map((c) => ({ value: c, label: t(`category.${c}`) }))}
          value={form.category}
          onChange={(v) => v && setForm({ ...form, category: v as SessionType['category'] })}
          allowDeselect={false}
        />
        <Select
          label={t('settingsPage.compensation')}
          data={(['training', 'special-service', 'fire-watch', 'none'] as const).map((c) => ({ value: c, label: t(`compensation.${c}`) }))}
          value={form.compensation}
          onChange={(v) => v && setForm({ ...form, compensation: v as SessionType['compensation'] })}
          allowDeselect={false}
        />
        <Select
          label={t('settingsPage.record')}
          description={t('settingsPage.recordHint')}
          data={(['stress-exercise', 'training-track', 'briefing', 'exercise-under-ba', 'chemical-suit-exercise'] as const).map((r) => ({ value: r, label: t(`record.${r}`) }))}
          value={form.record}
          onChange={(v) => setForm({ ...form, record: v as SessionType['record'] })}
          clearable
        />
        <Checkbox label={t('settingsPage.countsForParticipation')} checked={form.countsForParticipation} onChange={(e) => setForm({ ...form, countsForParticipation: e.currentTarget.checked })} />
        <Switch label={t('settingsPage.active')} checked={form.active} onChange={(e) => setForm({ ...form, active: e.currentTarget.checked })} />
      </SimpleGrid>
      <AliasesInput value={form.aliases} onChange={(aliases) => setForm({ ...form, aliases })} mt="md" />
    </ResponsiveDialog>
  );
}

function TypesTab() {
  const { t } = useTranslation('training');
  const localized = useLocalized();
  const { data: types = [] } = useTypes();
  const [editing, setEditing] = useState<SessionType | 'new' | null>(null);
  const template = useAction(() => send<{ added: number }>('POST', 'training/types/templates/bw'), { invalidate: [keys.types] });
  return (
    <Stack gap="md">
      <Group justify="flex-end">
        <Button variant="default" loading={template.isPending} onClick={() => template.mutate(undefined)}>{t('settingsPage.template')}</Button>
        <Button onClick={() => setEditing('new')}>{t('settingsPage.newType')}</Button>
      </Group>
      <DataTable<SessionType>
        rows={types}
        rowKey={(x) => x.id}
        onRowClick={setEditing}
        empty={t('settingsPage.noTypes')}
        columns={[
          { key: 'name', header: t('settingsPage.name'), render: (x) => <><Text fw={700} size="sm">{localized(x.name)}</Text><Text size="xs" c="dimmed">{x.key}</Text></> },
          { key: 'category', header: t('settingsPage.category'), render: (x) => t(`category.${x.category}`) },
          { key: 'compensation', header: t('settingsPage.compensation'), render: (x) => t(`compensation.${x.compensation}`) },
          { key: 'record', header: t('settingsPage.record'), render: (x) => (x.record ? t(`record.${x.record}`) : '–') },
          { key: 'counts', header: t('settingsPage.counts'), render: (x) => (x.countsForParticipation ? '✓' : '–') },
          { key: 'active', header: t('settingsPage.active'), render: (x) => <StatusBadge tone={x.active ? 'done' : 'neutral'}>{x.active ? t('settingsPage.yes') : t('settingsPage.no')}</StatusBadge> },
        ]}
      />
      {editing && <TypeDialog type={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </Stack>
  );
}

function GeneralForm({ value }: { value: TrainingSettings }) {
  const { t } = useTranslation('training');
  const { t: common } = useTranslation('common');
  const { data: departments = [] } = useDepartments();
  const [form, setForm] = useState(value);
  const save = useAction((v: TrainingSettings) => send('PUT', 'core/settings/training.general', v), { success: t('settingsPage.saved'), invalidate: [SETTINGS_KEY] });
  const feed = (departmentId?: string) => `${window.location.origin}${apiUrl(`training/feed/${form.feedToken}.ics`)}${departmentId ? `?departmentId=${departmentId}` : ''}`;
  return (
    <Stack gap="md">
      <Panel title={t('settingsPage.checkIn')}>
        <NumberInput label={t('settingsPage.checkInBefore')} value={form.checkInBeforeMinutes} onChange={(v) => setForm({ ...form, checkInBeforeMinutes: Number(v) || 0 })} min={0} max={240} w={260} />
      </Panel>
      <Panel title={t('settingsPage.snippets')}>
        <Stack gap="sm">
          <Text size="sm" c="dimmed">{t('settingsPage.snippetsHint')}</Text>
          {form.snippets.map((snippet, index) => (
            <Group key={index} align="start" wrap="nowrap">
              <TextInput label={t('settingsPage.snippetTitle')} value={snippet.title} onChange={(e) => setForm({ ...form, snippets: form.snippets.map((x, i) => (i === index ? { ...x, title: e.currentTarget.value } : x)) })} w={220} />
              <Textarea label={t('settingsPage.snippetText')} value={snippet.text} onChange={(e) => setForm({ ...form, snippets: form.snippets.map((x, i) => (i === index ? { ...x, text: e.currentTarget.value } : x)) })} autosize minRows={2} style={{ flex: 1 }} />
              <ActionIcon mt={28} variant="subtle" color="red" aria-label={t('settingsPage.snippetRemove')} onClick={() => setForm({ ...form, snippets: form.snippets.filter((_, i) => i !== index) })}><IconTrash size={16} /></ActionIcon>
            </Group>
          ))}
          <Group><Button variant="default" onClick={() => setForm({ ...form, snippets: [...form.snippets, { title: '', text: '' }] })}>{t('settingsPage.snippetAdd')}</Button></Group>
        </Stack>
      </Panel>
      <Panel title={t('settingsPage.feed')}>
        <Stack gap="sm">
          <Text size="sm" c="dimmed">{t('settingsPage.feedHint')}</Text>
          <Group>
            <Button variant="default" onClick={() => setForm({ ...form, feedToken: newToken() })}>{form.feedToken ? t('settingsPage.feedRenew') : t('settingsPage.feedEnable')}</Button>
            {form.feedToken && <Button variant="default" color="red" onClick={() => setForm({ ...form, feedToken: '' })}>{t('settingsPage.feedDisable')}</Button>}
          </Group>
          {form.feedToken && (
            <Stack gap={4}>
              <Text size="sm" fw={700}>{t('settingsPage.feedAll')}</Text>
              <Text size="xs" ff="monospace" style={{ wordBreak: 'break-all' }}>{feed()}</Text>
              {departments.map((d) => (
                <div key={d.id}>
                  <Text size="sm" fw={700} mt={4}>{d.name}</Text>
                  <Text size="xs" ff="monospace" style={{ wordBreak: 'break-all' }}>{feed(d.id)}</Text>
                </div>
              ))}
            </Stack>
          )}
        </Stack>
      </Panel>
      <Group justify="flex-end"><Button loading={save.isPending} onClick={() => save.mutate(form)}>{common('actions.save')}</Button></Group>
    </Stack>
  );
}

/** Administration: session types (with BW template) and general settings (QR check-in, calendar feed). */
export function SettingsPage() {
  const { t } = useTranslation('training');
  const { data: settings } = useTrainingSettings();
  return (
    <Stack gap="lg">
      <PageHeader breadcrumbs={[{ label: t('module') }, { label: t('settingsPage.title') }]} title={t('settingsPage.title')} />
      <Tabs defaultValue="types">
        <Tabs.List mb="md">
          <Tabs.Tab value="types">{t('settingsPage.types')}</Tabs.Tab>
          <Tabs.Tab value="general">{t('settingsPage.general')}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="types"><TypesTab /></Tabs.Panel>
        <Tabs.Panel value="general">{settings !== undefined && <GeneralForm value={{ checkInBeforeMinutes: 30, feedToken: '', snippets: [], ...settings }} />}</Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
