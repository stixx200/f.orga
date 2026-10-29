import { Button, Checkbox, Group, Select, SimpleGrid, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { Language, ThirdPartyHit, ThirdPartyRef } from '@forga/core-contracts';
import type { AccessReport, PrivacyRequest, ThirdPartyErasureResult } from '@forga/privacy-contracts';
import { api, formatDate, send, useTranslation, withQuery } from '@forga/web-sdk';
import { DataTable, EmptyState, Notice, Panel, ResponsiveDialog, StatusBadge, useAction } from '@forga/web-ui';
import { ACCESS_REPORTS_KEY, ReportsTable, useRequestReports } from './AccessReports';

const refOf = (hit: ThirdPartyHit): ThirdPartyRef => ({ source: hit.source, id: hit.id });
const keyOf = (ref: ThirdPartyRef) => `${ref.source}|${ref.id}`;

/** Search over the third-party data of all modules (L14) with a selection of the places. */
function ThirdPartyFinder({ initial, selected, onChange }: { initial: string; selected: Map<string, ThirdPartyHit>; onChange: (selected: Map<string, ThirdPartyHit>) => void }) {
  const { t, i18n } = useTranslation('privacy');
  const [search, setSearch] = useState(initial);
  const [query] = useDebouncedValue(search.trim(), 300);
  const { data: hits = [], isFetching } = useQuery({
    queryKey: ['privacy', 'third-parties', query],
    queryFn: () => api<ThirdPartyHit[]>(withQuery('privacy/third-parties', { q: query })),
    enabled: query.length >= 2,
  });
  // Chosen places stay listed when the search changes.
  const rows = [...selected.values()].filter((s) => !hits.some((h) => keyOf(h) === keyOf(s))).concat(hits);
  const toggle = (hit: ThirdPartyHit, on: boolean) => {
    const next = new Map(selected);
    if (on) next.set(keyOf(hit), hit);
    else next.delete(keyOf(hit));
    onChange(next);
  };
  return (
    <Stack gap="sm">
      <TextInput type="search" label={t('minimisation.thirdParties.search')} description={t('minimisation.thirdParties.searchHint')} value={search} onChange={(e) => setSearch(e.currentTarget.value)} />
      {query.length >= 2 || selected.size ? (
        <DataTable
          exportable={false}
          rows={rows}
          rowKey={keyOf}
          empty={isFetching ? null : t('minimisation.thirdParties.none')}
          columns={[
            {
              key: 'select',
              header: '',
              width: 40,
              render: (h) => <Checkbox aria-label={t('minimisation.thirdParties.select', { reference: h.reference })} checked={selected.has(keyOf(h))} onChange={(e) => toggle(h, e.currentTarget.checked)} />,
            },
            { key: 'place', header: t('minimisation.thirdParties.columns.place'), render: (h) => h.reference },
            { key: 'name', header: t('minimisation.thirdParties.columns.name'), render: (h) => [h.name, h.address].filter(Boolean).join(', ') },
            { key: 'role', header: t('minimisation.thirdParties.columns.role'), render: (h) => h.role },
            { key: 'date', header: t('minimisation.thirdParties.columns.date'), render: (h) => (h.date ? formatDate(h.date, i18n.language) : '–') },
            { key: 'details', header: t('minimisation.thirdParties.columns.details'), render: (h) => h.details || '–' },
          ]}
        />
      ) : null}
      {selected.size > 0 && <Text size="sm">{t('minimisation.thirdParties.selected', { count: selected.size })}</Text>}
    </Stack>
  );
}

/** Name and address of the letter from the first chosen place, editable. */
function letterOf(selected: Map<string, ThirdPartyHit>): { name: string; address: string } {
  const first = [...selected.values()][0];
  return { name: first?.name ?? '', address: first?.address.replace(', ', '\n') ?? '' };
}

/** „Auskunft zu einer anderen Person“ on the page of requests (mockup `datenschutz/anfragen.html`, `#d-dritte`). */
export function ThirdPartyAccessDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('privacy');
  const { t: common } = useTranslation('common');
  const [selected, setSelected] = useState<Map<string, ThirdPartyHit>>(new Map());
  const [letter, setLetter] = useState<{ name: string; address: string } | null>(null);
  const [language, setLanguage] = useState<Language>('de');
  const [created, setCreated] = useState<AccessReport | null>(null);
  const shown = letter ?? letterOf(selected);
  const create = useAction(
    () => send<AccessReport>('POST', 'privacy/third-parties/access-reports', { ...shown, language, refs: [...selected.values()].map(refOf) }),
    { invalidate: [ACCESS_REPORTS_KEY], onSuccess: (report) => setCreated(report) },
  );
  const { data: report } = useQuery({
    queryKey: [...ACCESS_REPORTS_KEY, 'one', created?.id],
    queryFn: () => api<AccessReport>(`privacy/access-reports/${created!.id}`),
    enabled: Boolean(created),
    refetchInterval: (query) => (query.state.data?.status === 'ready' || query.state.data?.status === 'failed' ? false : 2000),
  });
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      size="xl"
      title={t('minimisation.thirdParties.title')}
      actions={
        <>
          <Button variant="default" onClick={onClose}>{common('actions.close')}</Button>
          {!created && (
            <Button loading={create.isPending} disabled={!selected.size || shown.name.trim().length < 2} onClick={() => create.mutate(undefined)}>
              {t('minimisation.thirdParties.create')}
            </Button>
          )}
        </>
      }
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">{t('minimisation.thirdParties.intro')}</Text>
        {created ? (
          <>
            <Notice kind="info">{t('minimisation.thirdParties.created')}</Notice>
            {report && <ReportsTable reports={[report]} />}
          </>
        ) : (
          <>
            <ThirdPartyFinder initial="" selected={selected} onChange={setSelected} />
            {selected.size > 0 && (
              <SimpleGrid cols={{ base: 1, sm: 3 }}>
                <TextInput label={t('minimisation.thirdParties.name')} required value={shown.name} onChange={(e) => setLetter({ ...shown, name: e.currentTarget.value })} />
                <Textarea label={t('minimisation.thirdParties.address')} autosize minRows={2} value={shown.address} onChange={(e) => setLetter({ ...shown, address: e.currentTarget.value })} />
                <Select
                  label={t('minimisation.thirdParties.language')}
                  allowDeselect={false}
                  data={(['de', 'en'] as const).map((l) => ({ value: l, label: t(`privacy.languages.${l}`) }))}
                  value={language}
                  onChange={(l) => l && setLanguage(l as Language)}
                />
              </SimpleGrid>
            )}
            <Text size="xs" c="dimmed">{t('minimisation.thirdParties.noRights')}</Text>
          </>
        )}
      </Stack>
    </ResponsiveDialog>
  );
}

/** Erasure at the chosen places with a required reason; shows what was anonymised, deleted or kept. */
function EraseDialog({ request, selected, onClose }: { request: PrivacyRequest; selected: ThirdPartyHit[]; onClose: () => void }) {
  const { t } = useTranslation('privacy');
  const { t: common } = useTranslation('common');
  const [reason, setReason] = useState('');
  const [result, setResult] = useState<ThirdPartyErasureResult | null>(null);
  const erase = useAction(
    () => send<ThirdPartyErasureResult>('POST', 'privacy/third-parties/erasure', { refs: selected.map(refOf), reason, requestId: request.id }),
    { invalidate: [['privacy', 'third-parties']], onSuccess: setResult },
  );
  const hit = (source: string, id: string) => selected.find((h) => h.source === source && h.id === id);
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      size="lg"
      title={t('minimisation.thirdParties.eraseTitle')}
      actions={
        <>
          <Button variant="default" onClick={onClose}>{common(result ? 'actions.close' : 'actions.cancel')}</Button>
          {!result && (
            <Button color="red" loading={erase.isPending} disabled={reason.trim().length < 10} onClick={() => erase.mutate(undefined)}>
              {t('minimisation.thirdParties.eraseSubmit')}
            </Button>
          )}
        </>
      }
    >
      {result ? (
        <DataTable
          exportable={false}
          rows={result.results}
          rowKey={(r) => `${r.source}|${r.id}`}
          columns={[
            { key: 'place', header: t('minimisation.thirdParties.columns.place'), render: (r) => hit(r.source, r.id)?.reference ?? '–' },
            {
              key: 'outcome',
              header: t('minimisation.thirdParties.results'),
              render: (r) => (
                <Group gap={6}>
                  <StatusBadge tone={r.outcome === 'kept' ? 'warning' : 'done'}>{t(`minimisation.thirdParties.outcomes.${r.outcome}`)}</StatusBadge>
                  {r.code && <Text size="xs">{common(`errors.${r.code}`)}</Text>}
                </Group>
              ),
            },
          ]}
        />
      ) : (
        <Stack gap="md">
          <Notice kind="warning">{t('minimisation.thirdParties.eraseText')}</Notice>
          <Text size="sm">{t('minimisation.thirdParties.selected', { count: selected.length })}</Text>
          <TextInput label={t('minimisation.thirdParties.reason')} required placeholder={t('minimisation.thirdParties.reasonPlaceholder')} value={reason} onChange={(e) => setReason(e.currentTarget.value)} />
        </Stack>
      )}
    </ResponsiveDialog>
  );
}

/** Page of a request of a third party: places of the data, access report or erasure, and the reports of the request. */
export function ThirdPartyRequestPanel({ request }: { request: PrivacyRequest }) {
  const { t } = useTranslation('privacy');
  const [selected, setSelected] = useState<Map<string, ThirdPartyHit>>(new Map());
  const [erasing, setErasing] = useState(false);
  const { data: reports = [] } = useRequestReports(request.id);
  const letter = { name: request.thirdParty?.name ?? '', address: letterOf(selected).address };
  const create = useAction(
    () => send<AccessReport>('POST', 'privacy/third-parties/access-reports', { ...letter, language: request.language, requestId: request.id, refs: [...selected.values()].map(refOf) }),
    { invalidate: [ACCESS_REPORTS_KEY], success: t('minimisation.thirdParties.created') },
  );
  const open = ['received', 'in-review', 'extended'].includes(request.status);
  return (
    <>
      <Panel
        title={t('minimisation.thirdParties.panel')}
        aside={
          open && (
            <Group gap="xs">
              {request.kind === 'access' && (
                <Button size="xs" loading={create.isPending} disabled={!selected.size} onClick={() => create.mutate(undefined)}>{t('minimisation.thirdParties.create')}</Button>
              )}
              {request.kind === 'erasure' && (
                <Button size="xs" color="red" variant="light" disabled={!selected.size} onClick={() => setErasing(true)}>{t('minimisation.thirdParties.erase')}</Button>
              )}
            </Group>
          )
        }
      >
        <Stack gap="sm">
          <Text size="sm" c="dimmed">{t('minimisation.thirdParties.panelIntro')}</Text>
          <ThirdPartyFinder initial={request.thirdParty?.name ?? ''} selected={selected} onChange={setSelected} />
        </Stack>
      </Panel>
      {request.kind === 'access' && (
        <Panel title={t('minimisation.thirdParties.requestReports')}>
          {reports.length ? <ReportsTable reports={reports} /> : <EmptyState title={t('accessReport.noneForRequest')} />}
        </Panel>
      )}
      {erasing && <EraseDialog request={request} selected={[...selected.values()]} onClose={() => { setErasing(false); setSelected(new Map()); }} />}
    </>
  );
}
