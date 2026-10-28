import { Button, Checkbox, Group, Select, Stack, Text, TextInput } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { RememberedMapping } from '@forga/core-contracts';
import { api, formatDate, send, useLocalized, useTranslation } from '@forga/web-sdk';
import { DataTable } from './DataTable';
import { ConfirmDialog } from './Dialogs';
import { Notice } from './Notice';
import { StatusBadge } from './StatusBadge';
import { useAction } from './useAction';

/**
 * A list of remembered mappings (table import: `core/imports/mappings`, module MP-Feuer: `mp-feuer/mappings`) with
 * search, kind filter, the state of the targets and deleting.
 */
export function RememberedMappings({ path, deletable, showProfile = false }: { path: string; deletable: boolean; showProfile?: boolean }) {
  const { t, i18n } = useTranslation('common');
  const localized = useLocalized();
  const queryKey = ['remembered-mappings', path];
  const { data: mappings = [], isLoading } = useQuery({ queryKey, queryFn: () => api<RememberedMapping[]>(path) });
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<string | null>(null);
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [deleting, setDeleting] = useState<RememberedMapping | null>(null);
  const remove = useAction((mapping: RememberedMapping) => send<void>('DELETE', `${path}/${mapping.id}`), {
    invalidate: [queryKey],
    success: t('mappings.deleted'),
    onSuccess: () => setDeleting(null),
  });

  const kindName = (m: RememberedMapping) => (m.kindName ? localized(m.kindName) : m.kind);
  const target = (m: RememberedMapping) => (m.targetName ? localized(m.targetName) : m.key);
  const kinds = [...new Map(mappings.map((m) => [m.kind, kindName(m)])).entries()].map(([value, label]) => ({ value, label }));
  const problems = mappings.filter((m) => m.targetState !== 'active');
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = mappings.filter(
    (m) => (!kind || m.kind === kind) && (!problemsOnly || m.targetState !== 'active') && words.every((w) => [m.value, target(m)].some((text) => text.toLowerCase().includes(w))),
  );

  return (
    <Stack gap="md">
      <Group align="end" gap="md">
        <TextInput label={t('mappings.search')} placeholder={t('mappings.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.currentTarget.value)} miw={220} />
        <Select label={t('mappings.kind')} placeholder={t('mappings.allKinds')} data={kinds} value={kind} onChange={setKind} clearable />
        <Checkbox label={t('mappings.problemsOnly', { count: problems.length })} checked={problemsOnly} onChange={(e) => setProblemsOnly(e.currentTarget.checked)} mb={8} />
      </Group>
      <DataTable
        rows={shown}
        rowKey={(m) => m.id}
        empty={isLoading ? undefined : t('mappings.empty')}
        columns={[
          { key: 'value', header: t('mappings.value'), render: (m) => <Text size="sm" fw={700} translate="no">{m.value}</Text> },
          { key: 'kind', header: t('mappings.kind'), render: kindName },
          {
            key: 'target',
            header: t('mappings.target'),
            render: (m) => (
              <Group gap={6}>
                <Text size="sm">{target(m)}</Text>
                {m.targetState === 'deleted' && <StatusBadge tone="error">{t('mappings.targetDeleted')}</StatusBadge>}
                {m.targetState === 'inactive' && <StatusBadge tone="warning">{t('mappings.targetInactive')}</StatusBadge>}
              </Group>
            ),
          },
          ...(showProfile ? [{ key: 'profile', header: t('mappings.profile'), render: (m: RememberedMapping) => (m.profileName ? localized(m.profileName) : m.profile) }] : []),
          { key: 'lastUsedAt', header: t('mappings.lastUsed'), render: (m) => formatDate(m.lastUsedAt, i18n.language) },
          { key: 'createdBy', header: t('mappings.createdBy'), render: (m) => m.createdBy ?? '–' },
          ...(deletable
            ? [{ key: 'actions', header: '', render: (m: RememberedMapping) => <Button size="xs" variant="default" onClick={() => setDeleting(m)}>{t('mappings.delete')}</Button> }]
            : []),
        ]}
      />
      {problems.length > 0 && <Notice kind="warning">{t('mappings.problems', { count: problems.length })}</Notice>}
      <ConfirmDialog
        opened={!!deleting}
        onClose={() => setDeleting(null)}
        title={t('mappings.deleteTitle')}
        description={deleting ? t('mappings.deleteText', { value: deleting.value, target: target(deleting) }) : undefined}
        confirmLabel={t('actions.delete')}
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </Stack>
  );
}
