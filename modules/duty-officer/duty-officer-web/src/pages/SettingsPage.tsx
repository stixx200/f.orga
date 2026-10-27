import { ActionIcon, Button, Group, NumberInput, Select, Stack, Switch, Table, Text, TextInput } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { DUTY_KIND_TEMPLATE, type DutyKind, type DutyOfficerSettings } from '@forga/duty-officer-contracts';
import { send, useTranslation } from '@forga/web-sdk';
import { PageHeader, Panel, useAction } from '@forga/web-ui';
import { SETTINGS_KEY, useDutySettings } from '../api';

function SettingsForm({ initial }: { initial: DutyOfficerSettings }) {
  const { t } = useTranslation('duty-officer');
  const { t: common } = useTranslation('common');
  const [form, setForm] = useState<DutyOfficerSettings>(initial);
  const [thisYear] = useState(() => new Date().getFullYear());
  const save = useAction((value: DutyOfficerSettings) => send('PUT', 'core/settings/duty-officer.general', value), { success: t('settings.saved'), invalidate: [SETTINGS_KEY] });
  const setKind = (index: number, patch: Partial<DutyKind>) => setForm((f) => ({ ...f, dutyKinds: f.dutyKinds.map((k, i) => (i === index ? { ...k, ...patch } : k)) }));
  const valid = form.dutyKinds.every((k) => /^[a-z0-9][a-z0-9-]*$/.test(k.key) && k.name.de.trim());

  return (
    <Stack gap="lg">
      <Panel title={t('settings.reports')}>
        <Switch label={t('settings.reportRequired')} description={t('settings.reportRequiredHint')} checked={form.reportRequired} onChange={(e) => { const checked = e.currentTarget.checked; setForm((f) => ({ ...f, reportRequired: checked })); }} />
      </Panel>
      <Panel
        title={t('settings.dutyKinds')}
        aside={
          <Group gap="xs">
            {/* Example values of a statute are offered, never applied without asking. */}
            {!form.dutyKinds.length && <Button size="xs" variant="subtle" onClick={() => setForm((f) => ({ ...f, dutyKinds: DUTY_KIND_TEMPLATE }))}>{t('settings.template')}</Button>}
            <Button
              size="xs"
              variant="outline"
              onClick={() => setForm((f) => ({ ...f, dutyKinds: [...f.dutyKinds, { key: '', name: { de: '', en: '' }, unit: 'full-day', rates: [{ amountPerDay: 0, validFrom: `${thisYear}-01-01` }] }] }))}
            >
              {t('settings.addKind')}
            </Button>
          </Group>
        }
      >
        <Text size="sm" c="dimmed" mb="sm">{t('settings.dutyHint')}</Text>
        {!form.dutyKinds.length && <Text size="sm" c="brand" mb="xs">{t('settings.noKinds')}</Text>}
        {form.dutyKinds.length > 0 && (
          <Table withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('settings.key')}</Table.Th>
                <Table.Th>{t('settings.nameDe')}</Table.Th>
                <Table.Th>{t('settings.nameEn')}</Table.Th>
                <Table.Th>{t('settings.unit')}</Table.Th>
                <Table.Th>{t('settings.amountPerDay')}</Table.Th>
                <Table.Th>{t('settings.validFrom')}</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {form.dutyKinds.map((kind, index) => {
                const rate = kind.rates.at(-1) ?? { amountPerDay: 0, validFrom: `${thisYear}-01-01` };
                const update = (patch: Partial<typeof rate>) => setKind(index, { rates: [...kind.rates.slice(0, -1), { ...rate, ...patch }] });
                return (
                  <Table.Tr key={index}>
                    <Table.Td><TextInput aria-label={t('settings.key')} value={kind.key} onChange={(e) => setKind(index, { key: e.currentTarget.value })} w={140} /></Table.Td>
                    <Table.Td><TextInput aria-label={t('settings.nameDe')} value={kind.name.de} onChange={(e) => setKind(index, { name: { ...kind.name, de: e.currentTarget.value } })} /></Table.Td>
                    <Table.Td><TextInput aria-label={t('settings.nameEn')} value={kind.name.en} onChange={(e) => setKind(index, { name: { ...kind.name, en: e.currentTarget.value } })} /></Table.Td>
                    <Table.Td>
                      <Select
                        aria-label={t('settings.unit')}
                        data={(['full-day', 'started-day'] as const).map((u) => ({ value: u, label: t(`settings.units.${u}`) }))}
                        value={kind.unit}
                        onChange={(v) => v && setKind(index, { unit: v as DutyKind['unit'] })}
                        allowDeselect={false}
                        w={170}
                      />
                    </Table.Td>
                    <Table.Td><NumberInput aria-label={t('settings.amountPerDay')} value={rate.amountPerDay} onChange={(v) => update({ amountPerDay: Number(v) || 0 })} min={0} decimalScale={2} suffix=" €" w={110} /></Table.Td>
                    <Table.Td><DateInput aria-label={t('settings.validFrom')} value={rate.validFrom} onChange={(v) => v && update({ validFrom: v })} valueFormat="DD.MM.YYYY" w={140} /></Table.Td>
                    <Table.Td><ActionIcon aria-label={common('actions.delete')} onClick={() => setForm((f) => ({ ...f, dutyKinds: f.dutyKinds.filter((_, i) => i !== index) }))}><IconTrash size={16} /></ActionIcon></Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        )}
      </Panel>
      <Group justify="flex-end">
        <Button loading={save.isPending} disabled={!valid} onClick={() => save.mutate({ ...form, dutyKinds: form.dutyKinds.map((k) => ({ ...k, name: { de: k.name.de, en: k.name.en || k.name.de } })) })}>
          {common('actions.save')}
        </Button>
      </Group>
    </Stack>
  );
}

/** Settings of the duty officer module: EvD report for every incident, special services of the roster. */
export function SettingsPage() {
  const { t } = useTranslation('duty-officer');
  const { data, isLoading } = useDutySettings();
  return (
    <Stack gap="lg">
      <PageHeader breadcrumbs={[{ label: t('module') }, { label: t('settings.title') }]} title={t('settings.title')} />
      {!isLoading && data && <SettingsForm initial={data} />}
    </Stack>
  );
}
