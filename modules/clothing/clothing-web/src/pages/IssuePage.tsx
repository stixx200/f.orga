import { Button, Checkbox, Grid, Group, NumberInput, Select, SimpleGrid, Stack, Switch, Text, Textarea, TextInput } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { Item } from '@forga/clothing-contracts';
import { api, ApiError, localDate, send, useLocalized, useTranslation, withQuery } from '@forga/web-sdk';
import { ConfirmDialog, DataTable, matchesSearch, Notice, notifySuccess, PageHeader, Panel, StatusBadge, useAction } from '@forga/web-ui';
import { keys, useArticleName, useArticles, useItems, usePersonClothing, usePersonName, usePersons, useStock } from '../api';
import { BlockBadges, findByCode, inspectionOverdue, ScanField, useUnknownCode } from '../parts';
import { PersonClothingView } from './PersonClothingView';
import { ReturnDialog } from './ReturnDialog';

/** A piece not among the issuable pieces: looked up on the server to name the reason. */
async function lookup(code: string): Promise<Item | undefined> {
  const label = /\/clothing\/items\/([0-9a-f-]{36})/i.exec(code)?.[1];
  const found = label
    ? await api<Item>(`clothing/items/${label.toLowerCase()}`).then((i) => [i]).catch((): Item[] => [])
    : await api<Item[]>(withQuery('clothing/items', { q: code })).catch((): Item[] => []);
  return findByCode(found, code);
}

/**
 * Issue desk: choose a person (or open it with `?person=<id>` from the person file), issue several pieces in one step
 * (ticked or scanned), hand out consumables, take pieces back.
 */
export function IssuePage() {
  const { t } = useTranslation('clothing');
  const localized = useLocalized();
  const [params, setParams] = useSearchParams();
  const personId = params.get('person');
  const setPersonId = (id: string | null) => setParams(id ? { person: id } : {}, { replace: true });
  const { data: persons = [] } = usePersons();
  const { data: articles = [] } = useArticles();
  const articleName = useArticleName();
  const unknown = useUnknownCode();
  const holderName = usePersonName();
  const [date, setDate] = useState<string | null>(() => localDate());
  const [notes, setNotes] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [onlySizes, setOnlySizes] = useState(true);
  const [acceptOverdue, setAcceptOverdue] = useState(false);
  const [returning, setReturning] = useState<'some' | 'all' | null>(null);
  const [consumable, setConsumable] = useState<{ articleKey: string | null; size: string; quantity: number }>({ articleKey: null, size: '', quantity: 1 });
  const [lowStock, setLowStock] = useState<number | null>(null);
  const { data: clothing } = usePersonClothing(personId);
  const { data: stock = [] } = useItems({ status: 'stock' }, Boolean(personId));
  const { data: counts = [] } = useStock();
  const person = persons.find((p) => p.id === personId);
  const refused = person?.status === 'veterans' || person?.status === 'left';
  const sizes = useMemo(() => clothing?.sizes ?? {}, [clothing]);
  const active = useMemo(() => new Set(articles.filter((a) => a.active).map((a) => a.key)), [articles]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return stock
      .filter((i) => active.has(i.articleKey))
      .filter((i) => selected.has(i.id) || !onlySizes || !sizes[i.articleKey] || sizes[i.articleKey] === i.size)
      .filter((i) => selected.has(i.id) || matchesSearch([i.inventoryNumber, i.barcode, i.rfid, i.serialNumber, articleName(i.articleKey), i.size], q))
      .toSorted((a, b) => articleName(a.articleKey).localeCompare(articleName(b.articleKey)) || a.size.localeCompare(b.size, 'de', { numeric: true }) || a.inventoryNumber.localeCompare(b.inventoryNumber));
  }, [stock, active, selected, onlySizes, sizes, query, articleName]);
  const chosen = stock.filter((i) => selected.has(i.id));
  const overdue = chosen.filter(inspectionOverdue);
  const article = articles.find((a) => a.key === consumable.articleKey);
  const counter = counts.find((c) => c.articleKey === consumable.articleKey && c.size === consumable.size);
  const toggle = (id: string, on: boolean) => setSelected((s) => { const next = new Set(s); if (on) next.add(id); else next.delete(id); return next; });
  /** Why a scanned piece cannot be issued: blocked, inactive article, issued (to whom) or retired. */
  const explain = (item: Item) => {
    const number = item.inventoryNumber;
    const message =
      item.status === 'issued'
        ? item.holderId === personId
          ? t('scan.issuedToThis', { number })
          : t('scan.issuedTo', { number, name: holderName(item.holderId) || '–' })
        : item.status === 'retired'
          ? t('scan.retired', { number })
          : item.blockedBy.length
            ? t(`scan.blocked.${item.blockedBy[0]}`, { number })
            : t('scan.inactive', { number });
    notifications.show({ color: 'orange', message });
  };
  const scan = async (code: string) => {
    const item = findByCode(stock.filter((i) => active.has(i.articleKey) && !i.blockedBy.length), code);
    if (item) return toggle(item.id, true);
    const known = findByCode(stock, code) ?? findByCode(clothing?.items ?? [], code) ?? (await lookup(code));
    if (known) explain(known);
    else unknown(code);
  };
  const done = { invalidate: [keys.all] };
  const issue = useAction(() => send<Item[]>('POST', 'clothing/issue', { personId, date, notes, itemIds: [...selected], acceptOverdueInspection: acceptOverdue }), {
    ...done,
    success: t('issue.issued', { count: selected.size }),
    onSuccess: () => {
      setSelected(new Set());
      setAcceptOverdue(false);
    },
  });
  // Not enough in stock according to the counter: asks first, then hands out anyway.
  const handOut = useAction(
    async (acceptLowStock: boolean) => {
      try {
        return await send('POST', 'clothing/consumables', { personId, articleKey: consumable.articleKey, size: consumable.size, quantity: consumable.quantity, date, notes, acceptLowStock });
      } catch (error) {
        if (!acceptLowStock && error instanceof ApiError && error.code === 'clothing.stockInsufficient') {
          setLowStock(Number(error.body?.['available'] ?? 0));
          return null;
        }
        throw error;
      }
    },
    {
      ...done,
      onSuccess: (result) => {
        if (!result) return;
        notifySuccess(t('issue.handedOut'));
        setLowStock(null);
        setConsumable({ articleKey: null, size: '', quantity: 1 });
      },
    },
  );
  const sizeMissing = Boolean(article?.sizes.length && !consumable.size);

  return (
    <Stack gap="lg">
      <PageHeader breadcrumbs={[{ label: t('module') }, { label: t('issue.title') }]} title={t('issue.title')} subtitle={t('issue.subtitle')} />
      <Panel>
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <Select
            label={t('history.person')}
            data={persons.filter((p) => (p.status !== 'left' || p.id === personId) && !p.restricted).map((p) => ({ value: p.id, label: `${p.lastName}, ${p.firstName}` }))}
            value={personId}
            onChange={(id) => {
              setPersonId(id);
              setSelected(new Set());
            }}
            searchable
            clearable
          />
          <DateInput label={t('care.date')} value={date} onChange={setDate} maxDate={localDate()} valueFormat="DD.MM.YYYY" required />
          <Textarea label={t('items.notes')} value={notes} onChange={(e) => setNotes(e.currentTarget.value)} autosize minRows={1} />
        </SimpleGrid>
      </Panel>
      {person && ['passive', 'youth', 'veterans', 'left'].includes(person.status) && (
        <Notice kind={refused ? 'error' : 'warning'}>{t(`issue.personStatus.${person.status}`)}</Notice>
      )}
      {personId && clothing && (
        <>
          <Grid gap="lg">
            <Grid.Col span={{ base: 12, lg: 8 }}>
            <Panel title={t('issue.piece')}>
              <Stack gap="sm">
                <Text size="xs" c="dimmed">{t('issue.selectHint')}</Text>
                <Group align="end" grow>
                  <ScanField onCode={(code) => void scan(code)} />
                  <TextInput type="search" label={t('items.search')} placeholder={t('care.searchPlaceholder')} value={query} onChange={(e) => setQuery(e.currentTarget.value)} />
                </Group>
                {Object.keys(sizes).length > 0 && <Switch label={t('issue.onlySizes')} checked={onlySizes} onChange={(e) => setOnlySizes(e.currentTarget.checked)} />}
                <DataTable<Item>
                  exportable={false}
                  rows={rows}
                  rowKey={(i) => i.id}
                  empty={t('issue.noStock')}
                  columns={[
                    {
                      key: 'select',
                      header: '',
                      width: 40,
                      render: (i) => (
                        <Checkbox aria-label={i.inventoryNumber} disabled={refused || i.blockedBy.length > 0} checked={selected.has(i.id)} onChange={(e) => toggle(i.id, e.currentTarget.checked)} />
                      ),
                    },
                    { key: 'number', header: t('items.inventoryNumber'), render: (i) => <Text fw={700} size="sm">{i.inventoryNumber}</Text> },
                    { key: 'article', header: t('items.article'), render: (i) => articleName(i.articleKey) },
                    { key: 'size', header: t('items.size'), render: (i) => i.size },
                    {
                      key: 'state',
                      header: t('items.status'),
                      render: (i) => (
                        <Group gap={4}>
                          <BlockBadges item={i} />
                          {inspectionOverdue(i) && <StatusBadge tone="warning">{t('overdue')}</StatusBadge>}
                        </Group>
                      ),
                    },
                  ]}
                />
                {overdue.length > 0 && (
                  <Checkbox
                    color="orange"
                    label={t('issue.acceptOverdue', { numbers: overdue.map((i) => i.inventoryNumber).join(', ') })}
                    checked={acceptOverdue}
                    onChange={(e) => setAcceptOverdue(e.currentTarget.checked)}
                  />
                )}
                <Group justify="flex-end">
                  <Button disabled={refused || !selected.size || !date || (overdue.length > 0 && !acceptOverdue)} loading={issue.isPending} onClick={() => issue.mutate(undefined)}>
                    {t('issue.issueSelected', { count: selected.size })}
                  </Button>
                </Group>
              </Stack>
            </Panel>
            </Grid.Col>
            <Grid.Col span={{ base: 12, lg: 4 }}>
            <Stack gap="lg">
              <Panel title={t('issue.consumable')}>
                <Stack gap="sm">
                  <Text size="xs" c="dimmed">{t('issue.consumableHint')}</Text>
                  <Select
                    label={t('items.article')}
                    data={articles.filter((a) => a.kind === 'consumable' && a.active).map((a) => ({ value: a.key, label: localized(a.name) }))}
                    value={consumable.articleKey}
                    onChange={(v) => setConsumable((c) => ({ ...c, articleKey: v, size: (v && sizes[v]) || '' }))}
                  />
                  <Group grow>
                    {article?.sizes.length ? (
                      <Select label={t('items.size')} data={article.sizes} value={consumable.size || null} onChange={(v) => setConsumable((c) => ({ ...c, size: v ?? '' }))} />
                    ) : (
                      <TextInput label={t('items.size')} value={consumable.size} onChange={(e) => {
                        const size = e.currentTarget.value;
                        setConsumable((c) => ({ ...c, size }));
                      }} />
                    )}
                    <NumberInput label={t('history.quantity')} value={consumable.quantity} min={1} max={100} onChange={(v) => setConsumable((c) => ({ ...c, quantity: Number(v) || 1 }))} />
                  </Group>
                  {counter && <Text size="xs" c={counter.available < consumable.quantity ? 'red.8' : 'dimmed'}>{t('issue.stockLeft', { count: counter.available })}</Text>}
                  {consumable.articleKey && sizeMissing && <Text size="xs" c="dimmed">{t('issue.sizeRequired')}</Text>}
                  <Group justify="flex-end">
                    <Button disabled={refused || !consumable.articleKey || sizeMissing || !date} loading={handOut.isPending} onClick={() => handOut.mutate(false)}>{t('issue.handOut')}</Button>
                  </Group>
                </Stack>
              </Panel>
              <Panel title={t('issue.takeBack')}>
                <Group>
                  <Button variant="default" disabled={!clothing.items.length} onClick={() => setReturning('some')}>{t('issue.takeBackSome')}</Button>
                  <Button variant="default" disabled={!clothing.items.length} onClick={() => setReturning('all')}>{t('issue.takeBackAll')}</Button>
                </Group>
              </Panel>
            </Stack>
            </Grid.Col>
          </Grid>
          <PersonClothingView data={clothing} />
          {returning && <ReturnDialog items={clothing.items} all={returning === 'all'} onClose={() => setReturning(null)} />}
          {lowStock !== null && (
            <ConfirmDialog
              opened
              onClose={() => setLowStock(null)}
              title={t('issue.lowStockTitle')}
              description={t('issue.lowStockText', { count: lowStock })}
              confirmLabel={t('issue.lowStockConfirm')}
              loading={handOut.isPending}
              onConfirm={() => handOut.mutate(true)}
            />
          )}
        </>
      )}
    </Stack>
  );
}
