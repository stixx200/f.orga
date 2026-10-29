import { Anchor, Button, Checkbox, Group, List, Progress, Select, Stack, Switch, Text } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { ImportValueMappings } from '@forga/core-contracts';
import { FINAL, MESSAGES_KEEP_DAYS, type MpFeuerRun, type RunArchive, type RunDataset } from '@forga/mp-feuer-contracts';
import { apiUrl, formatDateTime, send, translateCode, useCan, useLocalized, useTranslation } from '@forga/web-sdk';
import { ActionBar, ConfirmDialog, DataTable, EmptyState, Notice, Panel, StatusBadge, UnmatchedValues, mergeUnmatched, useAction } from '@forga/web-ui';
import { isRunning, keys, TRANSFER, useDepartments, useReport, useRun, useSelect } from '../api';
import { ModulePage } from '../components/ModulePage';
import { CountBadges, seconds, sumCounts } from '../components/RunBits';
import { RunSteps } from '../components/RunSteps';

type View = 'archives' | 'datasets' | 'mapping';

/** Step of the stepper: the working or finished run decides, otherwise the page the user opened. */
function stepOf(run: MpFeuerRun, view: View): number {
  if (FINAL.includes(run.status)) return 4;
  if (run.status === 'applying') return 3;
  if (run.status === 'dry-running') return 1;
  return { archives: 0, datasets: 1, mapping: 2 }[view];
}

/** A transfer from the archives to the result; the run works in the background, the page polls it. */
export function RunPage() {
  const { t } = useTranslation('mp-feuer');
  const { id = '' } = useParams();
  const { data: run, isError } = useRun(id);
  const [view, setView] = useState<View>('archives');
  const mayTransfer = useCan(TRANSFER);
  if (isError) {
    return (
      <ModulePage tab="transfer">
        <EmptyState title={t('run.notFound')} />
      </ModulePage>
    );
  }
  if (!run) return <ModulePage tab="transfer">{null}</ModulePage>;
  const step = stepOf(run, view);
  const editable = mayTransfer && (run.status === 'prepared' || run.status === 'checked');
  return (
    <ModulePage tab="transfer">
      <RunSteps active={step} onStep={editable ? (s) => s < 3 && setView((['archives', 'datasets', 'mapping'] as const)[s]) : undefined} />
      {step === 0 && <ArchivesStep run={run} editable={editable} onNext={() => setView('datasets')} />}
      {step === 1 && <DatasetsStep run={run} editable={editable} onBack={() => setView('archives')} onMapping={() => setView('mapping')} />}
      {step === 2 && <MappingStep run={run} editable={editable} onBack={() => setView('datasets')} />}
      {step === 3 && <ProgressStep run={run} />}
      {step === 4 && <ResultStep run={run} />}
    </ModulePage>
  );
}

/** "Abt. Musterstadt" ↔ "Abteilung Musterstadt". */
const unitKey = (text: string) => text.toLowerCase().replace(/abteilung/g, 'abt').replace(/ue/g, 'ü').replace(/[^a-z0-9äöüß]/g, '');

function ArchivesStep({ run, editable, onNext }: { run: MpFeuerRun; editable: boolean; onNext: () => void }) {
  const { t } = useTranslation('mp-feuer');
  const localized = useLocalized();
  const navigate = useNavigate();
  const client = useQueryClient();
  const select = useSelect(run.id);
  const { data: departments = [] } = useDepartments();
  const change = useAction((archive: RunArchive) => select({ archives: { [archive.key]: { department: archive.department, unit: archive.unit, skip: archive.skip } } }));
  const discard = useAction(() => send<void>('DELETE', `mp-feuer/runs/${run.id}`), {
    invalidate: [keys.runs],
    onSuccess: () => {
      client.removeQueries({ queryKey: keys.run(run.id) });
      navigate('/mp-feuer/overview');
    },
  });
  const content = (a: RunArchive) =>
    [a.content.persons && t('archives.persons', { count: a.content.persons }), a.content.incidents && t('archives.incidents', { count: a.content.incidents }), a.content.sessions && t('archives.sessions', { count: a.content.sessions })]
      .filter(Boolean)
      .join(' · ');
  const notOperational = (a: RunArchive) => {
    const name = a.department ?? a.label;
    const department = departments.find((d) => d.name === name) ?? departments.find((d) => unitKey(d.name) === unitKey(name));
    return !a.unit && !!department && department.type !== 'operational' && a.content.incidents > 0;
  };
  const superseded = run.archives.flatMap((a) => a.superseded.map((file) => ({ file, newer: a.fileName })));

  return (
    <>
      <Panel title={t('archives.title', { count: run.archives.length })} aside={<Text size="sm" c="dimmed">{t('archives.rememberedHint')}</Text>}>
        <DataTable
          rows={run.archives}
          rowKey={(a) => a.key}
          exportable={false}
          columns={[
            { key: 'key', header: t('archives.number'), width: 60, render: (a) => <Text fw={700} translate="no">{a.key}</Text> },
            {
              key: 'file',
              header: t('archives.file'),
              render: (a) => (
                <Stack gap={2}>
                  <Text size="sm" translate="no" style={{ fontFamily: 'monospace' }}>{a.fileName}</Text>
                  <Text size="xs" c="dimmed">{content(a) || t('archives.empty')}</Text>
                  {!a.remembered && !a.skip && <Text size="xs">{t('archives.suggested')}</Text>}
                </Stack>
              ),
            },
            {
              key: 'department',
              header: t('archives.department'),
              render: (a) => (
                <Select
                  aria-label={t('archives.department')}
                  placeholder={t('archives.asNamed', { name: a.label })}
                  data={departments.map((d) => ({ value: d.name, label: d.name }))}
                  value={a.department}
                  onChange={(value) => change.mutate({ ...a, department: value })}
                  disabled={!editable || a.skip}
                  clearable
                  searchable
                />
              ),
            },
            {
              key: 'unit',
              header: t('archives.unit'),
              render: (a) =>
                run.units ? (
                  <Stack gap={2}>
                    <Select
                      aria-label={t('archives.unit')}
                      data={[{ value: '', label: t('archives.departmentReport') }, ...run.units.entries.map((e) => ({ value: e.key, label: localized(e.name) }))]}
                      value={a.unit ?? ''}
                      onChange={(value) => change.mutate({ ...a, unit: value || null })}
                      disabled={!editable || a.skip}
                      allowDeselect={false}
                    />
                    {notOperational(a) && <Text size="xs" c="dimmed">{t('archives.unitNeeded')}</Text>}
                  </Stack>
                ) : (
                  <Text size="sm" c="dimmed">–</Text>
                ),
            },
            {
              key: 'status',
              header: t('archives.status'),
              render: (a) => (
                <Stack gap={4}>
                  {a.skip ? <StatusBadge>{t('archives.skipped')}</StatusBadge> : a.remembered ? <StatusBadge tone="done">{t('archives.remembered')}</StatusBadge> : <StatusBadge tone="warning">{t('archives.new')}</StatusBadge>}
                  <Switch size="xs" label={t('archives.skip')} checked={a.skip} disabled={!editable} onChange={(e) => change.mutate({ ...a, skip: e.currentTarget.checked })} />
                </Stack>
              ),
            },
          ]}
        />
        {superseded.map(({ file, newer }) => (
          <Notice key={file} kind="warning">{t('archives.superseded', { file, newer })}</Notice>
        ))}
      </Panel>
      <ActionBar>
        {editable && <Button variant="default" loading={discard.isPending} onClick={() => discard.mutate(undefined)}>{t('actions.discard')}</Button>}
        <Button onClick={onNext}>{t('archives.next')}</Button>
      </ActionBar>
    </>
  );
}

function DatasetsStep({ run, editable, onBack, onMapping }: { run: MpFeuerRun; editable: boolean; onBack: () => void; onMapping: () => void }) {
  const { t, i18n } = useTranslation('mp-feuer');
  const localized = useLocalized();
  const select = useSelect(run.id);
  const [confirmApply, setConfirmApply] = useState(false);
  const change = useAction((input: { dataset: RunDataset; enabled?: boolean; option?: [string, boolean]; from?: string | null }) =>
    select({
      datasets: {
        [input.dataset.profile]: {
          enabled: input.enabled ?? input.dataset.enabled,
          options: input.option ? { ...input.dataset.options, [input.option[0]]: input.option[1] } : input.dataset.options,
          from: input.from === undefined ? input.dataset.from : input.from,
        },
      },
    }),
  );
  const start = useStart(run.id);
  const checked = run.status === 'checked' && run.phase === 'dry-run';
  const errors = sumCounts(run.datasets.map((d) => d.counts)).error;
  const working = run.status === 'dry-running';

  return (
    <>
      {working && <Notice kind="info">{t('datasets.checking')}</Notice>}
      {checked && !run.dryRunOutdated && (
        <Notice kind={errors || run.unmatched.length ? 'warning' : 'done'}>
          {t('datasets.checked', { date: formatDateTime(run.finishedAt, i18n.language), duration: seconds(Date.parse(run.finishedAt ?? '') - Date.parse(run.startedAt ?? '')), unmatched: run.unmatched.length, errors })}
        </Notice>
      )}
      {run.dryRunOutdated && <Notice kind="warning">{t('datasets.outdated')}</Notice>}
      {run.status === 'failed' && <Notice kind="error">{translateCode(run.error ?? 'mp-feuer.failed')}</Notice>}
      <Panel title={t('datasets.title')} aside={<Text size="sm" c="dimmed">{t('datasets.order')}</Text>}>
        <DataTable
          rows={run.datasets}
          rowKey={(d) => d.profile}
          exportable={false}
          columns={[
            {
              key: 'name',
              header: t('datasets.dataset'),
              render: (d) => (
                <Stack gap={2}>
                  <Checkbox label={<b>{`${d.order / 10} ${localized(d.name)}`}</b>} checked={d.enabled} disabled={!editable || d.locked} onChange={(e) => change.mutate({ dataset: d, enabled: e.currentTarget.checked })} />
                  {d.locked && <Text size="xs" c="dimmed">{t('datasets.locked')}</Text>}
                </Stack>
              ),
            },
            { key: 'rows', header: t('datasets.rows'), align: 'right', render: (d) => d.rowCount.toLocaleString(i18n.language) },
            {
              key: 'options',
              header: t('datasets.options'),
              render: (d) =>
                d.optionInfo.length || d.fromAvailable ? (
                  <Stack gap={4}>
                    {d.optionInfo.map((o) => (
                      <Checkbox key={o.key} size="xs" label={localized(o.label)} checked={d.options[o.key] ?? o.default} disabled={!editable || d.locked} onChange={(e) => change.mutate({ dataset: d, option: [o.key, e.currentTarget.checked] })} />
                    ))}
                    {d.fromAvailable && (
                      <DateInput
                        size="xs"
                        label={t('datasets.from')}
                        placeholder={t('datasets.fromHint')}
                        valueFormat="DD.MM.YYYY"
                        clearable
                        value={d.from}
                        disabled={!editable || d.locked}
                        onChange={(value) => change.mutate({ dataset: d, from: value || null })}
                        maw={180}
                      />
                    )}
                  </Stack>
                ) : (
                  '–'
                ),
            },
            {
              key: 'result',
              header: t('datasets.result'),
              render: (d) =>
                working && d.enabled && !d.locked ? <PartProgress run={run} dataset={d} /> : d.counts && run.phase === 'dry-run' ? <CountBadges counts={d.counts} unmatched={d.unmatched} onUnmatched={onMapping} /> : '–',
            },
          ]}
        />
        <Text size="xs" c="dimmed" mt="xs">{t('datasets.remembered')}</Text>
      </Panel>
      <ActionBar info={t('datasets.parts')}>
        <Button variant="default" onClick={onBack}>{t('actions.back')}</Button>
        {editable && (
          <Button variant={checked && !run.dryRunOutdated ? 'default' : 'filled'} loading={start.isPending && start.variables === 'dry-run'} disabled={working} onClick={() => start.mutate('dry-run')}>
            {checked ? t('actions.recheck') : t('actions.dryRun')}
          </Button>
        )}
        {checked && run.unmatched.length > 0 && <Button onClick={onMapping}>{t('datasets.toMapping', { count: run.unmatched.length })}</Button>}
        {editable && checked && run.unmatched.length === 0 && (
          <Button disabled={run.dryRunOutdated} onClick={() => setConfirmApply(true)}>{t('actions.apply')}</Button>
        )}
      </ActionBar>
      <ApplyDialog run={run} opened={confirmApply} onClose={() => setConfirmApply(false)} />
    </>
  );
}

/** Starts a dry run or the apply; the page then polls the run. */
function useStart(id: string) {
  const client = useQueryClient();
  return useAction((phase: 'dry-run' | 'apply') => send<MpFeuerRun>('POST', `mp-feuer/runs/${id}/${phase}`), {
    invalidate: [keys.runs],
    onSuccess: (run) => client.setQueryData(keys.run(id), run),
  });
}

function ApplyDialog({ run, opened, onClose }: { run: MpFeuerRun; opened: boolean; onClose: () => void }) {
  const { t } = useTranslation('mp-feuer');
  const start = useStart(run.id);
  return (
    <ConfirmDialog
      opened={opened}
      onClose={onClose}
      title={t('apply.title')}
      description={t('apply.text', { unmatched: run.unmatched.filter((u) => !run.mappings[u.kind]?.[u.value]).length })}
      confirmLabel={t('apply.confirm')}
      loading={start.isPending}
      onConfirm={() => start.mutate('apply', { onSuccess: onClose })}
    />
  );
}

function MappingStep({ run, editable, onBack }: { run: MpFeuerRun; editable: boolean; onBack: () => void }) {
  const { t } = useTranslation('mp-feuer');
  const select = useSelect(run.id);
  const start = useStart(run.id);
  const [confirmApply, setConfirmApply] = useState(false);
  // Values assigned in this run stay visible after the next dry run, so their assignment can be changed again.
  const [items, setItems] = useState(run.unmatched);
  const [checked, setChecked] = useState(run.unmatched);
  if (checked !== run.unmatched) {
    setChecked(run.unmatched);
    setItems(mergeUnmatched(items, run.unmatched, run.mappings));
  }
  const change = useAction((mappings: ImportValueMappings) => select({ mappings }));
  return (
    <>
      <Panel>
        {items.length ? (
          <UnmatchedValues
            items={items}
            mappings={run.mappings}
            onChange={(mappings) => editable && change.mutate(mappings)}
            stale={run.dryRunOutdated}
            onRecheck={() => start.mutate('dry-run')}
            rechecking={start.isPending || run.status === 'dry-running'}
            hint={t('mapping.hint')}
            remembered={
              <>
                {t('mapping.remembered')} <Anchor component={Link} to="/mp-feuer/mappings">{t('tabs.mappings')}</Anchor>
              </>
            }
            filterByKind
          />
        ) : (
          <Text size="sm">{t('mapping.none')}</Text>
        )}
        <Text size="xs" c="dimmed" mt="xs">{t('mapping.vehicles')}</Text>
      </Panel>
      <ActionBar>
        <Button variant="default" onClick={onBack}>{t('actions.back')}</Button>
        {editable && (
          <Button disabled={run.dryRunOutdated || run.status !== 'checked'} onClick={() => setConfirmApply(true)}>
            {t('actions.apply')}
          </Button>
        )}
      </ActionBar>
      <ApplyDialog run={run} opened={confirmApply} onClose={() => setConfirmApply(false)} />
    </>
  );
}

/** Progress bar and text of a dataset while the run works. */
function PartProgress({ run, dataset }: { run: MpFeuerRun; dataset: RunDataset }) {
  const { t, i18n } = useTranslation('mp-feuer');
  const current = run.progress?.dataset === dataset.profile;
  const done = dataset.parts > 0 && dataset.partsDone === dataset.parts && !current;
  const value = dataset.parts ? Math.round((100 * dataset.partsDone) / dataset.parts) : 0;
  const number = (n: number) => n.toLocaleString(i18n.language);
  return (
    <Stack gap={4}>
      <Group justify="space-between" gap="xs">
        {done || (dataset.parts > 0 && dataset.partsDone === dataset.parts) ? (
          <StatusBadge tone="done">{t('progress.done')}</StatusBadge>
        ) : current ? (
          <StatusBadge tone="highlight">{t('progress.running')}</StatusBadge>
        ) : (
          <StatusBadge>{t('progress.waiting')}</StatusBadge>
        )}
      </Group>
      <Progress value={value} aria-label={t('progress.label')} />
      <Text size="xs" c="dimmed">
        {current && run.progress
          ? t('progress.part', { part: run.progress.part, parts: run.progress.parts, done: number(run.progress.rowsDone), rows: number(run.progress.rows) })
          : dataset.parts
            ? t('progress.rows', { rows: number(dataset.rowCount), count: dataset.parts, duration: seconds(dataset.durationMs) })
            : ''}
      </Text>
    </Stack>
  );
}

function ProgressStep({ run }: { run: MpFeuerRun }) {
  const { t, i18n } = useTranslation('mp-feuer');
  const localized = useLocalized();
  const mayTransfer = useCan(TRANSFER);
  const [confirm, setConfirm] = useState(false);
  const client = useQueryClient();
  const cancel = useAction(() => send<MpFeuerRun>('POST', `mp-feuer/runs/${run.id}/cancel`), {
    onSuccess: (updated) => {
      client.setQueryData(keys.run(run.id), updated);
      setConfirm(false);
    },
  });
  const datasets = run.datasets.filter((d) => d.enabled && !d.locked);
  return (
    <>
      <Panel title={t('progress.title')} aside={<Text size="sm" c="dimmed">{t('progress.started', { date: formatDateTime(run.startedAt, i18n.language), user: run.createdBy })}</Text>}>
        <List listStyleType="none" spacing="md">
          {datasets.map((d) => (
            <List.Item key={d.profile} styles={{ itemWrapper: { width: '100%' }, itemLabel: { width: '100%' } }}>
              <Text fw={700} size="sm">{`${d.order / 10} ${localized(d.name)}`}</Text>
              <PartProgress run={run} dataset={d} />
            </List.Item>
          ))}
        </List>
        <Text size="xs" c="dimmed" mt="md">{t('progress.hint')}</Text>
        {run.cancelRequested && <Notice kind="warning">{t('progress.cancelling')}</Notice>}
      </Panel>
      <ActionBar info={t('progress.closeable')}>
        {mayTransfer && (
          <Button variant="default" disabled={run.cancelRequested} onClick={() => setConfirm(true)}>
            {t('progress.cancel')}
          </Button>
        )}
      </ActionBar>
      <ConfirmDialog
        opened={confirm}
        onClose={() => setConfirm(false)}
        title={t('progress.cancelTitle')}
        description={t('progress.cancelText')}
        confirmLabel={t('progress.cancelConfirm')}
        loading={cancel.isPending}
        onConfirm={() => cancel.mutate(undefined)}
      />
    </>
  );
}

function ResultStep({ run }: { run: MpFeuerRun }) {
  const { t, i18n } = useTranslation('mp-feuer');
  const localized = useLocalized();
  const navigate = useNavigate();
  const { data: report } = useReport(run.id, !isRunning(run));
  const counts = sumCounts(run.datasets.map((d) => d.counts));
  const duration = seconds(Date.parse(run.finishedAt ?? '') - Date.parse(run.startedAt ?? ''));
  const progress = run.progress;
  const stoppedAt = progress?.dataset ? `${localized(run.datasets.find((d) => d.profile === progress.dataset)?.name ?? { de: '', en: '' })}, ${t('result.part', { part: progress.part, parts: progress.parts })}` : '';
  const examples = (group: NonNullable<typeof report>['messages'][number]) =>
    group.examples.map((e) => t('result.example', { archive: e.archive, row: e.row.toLocaleString(i18n.language), label: e.label })).join(' · ') + (group.count > group.examples.length ? ' …' : '');

  return (
    <>
      {run.status === 'applied' && (
        <Notice kind={counts.error ? 'warning' : 'done'}>
          {t('result.applied', { date: formatDateTime(run.finishedAt, i18n.language), duration, errors: counts.error, remembered: report?.remembered ?? 0 })}
        </Notice>
      )}
      {run.status === 'applied' && (run.datasets.find((d) => d.profile === 'masterdata.persons')?.counts?.create ?? 0) > 0 && (
        <Notice kind="info" action={<Button size="xs" variant="outline" component={Link} to="/admin/privacy/information">{t('result.informAction')}</Button>}>
          {t('result.inform')}
        </Notice>
      )}
      {report?.messagesRemovedAt && <Notice kind="info">{t('result.messagesRemoved', { date: formatDateTime(report.messagesRemovedAt, i18n.language), days: MESSAGES_KEEP_DAYS })}</Notice>}
      {run.status === 'cancelled' && <Notice kind="warning">{t('result.cancelled', { at: stoppedAt })}</Notice>}
      {run.status === 'failed' && (
        <Notice kind="error">{run.error === 'mp-feuer.interrupted' ? t('result.interrupted', { at: stoppedAt }) : translateCode(run.error ?? 'mp-feuer.failed')}</Notice>
      )}
      <Panel
        title={t('result.datasets')}
        aside={
          <Group gap="xs">
            <Button size="xs" variant="default" component="a" href={apiUrl(`mp-feuer/runs/${run.id}/report`, { format: 'csv' })} download>
              {t('result.csv')}
            </Button>
          </Group>
        }
      >
        <DataTable
          rows={run.datasets.filter((d) => d.counts)}
          rowKey={(d) => d.profile}
          columns={[
            { key: 'name', header: t('datasets.dataset'), render: (d) => localized(d.name) },
            { key: 'create', header: t('result.create'), align: 'right', render: (d) => d.counts?.create ?? 0 },
            { key: 'update', header: t('result.update'), align: 'right', render: (d) => d.counts?.update ?? 0 },
            { key: 'unchanged', header: t('result.unchanged'), align: 'right', render: (d) => d.counts?.unchanged ?? 0 },
            { key: 'error', header: t('result.error'), align: 'right', render: (d) => (d.counts?.error ? <b>{d.counts.error}</b> : 0) },
          ]}
        />
      </Panel>
      <Panel title={t('result.messages')}>
        <DataTable
          rows={report?.messages ?? []}
          rowKey={(m) => `${m.code}|${m.value}|${m.error}`}
          empty={t('result.noMessages')}
          highlight={(m) => m.error}
          columns={[
            {
              key: 'message',
              header: t('result.message'),
              render: (m) => (
                <Stack gap={0}>
                  <Text size="sm">
                    {m.error && <b>{t('result.errorPrefix')} </b>}
                    {translateCode(m.code, m.params ?? {})}
                  </Text>
                  <Text size="xs" c="dimmed" translate="no">{m.code}</Text>
                </Stack>
              ),
            },
            { key: 'value', header: t('result.value'), render: (m) => <span translate="no">{m.value ?? '–'}</span> },
            { key: 'count', header: t('result.count'), align: 'right', render: (m) => m.count },
            { key: 'examples', header: t('result.examples'), render: examples },
          ]}
        />
        <Text size="xs" c="dimmed" mt="xs">{t('result.csvHint')}</Text>
      </Panel>
      <ActionBar>
        <Button variant="default" onClick={() => navigate('/mp-feuer/history')}>{t('result.toHistory')}</Button>
        <Button onClick={() => navigate('/mp-feuer/overview')}>{t('result.done')}</Button>
      </ActionBar>
    </>
  );
}
