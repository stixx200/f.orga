import { Button, Group, Select, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { ImportLookupEntry, ImportLookupInfo, ImportUnmatched, ImportValueMappings } from '@forga/core-contracts';
import { api, send, useLocalized, useTranslation } from '@forga/web-sdk';
import { Notice, useAction } from '@forga/web-ui';

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

/**
 * Values to show after a check: the ones still unmatched (with the new count) and the ones the user already assigned,
 * so the assignment can be changed again.
 */
const same = (a: ImportUnmatched, b: ImportUnmatched) => a.kind === b.kind && a.value === b.value;

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
  /** The assignment applies to all files of a data transfer. */
  transfer?: boolean;
}

/** Names of the file that match no entry: choose an existing entry, create one, or leave them unassigned. */
export function UnmatchedValues({ items, mappings, onChange, stale, onRecheck, rechecking, transfer }: Props) {
  const { t } = useTranslation('shell');
  const { data: lookups = [] } = useQuery({ queryKey: LOOKUPS, queryFn: () => api<ImportLookupInfo[]>('core/imports/lookups') });
  if (!items.length) return null;
  return (
    <Stack gap="md">
      <Title order={4}>{t('imports.unmatched.title')}</Title>
      <Text size="sm">{t(transfer ? 'imports.unmatched.hintTransfer' : 'imports.unmatched.hint')}</Text>
      <Table withTableBorder striped>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t('imports.unmatched.value')}</Table.Th>
            <Table.Th visibleFrom="sm">{t('imports.unmatched.kind')}</Table.Th>
            <Table.Th>{t('imports.unmatched.entry')}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {items.map((item) => (
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
      {stale && <Notice kind="info">{t('imports.unmatched.stale')}</Notice>}
      <Group justify="flex-end">
        <Button variant={stale ? 'filled' : 'default'} loading={rechecking} onClick={onRecheck}>{t('imports.unmatched.recheck')}</Button>
      </Group>
    </Stack>
  );
}

function UnmatchedRow({ item, lookup, selected, onSelect }: { item: ImportUnmatched; lookup?: ImportLookupInfo; selected: string | null; onSelect: (key: string | null) => void }) {
  const { t } = useTranslation('shell');
  const localized = useLocalized();
  const [creating, setCreating] = useState<{ name: string; key: string } | null>(null);
  const entriesKey = [...LOOKUPS, item.kind];
  const { data: entries = [] } = useQuery({ queryKey: entriesKey, queryFn: () => api<ImportLookupEntry[]>(`core/imports/lookups/${encodeURIComponent(item.kind)}`), enabled: !!lookup });
  const deriveKey = (name: string) => (lookup?.keyFormat === 'text' ? name.trim().slice(0, 40) : slugKey(name));
  const create = useAction((input: { name: string; key: string }) => send<ImportLookupEntry>('POST', `core/imports/lookups/${encodeURIComponent(item.kind)}`, input), {
    success: t('imports.unmatched.created'),
    invalidate: [entriesKey],
    onSuccess: (entry) => {
      setCreating(null);
      onSelect(entry.key);
    },
  });

  return (
    <Table.Tr>
      <Table.Td>
        <Text size="sm" fw={700}>{item.value}</Text>
        <Text size="xs" c="dimmed">{t('imports.unmatched.count', { count: item.count })}</Text>
      </Table.Td>
      <Table.Td visibleFrom="sm"><Text size="sm">{lookup ? localized(lookup.name) : item.kind}</Text></Table.Td>
      <Table.Td>
        {creating ? (
          <Stack gap="xs">
            <TextInput label={t('imports.unmatched.name')} value={creating.name} onChange={(e) => {
              const name = e.currentTarget.value;
              setCreating((c) => c && { name, key: c.key === deriveKey(c.name) ? deriveKey(name) : c.key });
            }} />
            <TextInput label={t('imports.unmatched.key')} description={t('imports.unmatched.keyHint')} value={creating.key} onChange={(e) => {
              const key = e.currentTarget.value;
              setCreating((c) => c && { ...c, key });
            }} />
            <Group gap="xs" justify="flex-end">
              <Button size="xs" variant="default" onClick={() => setCreating(null)}>{t('imports.unmatched.cancel')}</Button>
              <Button size="xs" loading={create.isPending} disabled={!creating.name.trim() || !creating.key.trim()} onClick={() => create.mutate(creating)}>{t('imports.unmatched.save')}</Button>
            </Group>
          </Stack>
        ) : (
          <Group gap="xs" wrap="nowrap" align="flex-start">
            <Select
              style={{ flex: 1 }}
              aria-label={t('imports.unmatched.entry')}
              placeholder={t('imports.unmatched.ignore')}
              data={entries.map((e) => ({ value: e.key, label: localized(e.name) }))}
              value={selected}
              onChange={onSelect}
              disabled={!lookup}
              clearable
              searchable
            />
            {lookup?.creatable && (
              <Button variant="default" leftSection={<IconPlus size={16} />} onClick={() => setCreating({ name: item.value, key: deriveKey(item.value) })}>
                {t('imports.unmatched.create')}
              </Button>
            )}
          </Group>
        )}
      </Table.Td>
    </Table.Tr>
  );
}
