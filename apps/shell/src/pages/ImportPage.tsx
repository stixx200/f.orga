import { Button, Checkbox, Divider, FileInput, Group, Radio, Select, Stack, Stepper, Table, Tabs, Text, TextInput } from '@mantine/core';
import { IconCalendar, IconUpload } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ImportMapping, ImportProfileInfo, ImportRememberedUrl, ImportResult, ImportUnmatched, ImportUpload, ImportUrlRequest, ImportValueMappings } from '@forga/core-contracts';
import { api, can, extensionsOf, send, upload, useLocalized, useSession, useTranslation } from '@forga/web-sdk';
import { EmptyState, mergeUnmatched, Notice, PageHeader, Panel, RememberedMappings, UnmatchedValues, useAction } from '@forga/web-ui';
import { ResultView } from './ImportResult';

/** Share of the profile's fields the file covers; the best fitting profile is suggested first. */
const fit = (profile: ImportProfileInfo, file: ImportUpload) =>
  Object.values(file.suggestions[profile.id] ?? {}).filter(Boolean).length / Math.max(1, profile.fields.length);

/**
 * Table import: upload a file (or load a calendar address), choose what it contains, map the columns, check the preview,
 * import. A second tab lists the mappings the table import remembered. Active modules may add a notice (extension point
 * `core.imports.notice`), e.g. MP-Feuer for its transfer files.
 */
export function ImportPage() {
  const { t } = useTranslation('shell');
  const { t: common } = useTranslation('common');
  const localized = useLocalized();
  const { data: profiles = [], isLoading } = useQuery({ queryKey: ['core', 'imports', 'profiles'], queryFn: () => api<ImportProfileInfo[]>('core/imports/profiles') });
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [uploaded, setUploaded] = useState<ImportUpload | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [mapping, setMapping] = useState<ImportMapping>({});
  const [options, setOptions] = useState<Record<string, boolean>>({});
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  // Entries chosen for unknown names, kept for the whole upload.
  const [mappings, setMappings] = useState<ImportValueMappings>({});
  const [unmatched, setUnmatched] = useState<Record<string, ImportUnmatched[]>>({});
  const [stale, setStale] = useState(false);
  const profile = profiles.find((p) => p.id === profileId);
  const session = useSession().data;
  const notices = extensionsOf('core.imports.notice').filter((e) => !e.permission || can(session, e.permission));
  const queryClient = useQueryClient();
  const rememberedKey = ['core', 'imports', 'url'];
  // The full address is never sent back (it may contain a secret token), only scheme and host.
  const { data: rememberedUrl } = useQuery({ queryKey: rememberedKey, queryFn: () => api<ImportRememberedUrl>('core/imports/url'), enabled: profiles.length > 0 });
  const [url, setUrl] = useState('');
  const [remember, setRemember] = useState(true);

  const chooseProfile = (id: string, source: ImportUpload) => {
    const chosen = profiles.find((p) => p.id === id);
    setProfileId(id);
    setMapping(source.suggestions[id] ?? {});
    setOptions(Object.fromEntries((chosen?.options ?? []).map((o) => [o.key, o.default])));
  };

  const received = (u: ImportUpload) => {
    setUploaded(u);
    setMappings({});
    setUnmatched({});
    const best = profiles.toSorted((a, b) => fit(b, u) - fit(a, u))[0];
    if (best) chooseProfile(best.id, u);
    setStep(1);
  };
  const uploadFile = useAction((selected: File) => upload<ImportUpload>('core/imports', selected), { onSuccess: received });
  // Without `url` the server loads the remembered address.
  const loadUrl = useAction((body: ImportUrlRequest) => send<ImportUpload>('POST', 'core/imports/url', body), {
    invalidate: [rememberedKey],
    onSuccess: (u) => {
      setUrl('');
      received(u);
    },
  });
  const forgetUrl = useAction(() => send<void>('DELETE', 'core/imports/url'), {
    success: t('imports.url.forgotten'),
    onSuccess: () => queryClient.setQueryData<ImportRememberedUrl>(rememberedKey, (r) => r && { ...r, remembered: null }),
  });
  const request = () => ({ profile: profileId!, mapping, options, mappings });
  const check = useAction(() => send<ImportResult>('POST', `core/imports/${uploaded!.id}/preview`, request()), {
    onSuccess: (r) => {
      setUnmatched((u) => ({ ...u, [profileId!]: mergeUnmatched(u[profileId!] ?? [], r.unmatched, mappings) }));
      setStale(false);
      setPreview(r);
      setStep(3);
    },
  });
  const apply = useAction(() => send<ImportResult>('POST', `core/imports/${uploaded!.id}/apply`, request()), {
    success: t('imports.done'),
    onSuccess: (r) => {
      setResult(r);
      setStep(4);
    },
  });
  const restart = () => {
    setStep(0);
    setFile(null);
    setUploaded(null);
    setPreview(null);
    setResult(null);
  };
  const missingRequired = profile?.fields.filter((f) => f.required && !mapping[f.key]) ?? [];
  const sampleOf = (column: string | null | undefined) => {
    if (!column || !uploaded) return '';
    const index = uploaded.headers.indexOf(column);
    return uploaded.sample.map((row) => row[index]).filter(Boolean).slice(0, 2).join(' · ');
  };

  if (!isLoading && !profiles.length) return <EmptyState title={t('imports.none')} />;

  return (
    <Stack gap="lg">
      <PageHeader title={t('nav.import')} subtitle={t('imports.subtitle')} />
      {notices.map(({ module, component: ImportNotice }) => (
        <ImportNotice key={module} />
      ))}
      <Tabs defaultValue="file" keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="file">{t('imports.tabs.file')}</Tabs.Tab>
          <Tabs.Tab value="mappings">{t('imports.tabs.mappings')}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="mappings">
          <Stack gap="md">
            <Text size="sm">{t('imports.mappingsIntro')}</Text>
            <RememberedMappings path="core/imports/mappings" deletable showProfile />
          </Stack>
        </Tabs.Panel>
        <Tabs.Panel value="file">
      <Stepper active={step} onStepClick={(s) => s < step && step < 4 && setStep(s)} size="sm">
        <Stepper.Step label={t('imports.steps.file')}>
          <Panel maw={720}>
            <Stack gap="md">
              <FileInput
                label={t('imports.file')}
                description={t('imports.fileHint')}
                accept=".xlsx,.csv,.txt,.ics"
                value={file}
                onChange={setFile}
                leftSection={<IconUpload size={18} />}
                clearable
              />
              <Group justify="flex-end">
                <Button disabled={!file} loading={uploadFile.isPending} onClick={() => file && uploadFile.mutate(file)}>{common('actions.next')}</Button>
              </Group>
              <Divider label={t('imports.url.or')} />
              <Text fw={700} size="sm">{t('imports.url.title')}</Text>
              {rememberedUrl?.remembered && (
                <Group justify="space-between" gap="xs">
                  <Text size="sm">{t('imports.url.remembered', { address: rememberedUrl.remembered.display })}</Text>
                  <Group gap="xs">
                    <Button variant="subtle" loading={forgetUrl.isPending} onClick={() => forgetUrl.mutate(undefined)}>{t('imports.url.forget')}</Button>
                    <Button variant="light" leftSection={<IconCalendar size={18} />} loading={loadUrl.isPending && !loadUrl.variables?.url} onClick={() => loadUrl.mutate({})}>{t('imports.url.reload')}</Button>
                  </Group>
                </Group>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (url.trim()) loadUrl.mutate({ url: url.trim(), remember: Boolean(rememberedUrl?.canRemember) && remember });
                }}
              >
                <Stack gap="xs">
                  <Group align="flex-end" gap="xs" wrap="nowrap">
                    <TextInput
                      flex={1}
                      label={t('imports.url.address')}
                      description={t('imports.url.hint')}
                      placeholder="webcal://…"
                      value={url}
                      onChange={(e) => setUrl(e.currentTarget.value)}
                      leftSection={<IconCalendar size={18} />}
                      autoComplete="off"
                    />
                    <Button type="submit" disabled={!url.trim()} loading={loadUrl.isPending && Boolean(loadUrl.variables?.url)}>{t('imports.url.load')}</Button>
                  </Group>
                  {rememberedUrl?.canRemember && (
                    <Checkbox label={t('imports.url.remember')} checked={remember} onChange={(e) => setRemember(e.currentTarget.checked)} />
                  )}
                </Stack>
              </form>
            </Stack>
          </Panel>
        </Stepper.Step>
        <Stepper.Step label={t('imports.steps.profile')}>
          {uploaded && (
            <Panel maw={880} title={t('imports.fileSummary', { name: uploaded.fileName, count: uploaded.rowCount })}>
              <Radio.Group value={profileId} onChange={(id) => chooseProfile(id, uploaded)} label={t('imports.profile')}>
                <Stack gap="sm" mt="xs">
                  {profiles.map((p) => (
                    <Radio key={p.id} value={p.id} label={<Text fw={700} size="sm">{localized(p.name)}</Text>} description={p.description ? localized(p.description) : undefined} />
                  ))}
                </Stack>
              </Radio.Group>
              <Group justify="flex-end" mt="md">
                <Button variant="default" onClick={() => setStep(0)}>{common('actions.back')}</Button>
                <Button disabled={!profileId} onClick={() => setStep(2)}>{common('actions.next')}</Button>
              </Group>
            </Panel>
          )}
        </Stepper.Step>
        <Stepper.Step label={t('imports.steps.mapping')}>
          {uploaded && profile && (
            <Panel title={t('imports.mappingTitle', { name: localized(profile.name) })}>
              <Text size="sm" mb="md">{t('imports.mappingHint')}</Text>
              <Table withTableBorder striped>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t('imports.field')}</Table.Th>
                    <Table.Th>{t('imports.column')}</Table.Th>
                    <Table.Th visibleFrom="sm">{t('imports.sample')}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {profile.fields.map((field) => (
                    <Table.Tr key={field.key}>
                      <Table.Td>
                        <Text size="sm" fw={field.required ? 700 : 400}>{localized(field.label)}{field.required ? ' *' : ''}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Select
                          aria-label={localized(field.label)}
                          placeholder={t('imports.notImported')}
                          data={uploaded.headers.map((h) => ({ value: h, label: h }))}
                          value={mapping[field.key] ?? null}
                          onChange={(value) => setMapping((m) => ({ ...m, [field.key]: value }))}
                          clearable
                          searchable
                        />
                      </Table.Td>
                      <Table.Td visibleFrom="sm"><Text size="xs" c="dimmed">{sampleOf(mapping[field.key])}</Text></Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
              {profile.options.length > 0 && (
                <Stack gap="xs" mt="md">
                  {profile.options.map((o) => (
                    <Checkbox key={o.key} label={localized(o.label)} checked={options[o.key] ?? false} onChange={(e) => {
                      const checked = e.currentTarget.checked;
                      setOptions((v) => ({ ...v, [o.key]: checked }));
                    }} />
                  ))}
                </Stack>
              )}
              {missingRequired.length > 0 && (
                <Notice kind="warning">{t('imports.requiredMissing', { fields: missingRequired.map((f) => localized(f.label)).join(', ') })}</Notice>
              )}
              <Group justify="flex-end" mt="md">
                <Button variant="default" onClick={() => setStep(1)}>{common('actions.back')}</Button>
                <Button disabled={missingRequired.length > 0} loading={check.isPending} onClick={() => check.mutate(undefined)}>{t('imports.check')}</Button>
              </Group>
            </Panel>
          )}
        </Stepper.Step>
        <Stepper.Step label={t('imports.steps.preview')}>
          {preview && (
            <Stack gap="md">
              <Notice kind={preview.counts.error ? 'warning' : 'info'}>{t(preview.counts.error ? 'imports.previewErrors' : 'imports.previewOk')}</Notice>
              <ResultView result={preview} />
              {(unmatched[profileId!] ?? []).length > 0 && (
                <Panel>
                  <UnmatchedValues
                    items={unmatched[profileId!] ?? []}
                    mappings={mappings}
                    onChange={(next) => {
                      setMappings(next);
                      setStale(true);
                    }}
                    stale={stale}
                    onRecheck={() => check.mutate(undefined)}
                    rechecking={check.isPending}
                  />
                </Panel>
              )}
              <Group justify="flex-end">
                <Button variant="default" onClick={() => setStep(2)}>{common('actions.back')}</Button>
                <Button loading={apply.isPending} disabled={stale} onClick={() => apply.mutate(undefined)}>{t('imports.apply', { count: (preview.counts.create ?? 0) + (preview.counts.update ?? 0) })}</Button>
              </Group>
            </Stack>
          )}
        </Stepper.Step>
        <Stepper.Completed>
          {result && (
            <Stack gap="md">
              <Notice kind="done">{t('imports.done')}</Notice>
              <ResultView result={result} />
              <Group justify="flex-end">
                <Button onClick={restart}>{t('imports.another')}</Button>
              </Group>
            </Stack>
          )}
        </Stepper.Completed>
      </Stepper>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
