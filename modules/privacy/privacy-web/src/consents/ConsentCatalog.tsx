import { Anchor, Button, Group, MultiSelect, Select, SimpleGrid, Stack, Switch, Text, Textarea, TextInput } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { ConsentEffect } from '@forga/core-contracts';
import { type ConsentCatalog as Catalog, type ConsentDefinition, type ConsentDefinitionInput, ConsentGivenBy } from '@forga/privacy-contracts';
import { api, formatDate, send, useLocalized, useTranslation } from '@forga/web-sdk';
import { DataTable, Notice, Panel, ResponsiveDialog, StatusBadge, useAction } from '@forga/web-ui';

export const CONSENT_CATALOG_KEY = ['privacy', 'consents'] as const;

/**
 * "Verwaltung → Datenschutz → Einstellungen → Einwilligungen" (L9): the catalog with effect, who gives the consent,
 * version, number of persons who consented and review state; one entry is edited below the table.
 */
export function ConsentCatalog() {
  const { t, i18n } = useTranslation('privacy');
  const localized = useLocalized();
  const { data } = useQuery({ queryKey: CONSENT_CATALOG_KEY, queryFn: () => api<Catalog>('privacy/consents') });
  const [selected, setSelected] = useState<string | null>(null);
  const templates = useAction(() => send<Catalog>('POST', 'privacy/consents/templates'), { success: t('transparency.consents.templatesInserted'), invalidate: [CONSENT_CATALOG_KEY] });
  if (!data) return null;
  const effectLabel = (key: ConsentEffect) => localized(data.effects.find((e) => e.key === key)?.label ?? { de: key, en: key });
  const unreviewed = data.consents.filter((c) => !c.reviewedAt).length;
  const current = selected === 'new' ? null : (data.consents.find((c) => c.key === selected) ?? null);
  return (
    <Stack gap="lg" maw={1100}>
      {unreviewed > 0 && <Notice kind="warning">{t('transparency.consents.templatesWarning', { count: unreviewed })}</Notice>}
      <DataTable
        rows={data.consents}
        rowKey={(c) => c.key}
        selectedKey={selected}
        onRowClick={(c) => setSelected(c.key)}
        empty={t('transparency.consents.empty')}
        columns={[
          {
            key: 'consent',
            header: t('transparency.consents.columns.consent'),
            render: (c) => (
              <Anchor component="button" type="button" onClick={() => setSelected(c.key)}>
                {localized(c.title)}
              </Anchor>
            ),
          },
          { key: 'effects', header: t('transparency.consents.columns.effects'), render: (c) => (c.effects.length ? c.effects.map(effectLabel).join(', ') : t('transparency.consents.noEffect')) },
          { key: 'givenBy', header: t('transparency.consents.columns.givenBy'), render: (c) => t(`transparency.consents.givenBy.${c.givenBy}`) },
          { key: 'version', header: t('transparency.consents.columns.version'), align: 'right', render: (c) => c.version },
          { key: 'given', header: t('transparency.consents.columns.given'), align: 'right', render: (c) => t('transparency.consents.givenCount', { count: data.given[c.key] ?? 0 }) },
          {
            key: 'state',
            header: t('transparency.consents.columns.state'),
            render: (c) => (
              <Group gap={6}>
                {c.reviewedAt ? <StatusBadge tone="done">{t('transparency.consents.reviewed')}</StatusBadge> : <StatusBadge tone="warning">{t('transparency.consents.template')}</StatusBadge>}
                {!c.active && <StatusBadge tone="neutral">{t('transparency.consents.inactive')}</StatusBadge>}
              </Group>
            ),
          },
        ]}
      />
      <Group justify="space-between">
        <Text size="xs" c="dimmed" maw={640}>{t('transparency.consents.versionHint')}</Text>
        <Group>
          <Button variant="default" loading={templates.isPending} onClick={() => templates.mutate(undefined)}>{t('transparency.consents.templates')}</Button>
          <Button variant="default" onClick={() => setSelected('new')}>{t('transparency.consents.create')}</Button>
        </Group>
      </Group>
      {selected && (
        <ConsentEditor
          key={`${selected}:${current?.version ?? 0}:${current?.reviewedAt ?? ''}`}
          definition={current}
          given={current ? (data.given[current.key] ?? 0) : 0}
          effects={data.effects.map((e) => ({ value: e.key, label: localized(e.label) }))}
          onSaved={setSelected}
          onRemoved={() => setSelected(null)}
          language={i18n.language}
        />
      )}
    </Stack>
  );
}

const EMPTY: Required<Omit<ConsentDefinitionInput, 'version'>> = {
  title: { de: '', en: '' },
  text: { de: '', en: '' },
  purpose: { de: '', en: '' },
  givenBy: 'person',
  effects: [],
  active: true,
};

function ConsentEditor({
  definition,
  given,
  effects,
  onSaved,
  onRemoved,
  language,
}: {
  definition: ConsentDefinition | null;
  given: number;
  effects: { value: string; label: string }[];
  onSaved: (key: string) => void;
  onRemoved: () => void;
  language: string;
}) {
  const { t } = useTranslation('privacy');
  const { t: common } = useTranslation('common');
  const localized = useLocalized();
  const initial = definition ? { title: definition.title, text: definition.text, purpose: definition.purpose, givenBy: definition.givenBy, effects: definition.effects, active: definition.active } : EMPTY;
  const [value, setValue] = useState(initial);
  const [key, setKey] = useState(definition?.key ?? '');
  const [reviewing, setReviewing] = useState(false);
  const invalidate = [CONSENT_CATALOG_KEY, ['privacy', 'me', 'consents']] as const;
  const save = useAction(() => send<Catalog>('PUT', `privacy/consents/${encodeURIComponent(key)}`, { ...value, ...(definition ? { version: definition.version } : {}) }), {
    success: t('transparency.consents.saved'),
    invalidate,
    onSuccess: () => onSaved(key),
  });
  const review = useAction(() => send('POST', `privacy/consents/${definition!.key}/review`, { version: definition!.version }), { success: t('transparency.consents.saved'), invalidate, onSuccess: () => setReviewing(false) });
  const remove = useAction(() => send('DELETE', `privacy/consents/${definition!.key}`), { success: t('transparency.consents.removed'), invalidate, onSuccess: onRemoved });
  const dirty = JSON.stringify(value) !== JSON.stringify(initial);
  const complete = Boolean(key && value.title.de.trim() && value.title.en.trim() && value.text.de.trim() && value.text.en.trim());
  const pair = (field: 'title' | 'text' | 'purpose', lang: 'de' | 'en', v: string) => setValue((c) => ({ ...c, [field]: { ...c[field], [lang]: v } }));
  const title = definition ? t('transparency.consents.editTitle', { title: localized(definition.title) }) : t('transparency.consents.newTitle');
  return (
    <Panel
      title={title}
      aside={definition && (definition.reviewedAt ? <StatusBadge tone="done">{t('transparency.consents.reviewed')}</StatusBadge> : <StatusBadge tone="warning">{t('transparency.consents.template')}</StatusBadge>)}
    >
      <Stack gap="md">
        {!definition && <TextInput label={t('transparency.consents.key')} description={t('transparency.consents.keyHint')} required value={key} onChange={(e) => setKey(e.currentTarget.value.trim())} />}
        <SimpleGrid cols={{ base: 1, md: 2 }}>
          <TextInput label={`${t('transparency.consents.title')} (${t('transparency.consents.german')})`} required value={value.title.de} onChange={(e) => pair('title', 'de', e.currentTarget.value)} />
          <TextInput label={`${t('transparency.consents.title')} (${t('transparency.consents.english')})`} required value={value.title.en} onChange={(e) => pair('title', 'en', e.currentTarget.value)} />
          <Textarea label={`${t('transparency.consents.text')} (${t('transparency.consents.german')})`} required autosize minRows={4} value={value.text.de} onChange={(e) => pair('text', 'de', e.currentTarget.value)} />
          <Textarea label={`${t('transparency.consents.text')} (${t('transparency.consents.english')})`} required autosize minRows={4} value={value.text.en} onChange={(e) => pair('text', 'en', e.currentTarget.value)} />
          <TextInput label={`${t('transparency.consents.purpose')} (${t('transparency.consents.german')})`} value={value.purpose.de} onChange={(e) => pair('purpose', 'de', e.currentTarget.value)} />
          <TextInput label={`${t('transparency.consents.purpose')} (${t('transparency.consents.english')})`} value={value.purpose.en} onChange={(e) => pair('purpose', 'en', e.currentTarget.value)} />
          <Select
            label={t('transparency.consents.columns.givenBy')}
            allowDeselect={false}
            data={ConsentGivenBy.options.map((g) => ({ value: g, label: t(`transparency.consents.givenBy.${g}`) }))}
            value={value.givenBy}
            onChange={(g) => g && setValue((c) => ({ ...c, givenBy: g as typeof c.givenBy }))}
          />
          <MultiSelect
            label={t('transparency.consents.effects')}
            description={t('transparency.consents.effectsHint')}
            data={effects}
            value={value.effects}
            onChange={(e) => setValue((c) => ({ ...c, effects: e as ConsentEffect[] }))}
            placeholder={value.effects.length ? undefined : t('transparency.consents.noEffect')}
          />
        </SimpleGrid>
        <Switch label={t('transparency.consents.active')} checked={value.active} onChange={(e) => setValue((c) => ({ ...c, active: e.currentTarget.checked }))} />
        {definition?.changedAt && <Text size="xs" c="dimmed">{t('transparency.consents.changed', { version: definition.version, date: formatDate(definition.changedAt, language), name: definition.changedBy ?? '' })}</Text>}
        <Group justify="flex-end">
          {definition && given === 0 && <Button variant="subtle" loading={remove.isPending} onClick={() => remove.mutate(undefined)}>{t('transparency.consents.remove')}</Button>}
          {definition && <Button variant="default" disabled={dirty || Boolean(definition.reviewedAt)} onClick={() => setReviewing(true)}>{t('transparency.consents.markReviewed')}</Button>}
          <Button disabled={!dirty || !complete} loading={save.isPending} onClick={() => save.mutate(undefined)}>{common('actions.save')}</Button>
        </Group>
      </Stack>
      {reviewing && definition && (
        <ResponsiveDialog
          opened
          onClose={() => setReviewing(false)}
          title={t('transparency.consents.reviewTitle')}
          actions={
            <>
              <Button variant="default" onClick={() => setReviewing(false)}>{common('actions.cancel')}</Button>
              <Button loading={review.isPending} onClick={() => review.mutate(undefined)}>{t('transparency.consents.reviewSubmit')}</Button>
            </>
          }
        >
          <Text size="sm">{t('transparency.consents.reviewText', { title: localized(definition.title), version: definition.version })}</Text>
        </ResponsiveDialog>
      )}
    </Panel>
  );
}
