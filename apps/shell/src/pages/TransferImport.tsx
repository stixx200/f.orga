import { Button, Checkbox, FileInput, Group, Select, Stack, Table, Text } from '@mantine/core';
import { IconUpload } from '@tabler/icons-react';
import { useState } from 'react';
import type { ImportProfileInfo, ImportResult, ImportUnmatched, ImportValueMappings, TransferArchiveInfo, TransferUpload } from '@forga/core-contracts';
import { send, uploadFiles, useLocalized, useTranslation } from '@forga/web-sdk';
import { Notice, Panel, StatusBadge, useAction } from '@forga/web-ui';
import { useDepartments } from './admin/data';
import { ResultView } from './ImportResult';
import { mergeUnmatched, UnmatchedValues } from './ImportUnmatched';

type Stage = 'open' | 'checked' | 'applied' | 'skipped';

/** "Abt. Musterstadt" ↔ "Abteilung Musterstadt", "Altersabt. Ahornfeld" ↔ "Altersabteilung Ahornfeld". */
const unitKey = (text: string) =>
  text.toLowerCase().replace(/abteilung/g, 'abt').replace(/ue/g, 'ü').replace(/[^a-z0-9äöüß]/g, '');

function suggestDepartment(archive: TransferArchiveInfo, departments: { name: string }[]): string | null {
  const wanted = unitKey(archive.label);
  return departments.find((d) => unitKey(d.name) === wanted)?.name ?? null;
}

/**
 * Data transfer from MP-Feuer: upload all transfer archives (`MPTRA_*.zip`), assign them to departments and import
 * profile by profile in the given order, each with a check first.
 */
export function TransferImport({ profiles }: { profiles: ImportProfileInfo[] }) {
  const { t } = useTranslation('shell');
  const localized = useLocalized();
  const { data: departments = [] } = useDepartments();
  const [files, setFiles] = useState<File[]>([]);
  const [transfer, setTransfer] = useState<TransferUpload | null>(null);
  const [assigned, setAssigned] = useState<Record<string, string | null>>({});
  const [options, setOptions] = useState<Record<string, Record<string, boolean>>>({});
  const [stages, setStages] = useState<Record<string, Stage>>({});
  const [results, setResults] = useState<Record<string, ImportResult>>({});
  // Entries chosen for unknown names apply to all archives and all later steps of the transfer.
  const [mappings, setMappings] = useState<ImportValueMappings>({});
  const [unmatched, setUnmatched] = useState<Record<string, ImportUnmatched[]>>({});
  const [stale, setStale] = useState<Record<string, boolean>>({});

  const uploadAll = useAction((selected: File[]) => uploadFiles<TransferUpload>('core/imports/transfers', selected), {
    onSuccess: (u) => {
      setTransfer(u);
      setAssigned(Object.fromEntries(u.archives.map((a) => [a.key, suggestDepartment(a, departments)])));
      setOptions(Object.fromEntries(u.datasets.map((d) => [d.profile, Object.fromEntries((profiles.find((p) => p.id === d.profile)?.options ?? []).map((o) => [o.key, o.default]))])));
      setStages({});
      setResults({});
      setMappings({});
      setUnmatched({});
      setStale({});
    },
  });
  const request = (profile: string) => ({ profile, departments: assigned, options: options[profile] ?? {}, mappings });
  const changeMappings = (profile: string, changed: ImportValueMappings) => {
    setMappings(changed);
    setStale((s) => ({ ...s, [profile]: true }));
    // The check no longer matches the assignment: check again before importing.
    setStages((s) => ({ ...s, [profile]: s[profile] === 'checked' ? 'open' : (s[profile] ?? 'open') }));
  };
  const run = useAction(
    ({ profile, apply }: { profile: string; apply: boolean }) =>
      send<ImportResult>('POST', `core/imports/transfers/${transfer!.id}/${apply ? 'apply' : 'preview'}`, request(profile)),
    {
      onSuccess: (result, { profile, apply }) => {
        setResults((r) => ({ ...r, [profile]: result }));
        setStages((s) => ({ ...s, [profile]: apply ? 'applied' : 'checked' }));
        setUnmatched((u) => ({ ...u, [profile]: mergeUnmatched(u[profile] ?? [], result.unmatched, mappings) }));
        setStale((s) => ({ ...s, [profile]: false }));
      },
    },
  );
  const discard = useAction(() => send<void>('DELETE', `core/imports/transfers/${transfer!.id}`), {
    onSuccess: () => {
      setTransfer(null);
      setFiles([]);
    },
  });

  if (!transfer) {
    return (
      <Panel maw={720}>
        <Stack gap="md">
          <Text size="sm">{t('imports.transfer.intro')}</Text>
          <FileInput
            label={t('imports.transfer.files')}
            description={t('imports.transfer.filesHint')}
            accept=".zip"
            multiple
            value={files}
            onChange={setFiles}
            leftSection={<IconUpload size={18} />}
            clearable
          />
          <Group justify="flex-end">
            <Button disabled={!files.length} loading={uploadAll.isPending} onClick={() => uploadAll.mutate(files)}>{t('imports.transfer.read')}</Button>
          </Group>
        </Stack>
      </Panel>
    );
  }

  // Only the first open dataset can be imported, so persons exist before their incidents.
  const next = transfer.datasets.find((d) => !['applied', 'skipped'].includes(stages[d.profile] ?? 'open'))?.profile;
  const pending = (profile: string) => run.isPending && run.variables?.profile === profile;

  return (
    <Stack gap="lg">
      <Panel title={t('imports.transfer.archives')}>
        <Text size="sm" mb="md">{t('imports.transfer.archivesHint')}</Text>
        <Table withTableBorder striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('imports.transfer.archive')}</Table.Th>
              <Table.Th>{t('imports.transfer.department')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {transfer.archives.map((archive) => (
              <Table.Tr key={archive.key}>
                <Table.Td>
                  <Text size="sm" fw={700}>{archive.label}</Text>
                  <Text size="xs" c="dimmed">{archive.fileName}</Text>
                </Table.Td>
                <Table.Td>
                  <Select
                    aria-label={t('imports.transfer.department')}
                    placeholder={t('imports.transfer.asNamed', { name: archive.label })}
                    data={departments.map((d) => ({ value: d.name, label: d.name }))}
                    value={assigned[archive.key] ?? null}
                    onChange={(value) => setAssigned((a) => ({ ...a, [archive.key]: value }))}
                    clearable
                    searchable
                  />
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Panel>

      {transfer.datasets.map((dataset, index) => {
        const profile = profiles.find((p) => p.id === dataset.profile);
        const stage = stages[dataset.profile] ?? 'open';
        const result = results[dataset.profile];
        if (!profile) return null;
        // Choosing entries for unknown names replaces options like creating them blindly.
        const profileOptions = profile.options.filter((o) => o.transfer !== false);
        const open = stage !== 'applied' && stage !== 'skipped';
        return (
          <Panel
            key={dataset.profile}
            title={`${index + 1}. ${localized(profile.name)}`}
            aside={<StatusBadge tone={stage === 'applied' ? 'done' : stage === 'checked' ? 'primary' : 'neutral'}>{t(`imports.transfer.stages.${stage}`)}</StatusBadge>}
          >
            <Stack gap="md">
              <Text size="sm">{t('imports.transfer.rows', { count: dataset.rowCount })}{profile.description ? ` · ${localized(profile.description)}` : ''}</Text>
              {profileOptions.length > 0 && stage !== 'applied' && (
                <Stack gap="xs">
                  {profileOptions.map((o) => (
                    <Checkbox
                      key={o.key}
                      label={localized(o.label)}
                      checked={options[dataset.profile]?.[o.key] ?? false}
                      onChange={(e) => {
                        // Read before the update: React calls the updater later, when `currentTarget` is gone.
                        const checked = e.currentTarget.checked;
                        setOptions((v) => ({ ...v, [dataset.profile]: { ...v[dataset.profile], [o.key]: checked } }));
                      }}
                    />
                  ))}
                </Stack>
              )}
              {result && <ResultView result={result} />}
              {open && (
                <UnmatchedValues
                  items={unmatched[dataset.profile] ?? []}
                  mappings={mappings}
                  onChange={(changed) => changeMappings(dataset.profile, changed)}
                  stale={!!stale[dataset.profile]}
                  onRecheck={() => run.mutate({ profile: dataset.profile, apply: false })}
                  rechecking={pending(dataset.profile) && !run.variables?.apply}
                  transfer
                />
              )}
              {open && (
                <Group justify="flex-end">
                  <Button variant="default" onClick={() => setStages((s) => ({ ...s, [dataset.profile]: 'skipped' }))}>{t('imports.transfer.skip')}</Button>
                  <Button variant={stage === 'checked' ? 'default' : 'filled'} loading={pending(dataset.profile) && !run.variables?.apply} disabled={run.isPending} onClick={() => run.mutate({ profile: dataset.profile, apply: false })}>
                    {t('imports.check')}
                  </Button>
                  {stage === 'checked' && (
                    <Button loading={pending(dataset.profile) && run.variables?.apply} disabled={run.isPending || next !== dataset.profile} onClick={() => run.mutate({ profile: dataset.profile, apply: true })}>
                      {t('imports.apply', { count: (result?.counts.create ?? 0) + (result?.counts.update ?? 0) })}
                    </Button>
                  )}
                </Group>
              )}
              {stage === 'checked' && next !== dataset.profile && <Notice kind="info">{t('imports.transfer.order')}</Notice>}
            </Stack>
          </Panel>
        );
      })}

      <Group justify="flex-end">
        <Button variant="default" loading={discard.isPending} onClick={() => discard.mutate(undefined)}>
          {next ? t('imports.transfer.discard') : t('imports.transfer.finish')}
        </Button>
      </Group>
    </Stack>
  );
}
