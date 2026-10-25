import { Button, Group, NumberInput, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useState } from 'react';
import { localDate, send, useLocalized, useTranslation } from '@forga/web-sdk';
import { PageHeader, Panel, useAction } from '@forga/web-ui';
import { keys, useArticleName, useArticles, useItems, usePersonClothing, usePersons } from '../api';
import { PersonClothingView } from './PersonClothingView';

/** Issue desk: choose a person, hand out pieces and consumables, take pieces back. */
export function IssuePage() {
  const { t } = useTranslation('clothing');
  const localized = useLocalized();
  const { data: persons = [] } = usePersons();
  const { data: articles = [] } = useArticles();
  const articleName = useArticleName();
  const [personId, setPersonId] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(() => localDate());
  const [itemId, setItemId] = useState<string | null>(null);
  const [returnId, setReturnId] = useState<string | null>(null);
  const [consumable, setConsumable] = useState<{ articleKey: string | null; size: string; quantity: number }>({ articleKey: null, size: '', quantity: 1 });
  const { data: clothing } = usePersonClothing(personId);
  const { data: stock = [] } = useItems({ status: 'stock' }, Boolean(personId));
  const article = articles.find((a) => a.key === consumable.articleKey);
  const done = { invalidate: [keys.all] };
  const issue = useAction(() => send('POST', `clothing/items/${itemId}/issue`, { personId, date }), { ...done, success: t('issue.issued'), onSuccess: () => setItemId(null) });
  const giveBack = useAction(() => send('POST', `clothing/items/${returnId}/return`, { date }), { ...done, success: t('issue.returned'), onSuccess: () => setReturnId(null) });
  const handOut = useAction(() => send('POST', 'clothing/consumables', { personId, articleKey: consumable.articleKey, size: consumable.size, quantity: consumable.quantity, date }), {
    ...done,
    success: t('issue.handedOut'),
    onSuccess: () => setConsumable({ articleKey: null, size: '', quantity: 1 }),
  });

  return (
    <Stack gap="lg">
      <PageHeader breadcrumbs={[{ label: t('module') }, { label: t('issue.title') }]} title={t('issue.title')} subtitle={t('issue.subtitle')} />
      <Panel>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Select
            label={t('history.person')}
            data={persons.filter((p) => p.status !== 'left' && !p.restricted).map((p) => ({ value: p.id, label: `${p.lastName}, ${p.firstName}` }))}
            value={personId}
            onChange={setPersonId}
            searchable
            clearable
          />
          <DateInput label={t('care.date')} value={date} onChange={setDate} valueFormat="DD.MM.YYYY" required />
        </SimpleGrid>
      </Panel>
      {personId && clothing && (
        <>
          <SimpleGrid cols={{ base: 1, lg: 3 }} spacing="lg">
            <Panel title={t('issue.piece')}>
              <Stack gap="sm">
                <Select
                  label={t('issue.fromStock')}
                  data={stock.map((i) => ({ value: i.id, label: `${i.inventoryNumber} · ${articleName(i.articleKey)}${i.size ? ` · ${i.size}` : ''}` }))}
                  value={itemId}
                  onChange={setItemId}
                  searchable
                  nothingFoundMessage={t('issue.noStock')}
                />
                <Group justify="flex-end"><Button disabled={!itemId || !date} loading={issue.isPending} onClick={() => issue.mutate(undefined)}>{t('items.issue')}</Button></Group>
              </Stack>
            </Panel>
            <Panel title={t('issue.consumable')}>
              <Stack gap="sm">
                <Text size="xs" c="dimmed">{t('issue.consumableHint')}</Text>
                <Select
                  label={t('items.article')}
                  data={articles.filter((a) => a.kind === 'consumable' && a.active).map((a) => ({ value: a.key, label: localized(a.name) }))}
                  value={consumable.articleKey}
                  onChange={(v) => setConsumable((c) => ({ ...c, articleKey: v, size: '' }))}
                />
                <Group grow>
                  {article?.sizes.length ? (
                    <Select label={t('items.size')} data={article.sizes} value={consumable.size || null} onChange={(v) => setConsumable((c) => ({ ...c, size: v ?? '' }))} />
                  ) : (
                    <TextInput label={t('items.size')} value={consumable.size} onChange={(e) => setConsumable((c) => ({ ...c, size: e.currentTarget.value }))} />
                  )}
                  <NumberInput label={t('history.quantity')} value={consumable.quantity} min={1} max={100} onChange={(v) => setConsumable((c) => ({ ...c, quantity: Number(v) || 1 }))} />
                </Group>
                <Group justify="flex-end"><Button disabled={!consumable.articleKey || !date} loading={handOut.isPending} onClick={() => handOut.mutate(undefined)}>{t('issue.handOut')}</Button></Group>
              </Stack>
            </Panel>
            <Panel title={t('issue.takeBack')}>
              <Stack gap="sm">
                <Select
                  label={t('issue.heldPiece')}
                  data={clothing.items.map((i) => ({ value: i.id, label: `${i.inventoryNumber} · ${articleName(i.articleKey)}` }))}
                  value={returnId}
                  onChange={setReturnId}
                  nothingFoundMessage={t('person.nothingHeld')}
                />
                <Text size="xs" c="dimmed">{t('issue.retireHint')}</Text>
                <Group justify="flex-end"><Button variant="default" disabled={!returnId || !date} loading={giveBack.isPending} onClick={() => giveBack.mutate(undefined)}>{t('items.return')}</Button></Group>
              </Stack>
            </Panel>
          </SimpleGrid>
          <PersonClothingView data={clothing} />
        </>
      )}
    </Stack>
  );
}
