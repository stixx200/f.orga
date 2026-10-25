import { Button, Checkbox, Group, NumberInput, Select, SimpleGrid, Stack, Switch, TagsInput, Text, TextInput } from '@mantine/core';
import { useState } from 'react';
import type { Article, ArticleInput } from '@forga/clothing-contracts';
import { send, useLocalized, useTranslation } from '@forga/web-sdk';
import { DataTable, PageHeader, ResponsiveDialog, StatusBadge, useAction } from '@forga/web-ui';
import { keys, useArticles } from '../api';

type Form = Required<ArticleInput>;
const empty: Form = { key: '', name: { de: '', en: '' }, kind: 'inventory', sizes: [], textile: false, impregnationMonths: null, inspectionMonths: null, active: true, sortOrder: 0 };

function ArticleDialog({ article, onClose }: { article?: Article; onClose: () => void }) {
  const { t } = useTranslation('clothing');
  const { t: common } = useTranslation('common');
  const [form, setForm] = useState<Form>(() => (article ? { ...empty, ...article } : empty));
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const inventory = form.kind === 'inventory';
  const save = useAction(() => (article ? send('PUT', `clothing/articles/${article.id}`, form) : send('POST', 'clothing/articles', form)), {
    success: t('articles.saved'),
    invalidate: [keys.all],
    onSuccess: onClose,
  });
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={article ? t('articles.edit') : t('articles.add')}
      size="lg"
      actions={
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button loading={save.isPending} disabled={!/^[a-z0-9][a-z0-9-]*$/.test(form.key) || !form.name.de.trim()} onClick={() => save.mutate(undefined)}>{common('actions.save')}</Button>
        </Group>
      }
    >
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <TextInput label={t('articles.nameDe')} value={form.name.de} onChange={(e) => set('name', { ...form.name, de: e.currentTarget.value })} required />
        <TextInput label={t('articles.nameEn')} value={form.name.en} onChange={(e) => set('name', { ...form.name, en: e.currentTarget.value })} />
        <TextInput label={t('articles.key')} description={t('articles.keyHint')} value={form.key} onChange={(e) => set('key', e.currentTarget.value)} disabled={Boolean(article)} required />
        <Select
          label={t('articles.kind')}
          description={t(`articles.kindHints.${form.kind}`)}
          data={(['inventory', 'consumable'] as const).map((k) => ({ value: k, label: t(`articles.kinds.${k}`) }))}
          value={form.kind}
          onChange={(v) => v && set('kind', v as Form['kind'])}
          allowDeselect={false}
        />
        <TagsInput label={t('articles.sizes')} description={t('articles.sizesHint')} value={form.sizes} onChange={(v) => set('sizes', v)} />
        <NumberInput label={t('articles.sortOrder')} value={form.sortOrder} onChange={(v) => set('sortOrder', Number(v) || 0)} />
        {inventory && (
          <>
            <Checkbox label={t('articles.textile')} description={t('articles.textileHint')} checked={form.textile} onChange={(e) => set('textile', e.currentTarget.checked)} mt="md" />
            <NumberInput
              label={t('articles.impregnationMonths')}
              description={t('articles.emptyNone')}
              value={form.impregnationMonths ?? ''}
              onChange={(v) => set('impregnationMonths', v === '' ? null : Number(v))}
              min={1}
              max={120}
              disabled={!form.textile}
            />
            <NumberInput label={t('articles.inspectionMonths')} description={t('articles.emptyNone')} value={form.inspectionMonths ?? ''} onChange={(v) => set('inspectionMonths', v === '' ? null : Number(v))} min={1} max={120} />
          </>
        )}
        <Switch label={t('articles.active')} checked={form.active} onChange={(e) => set('active', e.currentTarget.checked)} mt="md" />
      </SimpleGrid>
    </ResponsiveDialog>
  );
}

/** Administration: articles of the clothing store, with an optional template. */
export function ArticlesPage() {
  const { t } = useTranslation('clothing');
  const localized = useLocalized();
  const { data: articles = [], isLoading } = useArticles();
  const [editing, setEditing] = useState<Article | 'new' | null>(null);
  const template = useAction(() => send<{ added: number }>('POST', 'clothing/articles/template'), { invalidate: [keys.all], success: t('articles.templateApplied') });
  return (
    <Stack gap="lg">
      <PageHeader
        breadcrumbs={[{ label: t('module') }, { label: t('articles.title') }]}
        title={t('articles.title')}
        subtitle={t('articles.subtitle')}
        actions={
          <Group>
            <Button variant="default" loading={template.isPending} onClick={() => template.mutate(undefined)}>{t('articles.template')}</Button>
            <Button onClick={() => setEditing('new')}>{t('articles.add')}</Button>
          </Group>
        }
      />
      <DataTable<Article>
        rows={articles}
        rowKey={(a) => a.id}
        onRowClick={(a) => setEditing(a)}
        empty={isLoading ? t('loading') : t('articles.empty')}
        columns={[
          { key: 'name', header: t('items.article'), render: (a) => <Text fw={700} size="sm" c={a.active ? 'brand' : 'dimmed'}>{localized(a.name)}</Text> },
          { key: 'kind', header: t('articles.kind'), render: (a) => <StatusBadge tone={a.kind === 'inventory' ? 'primary' : 'neutral'}>{t(`articles.kinds.${a.kind}`)}</StatusBadge> },
          { key: 'sizes', header: t('articles.sizes'), render: (a) => a.sizes.join(', ') },
          { key: 'impregnation', header: t('articles.impregnationMonths'), align: 'right', render: (a) => a.impregnationMonths ?? '' },
          { key: 'inspection', header: t('articles.inspectionMonths'), align: 'right', render: (a) => a.inspectionMonths ?? '' },
        ]}
      />
      {editing && <ArticleDialog article={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </Stack>
  );
}
