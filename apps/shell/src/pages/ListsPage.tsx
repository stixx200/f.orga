import { Button, Checkbox, Grid, Group, NavLink, NumberInput, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { IconFileSpreadsheet, IconFileText, IconFileTypePdf } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import { useDebouncedValue } from '@mantine/hooks';
import { LIST_PURPOSE_OTHER, type ListCell, type ListData, type ListInfo, type ListOption, type ListParameter } from '@forga/core-contracts';
import { api, apiUrl, formatDate, isElevated, openAfterStepUp, useSession, withQuery, useLocalized, useTranslation } from '@forga/web-sdk';
import { DataTable, EmptyState, Notice, PageHeader, Panel } from '@forga/web-ui';
import type { LoadedModule } from '../modules';
import { useDepartments } from './admin/data';

type Values = Record<string, string>;

const initialValues = (list: ListInfo): Values =>
  Object.fromEntries(list.parameters.map((p) => [p.key, p.type === 'year' ? String(new Date().getFullYear()) : p.type === 'boolean' ? 'false' : '']));

/**
 * A person or an entry offered by the module (session, payout run, promotion list …), searched on the server as the
 * user types; the value is the ID.
 */
function OptionField({ listId, parameter, label, value, onChange }: { listId: string; parameter: ListParameter; label: string; value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation('shell');
  const [search, setSearch] = useState('');
  const [query] = useDebouncedValue(search, 250);
  const [known, setKnown] = useState<ListOption[]>([]);
  const person = parameter.type === 'person';
  const { data: options = [], isFetching } = useQuery({
    queryKey: ['core', 'lists', listId, 'options', parameter.key, query],
    queryFn: () => api<ListOption[]>(withQuery(`core/lists/${listId}/parameters/${parameter.key}/options`, { q: query })),
    // Persons are only searched by name; module choices are listed right away.
    enabled: !person || query.trim().length >= 2,
    staleTime: 60_000,
  });
  // Keep the chosen entry, so its label stays when the search changes.
  const selected = known.find((o) => o.value === value);
  const data = [...(selected && !options.some((o) => o.value === selected.value) ? [selected] : []), ...options];
  const required = parameter.required ?? false;
  return (
    <Select
      label={label}
      placeholder={t('lists.searchPlaceholder')}
      data={data.map((o) => ({ value: o.value, label: o.description ? `${o.label} · ${o.description}` : o.label }))}
      value={value || null}
      onChange={(v) => {
        setKnown(data);
        onChange(v ?? '');
      }}
      searchable
      searchValue={search}
      onSearchChange={setSearch}
      // The server filters already; the typed text must not hide entries whose description matched.
      filter={({ options: all }) => all}
      nothingFoundMessage={isFetching || (person && query.trim().length < 2) ? undefined : t('lists.noOptions')}
      clearable={!required}
      required={required}
    />
  );
}

function ParameterField({ listId, parameter, value, onChange, allowed }: { listId: string; parameter: ListParameter; value: string; onChange: (value: string) => void; allowed: ListInfo['departments'] }) {
  const localized = useLocalized();
  const { t } = useTranslation('shell');
  const { data: departments = [] } = useDepartments();
  const label = localized(parameter.label);
  const required = parameter.required ?? false;
  switch (parameter.type) {
    case 'date':
      return <DateInput label={label} value={value || null} onChange={(v) => onChange(v ?? '')} valueFormat="DD.MM.YYYY" clearable={!required} required={required} />;
    case 'year':
      return <NumberInput label={label} value={value} onChange={(v) => onChange(String(v))} min={2000} max={2100} required={required} />;
    case 'department':
      // Only the departments the user may run the list for; without a choice the list covers exactly those.
      return (
        <Select
          label={label}
          placeholder={t(allowed === 'brigade' ? 'lists.allDepartments' : 'lists.ownDepartments')}
          data={departments.filter((d) => allowed === 'brigade' || allowed.includes(d.id)).map((d) => ({ value: d.id, label: d.name }))}
          value={value || null}
          onChange={(v) => onChange(v ?? '')}
          clearable={!required}
          required={required}
        />
      );
    case 'select':
      return <Select label={label} data={(parameter.options ?? []).map((o) => ({ value: o.value, label: localized(o.label) }))} value={value || null} onChange={(v) => onChange(v ?? '')} clearable={!required} required={required} />;
    case 'person':
    case 'choice':
      return <OptionField listId={listId} parameter={parameter} label={label} value={value} onChange={onChange} />;
    case 'boolean':
      return <Checkbox label={label} checked={value === 'true'} onChange={(e) => onChange(String(e.currentTarget.checked))} mt="lg" />;
    default:
      return <TextInput label={label} value={value} onChange={(e) => onChange(e.currentTarget.value)} required={required} />;
  }
}

function cell(value: ListCell, language: string): string {
  if (value === null) return '';
  if (typeof value === 'boolean') return value ? '✓' : '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDate(value, language);
  return String(value);
}

function ListView({ list }: { list: ListInfo }) {
  const { t, i18n } = useTranslation('shell');
  const localized = useLocalized();
  const [parameters, setValues] = useState<Values>(() => initialValues(list));
  // Purpose of the list (L11): the first one is preselected; "other" needs a description.
  const [purpose, setPurpose] = useState(list.purposes[0]?.key ?? '');
  const [purposeNote, setPurposeNote] = useState('');
  const values: Values = { ...parameters, ...(purpose ? { purpose } : {}), ...(purpose === LIST_PURPOSE_OTHER ? { purposeNote } : {}) };
  const [shown, setShown] = useState<Values | null>(null);
  const purposeMissing = (list.purposeRequired && !purpose) || (purpose === LIST_PURPOSE_OTHER && purposeNote.trim().length < 3);
  const missing = [...list.parameters.filter((p) => p.required && !parameters[p.key]), ...(purposeMissing ? [null] : [])];
  const preview = useQuery({
    queryKey: ['core', 'lists', list.id, shown],
    queryFn: () => api<ListData>(withQuery(`core/lists/${list.id}`, shown ?? {})),
    enabled: !!shown,
  });
  const session = useSession().data;
  const exportUrl = (format: string) => apiUrl(`core/lists/${list.id}/export/${format}`, { ...values, lang: i18n.language });

  return (
    <Stack gap="lg">
      <Panel title={localized(list.name)}>
        {list.description && <Text size="sm" mb="md">{localized(list.description)}</Text>}
        {list.purposes.length > 0 && (
          <SimpleGrid cols={{ base: 1, sm: 2 }} mb="md">
            <Select
              label={t('minimisation.lists.purpose')}
              description={list.purposeRequired ? t('minimisation.lists.purposeRequired') : t('minimisation.lists.columnsOfPurpose')}
              required={list.purposeRequired}
              allowDeselect={false}
              data={list.purposes.map((p) => ({ value: p.key, label: localized(p.label) }))}
              value={purpose || null}
              onChange={(v) => setPurpose(v ?? '')}
            />
            {purpose === LIST_PURPOSE_OTHER && (
              <TextInput
                label={t('minimisation.lists.purposeNote')}
                placeholder={t('minimisation.lists.purposeNotePlaceholder')}
                required
                maxLength={200}
                value={purposeNote}
                onChange={(e) => setPurposeNote(e.currentTarget.value)}
              />
            )}
          </SimpleGrid>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setShown({ ...values });
          }}
        >
          <Stack gap="md">
            {list.parameters.length > 0 && (
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
                {list.parameters.map((p) => (
                  <ParameterField key={p.key} listId={list.id} parameter={p} allowed={list.departments} value={parameters[p.key] ?? ''} onChange={(value) => setValues((v) => ({ ...v, [p.key]: value }))} />
                ))}
              </SimpleGrid>
            )}
            <Group justify="space-between">
              <Group gap="xs">
                {[
                  { format: 'pdf', icon: IconFileTypePdf, label: 'PDF' },
                  { format: 'xlsx', icon: IconFileSpreadsheet, label: 'Excel' },
                  { format: 'csv', icon: IconFileText, label: 'CSV' },
                ].map(({ format, icon: Icon, label }) => (
                  <Button key={format} component="a" href={missing.length ? undefined : exportUrl(format)} variant="default" leftSection={<Icon size={18} />} data-disabled={missing.length > 0 || undefined} onClick={(e) => {
                    if (missing.length) e.preventDefault();
                    // Lists with sensitive data: ask for the second factor first instead of opening the server's error.
                    else if (list.stepUp && !isElevated(session)) {
                      e.preventDefault();
                      void openAfterStepUp(exportUrl(format));
                    }
                  }}>
                    {label}
                  </Button>
                ))}
              </Group>
              <Button type="submit" disabled={missing.length > 0}>{t('lists.preview')}</Button>
            </Group>
          </Stack>
        </form>
      </Panel>
      {preview.error && <Notice kind="error">{t('lists.failed')}</Notice>}
      {preview.data && (
        <Panel title={preview.data.title} aside={<Text size="sm" c="dimmed">{t('lists.rows', { count: preview.data.rows.length })}</Text>}>
          {preview.data.subtitle && <Text size="sm" c="dimmed" mb="sm">{preview.data.subtitle}</Text>}
          {preview.data.purpose && <Text size="sm" c="dimmed" mb="sm">{`${t('minimisation.lists.purpose')}: ${preview.data.purpose}`}</Text>}
          <DataTable
            exportable={false}
            rows={preview.data.rows.map((row, index) => ({ ...row, __index: index }))}
            rowKey={(row) => String(row['__index'])}
            columns={preview.data.columns.map((c) => ({
              key: c.key,
              header: localized(c.label),
              align: c.align,
              render: (row: Record<string, ListCell>) => cell(row[c.key] ?? null, i18n.language),
            }))}
          />
          {preview.data.personalData && <Text size="xs" c="dimmed" mt="sm">{t('minimisation.lists.personalData')}</Text>}
        </Panel>
      )}
    </Stack>
  );
}

/** All lists the user may run, by module: parameters, preview, export as PDF, Excel and CSV. */
export function ListsPage({ modules }: { modules: LoadedModule[] }) {
  const { t } = useTranslation('shell');
  const localized = useLocalized();
  const { data: lists = [], isLoading } = useQuery({ queryKey: ['core', 'lists'], queryFn: () => api<ListInfo[]>('core/lists') });
  const [selected, setSelected] = useState<string | null>(null);
  const list = lists.find((l) => l.id === selected);
  const groups = [...new Set(lists.map((l) => l.module))];
  const moduleName = (id: string) => {
    const module = modules.find((m) => m.info.id === id);
    return module ? localized(module.info.name) : id;
  };

  return (
    <Stack gap="lg">
      <PageHeader title={t('nav.lists')} subtitle={t('lists.subtitle')} />
      {!isLoading && !lists.length && <EmptyState title={t('lists.none')} />}
      {lists.length > 0 && (
        <Grid gap="lg">
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Panel p="sm">
              {groups.map((group) => (
                <Fragment key={group}>
                  <Text size="xs" fw={700} tt="uppercase" c="dimmed" px="sm" pt="sm" pb={4}>{moduleName(group)}</Text>
                  {lists
                    .filter((l) => l.module === group)
                    .map((l) => (
                      <NavLink key={l.id} active={l.id === selected} label={localized(l.name)} onClick={() => setSelected(l.id)} />
                    ))}
                </Fragment>
              ))}
            </Panel>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 8 }}>
            {list ? <ListView key={list.id} list={list} /> : <EmptyState title={t('lists.choose')} />}
          </Grid.Col>
        </Grid>
      )}
    </Stack>
  );
}
