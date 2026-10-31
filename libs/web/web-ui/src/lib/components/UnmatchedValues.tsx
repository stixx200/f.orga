import { Button, Chip, Group, Select, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import type { ImportLookupEntry, ImportLookupInfo, ImportUnmatched, ImportValueMappings } from '@forga/core-contracts';
import { api, send, useLocalized, useTranslation } from '@forga/web-sdk';
import { Notice } from './Notice';
import { treeOptions } from '../tree-options';
import { useAction } from './useAction';

const LOOKUPS = ['core', 'imports', 'lookups'] as const;

/** Key for a new entry from its name, e.g. "Motorsägen-Grundlehrgang" → `motorsaegen-grundlehrgang`. */
export function slugKey(name: string): string {
  return name
    .toLowerCase()
    .replaceAll('ä', 'ae')
    .replaceAll('ö', 'oe')
    .replaceAll('ü', 'ue')
    .replaceAll('ß', 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function setMapping(mappings: ImportValueMappings, kind: string, value: string, key: string | null): ImportValueMappings {
  const { [value]: _old, ...rest } = mappings[kind] ?? {};
  return { ...mappings, [kind]: key ? { ...rest, [value]: key } : rest };
}

const same = (a: ImportUnmatched, b: ImportUnmatched) => a.kind === b.kind && a.value === b.value;

/**
 * Values to show after a check: the ones still unmatched (with the new count) and the ones the user already assigned,
 * so the assignment can be changed again.
 */
export function mergeUnmatched(previous: readonly ImportUnmatched[], current: readonly ImportUnmatched[], mappings: ImportValueMappings): ImportUnmatched[] {
  const assigned = previous.filter((p) => mappings[p.kind]?.[p.value] && !current.some((c) => same(c, p)));
  return [...current, ...assigned].toSorted((a, b) => a.kind.localeCompare(b.kind) || a.value.localeCompare(b.value));
}

interface Props {
  items: readonly ImportUnmatched[];
  mappings: ImportValueMappings;
  onChange: (mappings: ImportValueMappings) => void;
  /** The assignment changed since the last check. */
  stale: boolean;
  onRecheck: () => void;
  rechecking: boolean;
  /** Text above the table; default: the hint of the table import. */
  hint?: ReactNode;
  /** Where the assignment is remembered; default: the remembered mappings of the table import. */
  remembered?: ReactNode;
  /** Chips to filter by kind. */
  filterByKind?: boolean;
}

/**
 * Names of an import that match no entry: choose an existing entry or an extra target, create one, or leave them
 * unassigned. Shared by the table import and the module MP-Feuer.
 */
export function UnmatchedValues({ items, mappings, onChange, stale, onRecheck, rechecking, hint, remembered, filterByKind }: Props) {
  const { t } = useTranslation('common');
  const localized = useLocalized();
  const [kind, setKind] = useState<string>('');
  const { data: lookups = [] } = useQuery({ queryKey: LOOKUPS, queryFn: () => api<ImportLookupInfo[]>('core/imports/lookups') });
  if (!items.length) return null;
  const kinds = [...new Set(items.map((i) => i.kind))];
  const shown = items.filter((i) => !kind || i.kind === kind);
  const assigned = items.filter((i) => mappings[i.kind]?.[i.value]).length;
  const lookupName = (k: string) => {
    const lookup = lookups.find((l) => l.kind === k);
    return lookup ? localized(lookup.name) : k;
  };
  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Title order={4}>{t('unmatched.title')}</Title>
        {filterByKind && kinds.length > 1 && (
          <Chip.Group value={kind} onChange={(value) => setKind(value as string)}>
            <Group gap={6} role="group" aria-label={t('unmatched.filter')}>
              <Chip value="" size="xs">{t('unmatched.all', { count: items.length })}</Chip>
              {kinds.map((k) => (
                <Chip key={k} value={k} size="xs">{`${lookupName(k)} (${items.filter((i) => i.kind === k).length})`}</Chip>
              ))}
            </Group>
          </Chip.Group>
        )}
      </Group>
      <Text size="sm">{hint ?? t('unmatched.hint')}</Text>
      <Text size="sm" c="dimmed">{remembered ?? t('unmatched.remembered')}</Text>
      <Table withTableBorder striped>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t('unmatched.value')}</Table.Th>
            <Table.Th visibleFrom="sm">{t('unmatched.kind')}</Table.Th>
            <Table.Th>{t('unmatched.entry')}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {shown.map((item) => (
            <UnmatchedRow
              key={`${item.kind}/${item.value}`}
              item={item}
              lookup={lookups.find((l) => l.kind === item.kind)}
              selected={mappings[item.kind]?.[item.value] ?? null}
              onSelect={(key) => onChange(setMapping(mappings, item.kind, item.value, key))}
            />
          ))}
        </Table.Tbody>
      </Table>
      {stale && <Notice kind="warning">{t('unmatched.stale')}</Notice>}
      <Group justify="flex-end">
        <Text size="sm" c="dimmed">{t('unmatched.assigned', { count: assigned, total: items.length })}</Text>
        <Button variant={stale ? 'filled' : 'default'} loading={rechecking} onClick={onRecheck}>{t('unmatched.recheck')}</Button>
      </Group>
    </Stack>
  );
}

function UnmatchedRow({ item, lookup, selected, onSelect }: { item: ImportUnmatched; lookup?: ImportLookupInfo; selected: string | null; onSelect: (key: string | null) => void }) {
  const { t } = useTranslation('common');
  const localized = useLocalized();
  const [creating, setCreating] = useState<{ name: string; key: string; categoryKey: string | null } | null>(null);
  const entriesKey = [...LOOKUPS, item.kind];
  const { data: entries = [] } = useQuery({ queryKey: entriesKey, queryFn: () => api<ImportLookupEntry[]>(`core/imports/lookups/${encodeURIComponent(item.kind)}`), enabled: !!lookup });
  const categoryKind = lookup?.createCategoryKind ?? null;
  const { data: categories = [] } = useQuery({
    queryKey: [...LOOKUPS, categoryKind],
    queryFn: () => api<ImportLookupEntry[]>(`core/imports/lookups/${encodeURIComponent(categoryKind!)}`),
    enabled: Boolean(categoryKind) && creating !== null,
  });
  const deriveKey = (name: string) => (lookup?.keyFormat === 'text' ? name.trim().slice(0, 40) : slugKey(name));
  const label = item.value.trim() ? item.value : t('unmatched.empty');
  const create = useAction((input: { name: string; key: string; categoryKey?: string }) => send<ImportLookupEntry>('POST', `core/imports/lookups/${encodeURIComponent(item.kind)}`, input), {
    success: t('unmatched.created'),
    invalidate: [entriesKey],
    onSuccess: (entry) => {
      setCreating(null);
      onSelect(entry.key);
    },
  });

  return (
    <Table.Tr>
      <Table.Td>
        <Text size="sm" fw={700} translate={item.value.trim() ? 'no' : undefined}>{label}</Text>
        <Text size="xs" c="dimmed">{t('unmatched.count', { count: item.count })}</Text>
      </Table.Td>
      <Table.Td visibleFrom="sm"><Text size="sm">{lookup ? localized(lookup.name) : item.kind}</Text></Table.Td>
      <Table.Td>
        {creating ? (
          <Stack gap="xs">
            <TextInput label={t('unmatched.name')} value={creating.name} onChange={(e) => {
              const name = e.currentTarget.value;
              setCreating((c) => c && { ...c, name, key: c.key === deriveKey(c.name) ? deriveKey(name) : c.key });
            }} />
            {categoryKind && (
              <Select
                label={t('unmatched.category')}
                description={t('unmatched.categoryHint')}
                data={treeOptions(categories, (e) => localized(e.name))}
                value={creating.categoryKey}
                onChange={(value) => setCreating((c) => c && { ...c, categoryKey: value })}
                searchable
                required
              />
            )}
            <TextInput label={t('unmatched.key')} description={t('unmatched.keyHint')} value={creating.key} onChange={(e) => {
              const key = e.currentTarget.value;
              setCreating((c) => c && { ...c, key });
            }} />
            <Group gap="xs" justify="flex-end">
              <Button size="xs" variant="default" onClick={() => setCreating(null)}>{t('actions.cancel')}</Button>
              <Button size="xs" loading={create.isPending} disabled={!creating.name.trim() || !creating.key.trim() || (Boolean(categoryKind) && !creating.categoryKey)} onClick={() => create.mutate({ name: creating.name, key: creating.key, ...(creating.categoryKey ? { categoryKey: creating.categoryKey } : {}) })}>{t('unmatched.save')}</Button>
            </Group>
          </Stack>
        ) : (
          <Group gap="xs" wrap="nowrap" align="flex-start">
            <Select
              style={{ flex: 1 }}
              aria-label={t('unmatched.entryFor', { value: label })}
              placeholder={t('unmatched.ignore')}
              data={entries.map((e) => ({ value: e.key, label: localized(e.name) }))}
              value={selected}
              onChange={onSelect}
              disabled={!lookup}
              clearable
              searchable
            />
            {lookup?.creatable && (
              <Button variant="default" leftSection={<IconPlus size={16} />} onClick={() => setCreating({ name: item.value, key: deriveKey(item.value), categoryKey: null })}>
                {t('unmatched.create')}
              </Button>
            )}
          </Group>
        )}
      </Table.Td>
    </Table.Tr>
  );
}
