import { ActionIcon, Button, Group, MultiSelect, NumberInput, Select, SimpleGrid, Stack, Switch, Table, Tabs, Textarea, TextInput } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { CostRecoverySettings, type FlatRate, HandoverColumn, type Material, PersonnelKind, type PersonnelRate, type VehicleRate } from '@forga/cost-recovery-contracts';
import { send, useTranslation } from '@forga/web-sdk';
import { PageHeader, Panel, useAction } from '@forga/web-ui';
import { keys, useCostSettings } from '../api';

const update = <T,>(list: T[], index: number, change: Partial<T>) => list.map((x, i) => (i === index ? { ...x, ...change } : x));

function Form({ value }: { value: CostRecoverySettings }) {
  const { t } = useTranslation('cost-recovery');
  const { t: common } = useTranslation('common');
  const [form, setForm] = useState(value);
  const set = <K extends keyof CostRecoverySettings>(key: K, v: CostRecoverySettings[K]) => setForm((f) => ({ ...f, [key]: v }));
  const save = useAction((v: CostRecoverySettings) => send('PUT', 'core/settings/cost-recovery.general', v), { success: t('settings.saved'), invalidate: [keys.settings] });
  const remove = (onClick: () => void) => <ActionIcon variant="subtle" color="red" aria-label={t('notice.remove')} onClick={onClick}><IconTrash size={16} /></ActionIcon>;

  return (
    <Stack gap="md">
      <Tabs defaultValue="rates">
        <Tabs.List mb="md">
          <Tabs.Tab value="rates">{t('settings.rates')}</Tabs.Tab>
          <Tabs.Tab value="materials">{t('settings.materials')}</Tabs.Tab>
          <Tabs.Tab value="notice">{t('settings.notice')}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="rates">
          <Stack gap="md">
            <Panel title={t('settings.personnel')}>
              <Table>
                <Table.Tbody>
                  {form.personnelRates.map((r, i) => (
                    <Table.Tr key={i}>
                      <Table.Td><Select aria-label={t('settings.kind')} data={PersonnelKind.options.map((k) => ({ value: k, label: t(`personnelKind.${k}`) }))} value={r.kind} onChange={(v) => v && set('personnelRates', update(form.personnelRates, i, { kind: v as PersonnelRate['kind'] }))} allowDeselect={false} /></Table.Td>
                      <Table.Td><DateInput aria-label={t('settings.validFrom')} value={r.validFrom} onChange={(v) => v && set('personnelRates', update(form.personnelRates, i, { validFrom: v }))} valueFormat="DD.MM.YYYY" /></Table.Td>
                      <Table.Td><NumberInput aria-label={t('settings.amount')} w={120} value={r.amount} decimalScale={2} suffix=" €" onChange={(v) => set('personnelRates', update(form.personnelRates, i, { amount: Number(v) || 0 }))} /></Table.Td>
                      <Table.Td>{remove(() => set('personnelRates', form.personnelRates.filter((_, x) => x !== i)))}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
              <Group mt="xs"><Button size="xs" variant="default" onClick={() => set('personnelRates', [...form.personnelRates, { kind: 'volunteer', validFrom: `${new Date().getFullYear() + 1}-01-01`, amount: 0 }])}>{t('settings.addRate')}</Button></Group>
            </Panel>
            <Panel title={t('settings.vehicles')}>
              <Table>
                <Table.Thead><Table.Tr><Table.Th>{t('settings.category')}</Table.Th><Table.Th>{t('settings.validFrom')}</Table.Th><Table.Th>{t('settings.amount')}</Table.Th><Table.Th /></Table.Tr></Table.Thead>
                <Table.Tbody>
                  {form.vehicleRates.map((r, i) => (
                    <Table.Tr key={i}>
                      <Table.Td><TextInput aria-label={t('settings.category')} value={r.category} onChange={(e) => set('vehicleRates', update<VehicleRate>(form.vehicleRates, i, { category: e.currentTarget.value }))} /></Table.Td>
                      <Table.Td><DateInput aria-label={t('settings.validFrom')} value={r.validFrom} onChange={(v) => v && set('vehicleRates', update<VehicleRate>(form.vehicleRates, i, { validFrom: v }))} valueFormat="DD.MM.YYYY" /></Table.Td>
                      <Table.Td><NumberInput aria-label={t('settings.amount')} w={120} value={r.amount} decimalScale={2} suffix=" €" onChange={(v) => set('vehicleRates', update<VehicleRate>(form.vehicleRates, i, { amount: Number(v) || 0 }))} /></Table.Td>
                      <Table.Td>{remove(() => set('vehicleRates', form.vehicleRates.filter((_, x) => x !== i)))}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
              <Group mt="xs" align="end">
                <Button size="xs" variant="default" onClick={() => set('vehicleRates', [...form.vehicleRates, { category: '', validFrom: `${new Date().getFullYear()}-01-01`, amount: 0 }])}>{t('settings.addRate')}</Button>
                <Select label={t('settings.rounding')} data={(['half-then-hour', 'started-half-hour', 'started-hour'] as const).map((r) => ({ value: r, label: t(`rounding.${r}`) }))} value={form.rounding} onChange={(v) => v && set('rounding', v as CostRecoverySettings['rounding'])} allowDeselect={false} w={360} />
                <Select
                  label={t('settings.vehicleRounding')}
                  placeholder={t('settings.likePersonnel')}
                  data={(['half-then-hour', 'started-half-hour', 'started-hour'] as const).map((r) => ({ value: r, label: t(`rounding.${r}`) }))}
                  value={form.vehicleRounding}
                  onChange={(v) => set('vehicleRounding', v as CostRecoverySettings['vehicleRounding'])}
                  clearable
                  w={360}
                />
              </Group>
              <Switch mt="sm" label={t('settings.chargeStandby')} checked={form.chargeStandby} onChange={(e) => set('chargeStandby', e.currentTarget.checked)} />
            </Panel>
          </Stack>
        </Tabs.Panel>
        <Tabs.Panel value="materials">
          <Panel title={t('settings.materials')}>
            <Table>
              <Table.Thead><Table.Tr><Table.Th>{t('settings.key')}</Table.Th><Table.Th>{t('settings.name')}</Table.Th><Table.Th>{t('settings.unit')}</Table.Th><Table.Th>{t('settings.price')}</Table.Th><Table.Th /></Table.Tr></Table.Thead>
              <Table.Tbody>
                {form.materials.map((m, i) => (
                  <Table.Tr key={i}>
                    <Table.Td><TextInput aria-label={t('settings.key')} value={m.key} onChange={(e) => set('materials', update<Material>(form.materials, i, { key: e.currentTarget.value }))} /></Table.Td>
                    <Table.Td><TextInput aria-label={t('settings.name')} value={m.name} onChange={(e) => set('materials', update<Material>(form.materials, i, { name: e.currentTarget.value }))} /></Table.Td>
                    <Table.Td><TextInput aria-label={t('settings.unit')} w={90} value={m.unit} onChange={(e) => set('materials', update<Material>(form.materials, i, { unit: e.currentTarget.value }))} /></Table.Td>
                    <Table.Td><NumberInput aria-label={t('settings.price')} w={120} value={m.price} decimalScale={2} suffix=" €" onChange={(v) => set('materials', update<Material>(form.materials, i, { price: Number(v) || 0 }))} /></Table.Td>
                    <Table.Td>{remove(() => set('materials', form.materials.filter((_, x) => x !== i)))}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            <Group mt="xs"><Button size="xs" variant="default" onClick={() => set('materials', [...form.materials, { key: `material-${form.materials.length + 1}`, name: '', unit: 'Stück', price: 0 }])}>{t('settings.addMaterial')}</Button></Group>
          </Panel>
          <Panel title={t('settings.flatRates')} mt="md">
            <Table>
              <Table.Thead><Table.Tr><Table.Th>{t('settings.key')}</Table.Th><Table.Th>{t('settings.name')}</Table.Th><Table.Th>{t('settings.flatAmount')}</Table.Th><Table.Th>{t('settings.basis')}</Table.Th><Table.Th /></Table.Tr></Table.Thead>
              <Table.Tbody>
                {form.flatRates.map((f, i) => (
                  <Table.Tr key={i}>
                    <Table.Td><TextInput aria-label={t('settings.key')} value={f.key} onChange={(e) => set('flatRates', update<FlatRate>(form.flatRates, i, { key: e.currentTarget.value }))} /></Table.Td>
                    <Table.Td><TextInput aria-label={t('settings.name')} value={f.name} onChange={(e) => set('flatRates', update<FlatRate>(form.flatRates, i, { name: e.currentTarget.value }))} /></Table.Td>
                    <Table.Td><NumberInput aria-label={t('settings.flatAmount')} w={120} value={f.amount} decimalScale={2} suffix=" €" onChange={(v) => set('flatRates', update<FlatRate>(form.flatRates, i, { amount: Number(v) || 0 }))} /></Table.Td>
                    <Table.Td><TextInput aria-label={t('settings.basis')} placeholder="§ … Satzung" value={f.basis} onChange={(e) => set('flatRates', update<FlatRate>(form.flatRates, i, { basis: e.currentTarget.value }))} /></Table.Td>
                    <Table.Td>{remove(() => set('flatRates', form.flatRates.filter((_, x) => x !== i)))}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            <Group mt="xs"><Button size="xs" variant="default" onClick={() => set('flatRates', [...form.flatRates, { key: `flat-${form.flatRates.length + 1}`, name: '', amount: 0, basis: '' }])}>{t('settings.addFlatRate')}</Button></Group>
          </Panel>
        </Tabs.Panel>
        <Tabs.Panel value="notice">
          <Panel title={t('settings.notice')}>
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <TextInput label={t('settings.authority')} value={form.authority} onChange={(e) => set('authority', e.currentTarget.value)} />
              <TextInput label={t('settings.authorityAddress')} value={form.authorityAddress} onChange={(e) => set('authorityAddress', e.currentTarget.value)} />
              <TextInput label={t('settings.statute')} description={t('settings.statuteHint')} value={form.statute} onChange={(e) => set('statute', e.currentTarget.value)} />
              <TextInput label={t('settings.defaultLegalBasis')} value={form.defaultLegalBasis} onChange={(e) => set('defaultLegalBasis', e.currentTarget.value)} />
              <TextInput label={t('settings.regulation')} description={t('settings.emptyOmitted')} value={form.regulation} onChange={(e) => set('regulation', e.currentTarget.value)} />
              <TextInput label={t('settings.jointLiability')} description={t('settings.emptyOmitted')} value={form.jointLiability} onChange={(e) => set('jointLiability', e.currentTarget.value)} />
              <TextInput label={t('settings.bankAccount')} value={form.bankAccount} onChange={(e) => set('bankAccount', e.currentTarget.value)} />
              <TextInput label={t('settings.budgetAccount')} value={form.budgetAccount} onChange={(e) => set('budgetAccount', e.currentTarget.value)} />
              <NumberInput label={t('settings.dueDays')} value={form.dueDays} onChange={(v) => set('dueDays', Number(v) || 30)} min={1} max={180} />
              <TextInput label={t('settings.signer')} value={form.signer} onChange={(e) => set('signer', e.currentTarget.value)} />
              <Select label={t('settings.handoverFormat')} data={(['xlsx', 'csv'] as const).map((f) => ({ value: f, label: t(`settings.handoverFormats.${f}`) }))} value={form.handover.format} onChange={(v) => v && set('handover', { ...form.handover, format: v as 'xlsx' | 'csv' })} allowDeselect={false} />
            </SimpleGrid>
            <MultiSelect
              mt="sm"
              label={t('settings.handoverColumns')}
              description={t('settings.handoverColumnsHint')}
              data={HandoverColumn.options.map((c) => ({ value: c, label: t(`settings.handoverColumn.${c}`) }))}
              value={form.handover.columns}
              onChange={(v) => v.length && set('handover', { ...form.handover, columns: v as HandoverColumn[] })}
            />
            <Stack gap="sm" mt="sm">
              <Textarea label={t('notice.reasoning')} description={t('settings.placeholders')} value={form.reasoning} onChange={(e) => set('reasoning', e.currentTarget.value)} autosize minRows={3} />
              <Textarea label={t('notice.remedy')} value={form.remedy} onChange={(e) => set('remedy', e.currentTarget.value)} autosize minRows={2} />
            </Stack>
          </Panel>
        </Tabs.Panel>
      </Tabs>
      <Group justify="flex-end"><Button loading={save.isPending} onClick={() => save.mutate(form)}>{common('actions.save')}</Button></Group>
    </Stack>
  );
}

/** Administration: rate tables (VOKeFw, statute), materials, authority and text blocks of the notice. */
export function SettingsPage() {
  const { t } = useTranslation('cost-recovery');
  const { data, isSuccess } = useCostSettings();
  return (
    <Stack gap="lg">
      <PageHeader breadcrumbs={[{ label: t('module') }, { label: t('settings.title') }]} title={t('settings.title')} subtitle={t('settings.subtitle')} />
      {isSuccess && <Form value={CostRecoverySettings.parse(data ?? {})} />}
    </Stack>
  );
}
