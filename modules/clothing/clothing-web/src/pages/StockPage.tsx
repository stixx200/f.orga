import { Button, Group, NumberInput, Select, SimpleGrid, Stack, Switch, Text, Textarea, TextInput } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useState } from 'react';
import type { StockRow } from '@forga/clothing-contracts';
import { can, localDate, send, useLocalized, useSession, useTranslation } from '@forga/web-sdk';
import { DataTable, PageHeader, ResponsiveDialog, StatusBadge, useAction } from '@forga/web-ui';
import { keys, MANAGE, READ, useArticleName, useArticles, useDepartments, useStock } from '../api';

/** Consumables received (or corrected after counting with a negative quantity). */
function ReceiptDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('clothing');
  const { t: common } = useTranslation('common');
  const localized = useLocalized();
  const { data: articles = [] } = useArticles();
  const [form, setForm] = useState<{ articleKey: string | null; size: string; quantity: number; date: string | null; notes: string }>({ articleKey: null, size: '', quantity: 1, date: localDate(), notes: '' });
  const article = articles.find((a) => a.key === form.articleKey);
  const save = useAction(() => send('POST', 'clothing/consumables/receipts', form), { success: t('stock.received'), invalidate: [keys.all], onSuccess: onClose });
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={t('stock.receive')}
      actions={
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button disabled={!form.articleKey || !form.quantity || !form.date} loading={save.isPending} onClick={() => save.mutate(undefined)}>{common('actions.save')}</Button>
        </Group>
      }
    >
      <Stack gap="sm">
        <Text size="xs" c="dimmed">{t('stock.receiveHint')}</Text>
        <Select
          label={t('items.article')}
          data={articles.filter((a) => a.kind === 'consumable').map((a) => ({ value: a.key, label: localized(a.name) }))}
          value={form.articleKey}
          onChange={(v) => setForm((f) => ({ ...f, articleKey: v, size: '' }))}
          required
        />
        <SimpleGrid cols={2}>
          {article?.sizes.length ? (
            <Select label={t('items.size')} data={article.sizes} value={form.size || null} onChange={(v) => setForm((f) => ({ ...f, size: v ?? '' }))} />
          ) : (
            <TextInput label={t('items.size')} value={form.size} onChange={(e) => { const size = e.currentTarget.value; setForm((f) => ({ ...f, size })); }} />
          )}
          <NumberInput label={t('stock.quantity')} value={form.quantity} min={-10_000} max={10_000} onChange={(v) => setForm((f) => ({ ...f, quantity: Number(v) || 0 }))} required />
        </SimpleGrid>
        <DateInput label={t('care.date')} value={form.date} onChange={(date) => setForm((f) => ({ ...f, date }))} maxDate={localDate()} valueFormat="DD.MM.YYYY" required />
        <Textarea label={t('items.notes')} value={form.notes} onChange={(e) => { const notes = e.currentTarget.value; setForm((f) => ({ ...f, notes })); }} autosize minRows={1} />
      </Stack>
    </ResponsiveDialog>
  );
}

/** Stock per article and size with minimum stock and reorder hint; consumables as a counter. */
export function StockPage() {
  const { t } = useTranslation('clothing');
  const session = useSession().data;
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [reorderOnly, setReorderOnly] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const { data: rows = [], isLoading } = useStock(departmentId ?? undefined);
  const { data: departments = [] } = useDepartments();
  const articleName = useArticleName();
  const shown = rows.filter((r) => !reorderOnly || r.reorder);
  return (
    <Stack gap="lg">
      <PageHeader
        breadcrumbs={[{ label: t('module') }, { label: t('stock.title') }]}
        title={t('stock.title')}
        subtitle={t('stock.subtitle')}
        actions={can(session, MANAGE) && <Button onClick={() => setReceiving(true)}>{t('stock.receive')}</Button>}
      />
      <Group align="end">
        <Select
          label={t('items.department')}
          placeholder={t('stock.allDepartments')}
          data={departments.filter((d) => can(session, READ, d.id)).map((d) => ({ value: d.id, label: d.name }))}
          value={departmentId}
          onChange={setDepartmentId}
          clearable
        />
        <Switch label={t('stock.reorderOnly')} checked={reorderOnly} onChange={(e) => setReorderOnly(e.currentTarget.checked)} mb={8} />
      </Group>
      <DataTable<StockRow>
        rows={shown}
        rowKey={(r) => `${r.articleKey}|${r.size}`}
        empty={isLoading ? t('loading') : t('stock.empty')}
        columns={[
          { key: 'article', header: t('items.article'), render: (r) => <Text fw={700} size="sm">{articleName(r.articleKey)}</Text> },
          { key: 'kind', header: t('articles.kind'), render: (r) => <StatusBadge tone={r.kind === 'inventory' ? 'primary' : 'neutral'}>{t(`articles.kinds.${r.kind}`)}</StatusBadge> },
          { key: 'size', header: t('items.size'), render: (r) => r.size },
          { key: 'available', header: t('stock.available'), align: 'right', render: (r) => r.available },
          { key: 'blocked', header: t('stock.blocked'), align: 'right', render: (r) => (r.kind === 'inventory' ? r.blocked : '') },
          { key: 'issued', header: t('stock.issued'), align: 'right', render: (r) => (r.kind === 'inventory' ? r.issued : '') },
          { key: 'minimum', header: t('stock.minimum'), align: 'right', render: (r) => r.minimum ?? '' },
          { key: 'reorder', header: '', export: false, render: (r) => r.reorder && <StatusBadge tone="error">{t('stock.reorder')}</StatusBadge> },
        ]}
      />
      <Text size="xs" c="dimmed">{t('stock.consumableHint')}</Text>
      {receiving && <ReceiptDialog onClose={() => setReceiving(false)} />}
    </Stack>
  );
}
