import { ActionIcon, Button, Group, MultiSelect, NumberInput, Select, SimpleGrid, Stack, Switch, Table, Text, TextInput } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { CompensationSettings, type CourseAllowance, type FunctionAllowance, type Rounding, SAMPLE_STATUTE, statuteMissing, validIban } from '@forga/compensation-contracts';
import { send, useLocalized, useTranslation } from '@forga/web-sdk';
import { ConfirmDialog, Notice, PageHeader, Panel, useAction } from '@forga/web-ui';
import { keys, useCompensationSettings, useCourses, useDepartments, useOffices } from '../api';
import { PreviewPanel } from './PreviewPanel';

/** Empty number input: no value. */
const optional = (v: string | number) => (v === '' ? null : Number(v));

type Rate<K> = { kind: K; validFrom: string; amount: number };

/** Hourly rates by kind and start date, with the rounding of the duration. */
function Rates<K extends string>(props: { title: string; kinds: K[]; kindLabel: (k: K) => string; rates: Rate<K>[]; rounding: Rounding; onRates: (v: Rate<K>[]) => void; onRounding: (v: Rounding) => void }) {
  const { t } = useTranslation('compensation');
  const { title, kinds, kindLabel, rates, rounding, onRates, onRounding } = props;
  const setRate = (index: number, change: Partial<Rate<K>>) => onRates(rates.map((r, i) => (i === index ? { ...r, ...change } : r)));
  return (
    <Panel title={title}>
      <Stack gap="sm">
        <Table>
          <Table.Thead><Table.Tr><Table.Th>{t('settings.rateKind')}</Table.Th><Table.Th>{t('settings.validFrom')}</Table.Th><Table.Th>{t('settings.amount')}</Table.Th><Table.Th /></Table.Tr></Table.Thead>
          <Table.Tbody>
            {rates.map((r, index) => (
              <Table.Tr key={`${r.kind}-${index}`}>
                <Table.Td><Select aria-label={t('settings.rateKind')} data={kinds.map((k) => ({ value: k, label: kindLabel(k) }))} value={r.kind} onChange={(v) => v && setRate(index, { kind: v as K })} allowDeselect={false} /></Table.Td>
                <Table.Td><DateInput aria-label={t('settings.validFrom')} value={r.validFrom} onChange={(v) => v && setRate(index, { validFrom: v })} valueFormat="DD.MM.YYYY" /></Table.Td>
                <Table.Td><NumberInput aria-label={t('settings.amount')} value={r.amount} onChange={(v) => setRate(index, { amount: Number(v) || 0 })} decimalScale={2} fixedDecimalScale suffix=" €" w={120} /></Table.Td>
                <Table.Td><ActionIcon variant="subtle" color="red" aria-label={t('settings.remove')} onClick={() => onRates(rates.filter((_, i) => i !== index))}><IconTrash size={16} /></ActionIcon></Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        <Group>
          <Button variant="default" size="xs" onClick={() => onRates([...rates, { kind: kinds[0], validFrom: `${new Date().getFullYear()}-01-01`, amount: 0 }])}>{t('settings.addRate')}</Button>
          <Select label={t('settings.rounding')} data={(['started-hour', 'started-half-hour', 'exact-minutes'] as const).map((r) => ({ value: r, label: t(`settings.roundings.${r}`) }))} value={rounding} onChange={(v) => v && onRounding(v as Rounding)} allowDeselect={false} />
        </Group>
      </Stack>
    </Panel>
  );
}

function Form({ value }: { value: CompensationSettings }) {
  const { t } = useTranslation('compensation');
  const { t: common } = useTranslation('common');
  const [form, setForm] = useState(value);
  const [template, setTemplate] = useState(false);
  const localized = useLocalized();
  const { data: offices = [] } = useOffices();
  const { data: departments = [] } = useDepartments();
  const set = <K extends keyof CompensationSettings>(key: K, v: CompensationSettings[K]) => setForm((f) => ({ ...f, [key]: v }));
  const { data: courses = [] } = useCourses();
  const setCourse = (index: number, change: Partial<CourseAllowance>) => set('courseAllowances', form.courseAllowances.map((c, i) => (i === index ? { ...c, ...change } : c)));
  const setAllowance = (index: number, change: Partial<FunctionAllowance>) => set('functionAllowances', form.functionAllowances.map((a, i) => (i === index ? { ...a, ...change } : a)));
  const save = useAction((v: CompensationSettings) => send('PUT', 'core/settings/compensation.general', v), { success: t('settings.saved'), invalidate: [keys.settings] });

  return (
    <Stack gap="md">
      <Group justify="flex-end"><Button size="xs" variant="default" onClick={() => setTemplate(true)}>{t('settings.template')}</Button></Group>
      {statuteMissing(form) && <Notice kind="warning">{t('settings.statuteMissing')}</Notice>}
      <ConfirmDialog opened={template} onClose={() => setTemplate(false)} title={t('settings.template')} description={t('settings.templateHint')} confirmLabel={t('settings.templateApply')} onConfirm={() => { setForm((f) => ({ ...f, ...SAMPLE_STATUTE })); setTemplate(false); }} />
      <Rates
        title={t('settings.trainingRates')}
        kinds={['training', 'fire-watch']}
        kindLabel={(k) => t(`settings.rateKinds.${k}`)}
        rates={form.trainingRates}
        rounding={form.trainingRounding}
        onRates={(v) => set('trainingRates', v)}
        onRounding={(v) => set('trainingRounding', v)}
      />
      <Rates
        title={t('settings.incidentRates')}
        kinds={['incident', 'standby', 'fire-watch']}
        kindLabel={(k) => t(`settings.incidentRateKinds.${k}`)}
        rates={form.incidentRates}
        rounding={form.incidentRounding}
        onRates={(v) => set('incidentRates', v)}
        onRounding={(v) => set('incidentRounding', v)}
      />
      <Panel title={t('settings.statute')}>
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <NumberInput label={t('settings.minimumHours')} description={t('settings.minimumHoursHint')} value={form.incidentMinimumHours ?? ''} onChange={(v) => set('incidentMinimumHours', optional(v))} min={0} max={24} decimalScale={2} suffix=" h" />
          <NumberInput label={t('settings.refreshmentAfter')} value={form.refreshment.afterHours} onChange={(v) => set('refreshment', { ...form.refreshment, afterHours: Number(v) || 0 })} min={0} decimalScale={1} suffix=" h" />
          <NumberInput label={t('settings.refreshmentAmount')} description={t('settings.refreshmentHint')} value={form.refreshment.amount ?? ''} onChange={(v) => set('refreshment', { ...form.refreshment, amount: optional(v) })} min={0} decimalScale={2} suffix=" €" />
          <NumberInput label={t('settings.multiDay')} description={t('settings.multiDayHint')} value={form.multiDayAfterDays} onChange={(v) => set('multiDayAfterDays', Number(v) || 1)} min={1} suffix={` ${t('settings.days')}`} />
          <NumberInput
            label={t('settings.householdRate')}
            description={t('settings.householdHint')}
            value={form.householdRates.at(-1)?.amount ?? ''}
            onChange={(v) => set('householdRates', v === '' ? [] : [...form.householdRates.slice(0, -1), { validFrom: form.householdRates.at(-1)?.validFrom ?? '2026-01-01', amount: Number(v) }])}
            min={0}
            decimalScale={2}
            suffix=" €"
          />
          <div />
          <NumberInput label={t('settings.maxPerService')} value={form.maxPerService ?? ''} onChange={(v) => set('maxPerService', optional(v))} min={0} decimalScale={2} suffix=" €" placeholder={t('settings.noLimit')} />
          <NumberInput label={t('settings.maxPerDay')} value={form.maxPerDay ?? ''} onChange={(v) => set('maxPerDay', optional(v))} min={0} decimalScale={2} suffix=" €" placeholder={t('settings.noLimit')} />
        </SimpleGrid>
      </Panel>
      <Panel title={t('settings.courseAllowances')}>
        <Stack gap="sm">
          <Table>
            <Table.Thead><Table.Tr><Table.Th>{t('settings.course')}</Table.Th><Table.Th>{t('settings.validFrom')}</Table.Th><Table.Th>{t('settings.amount')}</Table.Th><Table.Th /></Table.Tr></Table.Thead>
            <Table.Tbody>
              {form.courseAllowances.map((c, index) => (
                <Table.Tr key={`${c.course}-${index}`}>
                  <Table.Td><Select aria-label={t('settings.course')} data={courses.map((x) => ({ value: x.key, label: localized(x.name) }))} value={c.course} onChange={(v) => v && setCourse(index, { course: v })} searchable allowDeselect={false} /></Table.Td>
                  <Table.Td><DateInput aria-label={t('settings.validFrom')} value={c.validFrom} onChange={(v) => v && setCourse(index, { validFrom: v })} valueFormat="DD.MM.YYYY" /></Table.Td>
                  <Table.Td><NumberInput aria-label={t('settings.amount')} value={c.amount} onChange={(v) => setCourse(index, { amount: Number(v) || 0 })} decimalScale={2} fixedDecimalScale suffix=" €" w={120} /></Table.Td>
                  <Table.Td><ActionIcon variant="subtle" color="red" aria-label={t('settings.remove')} onClick={() => set('courseAllowances', form.courseAllowances.filter((_, i) => i !== index))}><IconTrash size={16} /></ActionIcon></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <Group><Button variant="default" size="xs" disabled={!courses.length} onClick={() => set('courseAllowances', [...form.courseAllowances, { course: courses[0]!.key, validFrom: `${new Date().getFullYear()}-01-01`, amount: 0 }])}>{t('settings.addCourse')}</Button></Group>
          <Text size="xs" c="dimmed">{t('settings.courseHint')}</Text>
        </Stack>
      </Panel>
      <PreviewPanel settings={form} />
      <Panel title={t('settings.functionAllowances')}>
        <Stack gap="sm">
          <Table>
            <Table.Thead><Table.Tr><Table.Th>{t('settings.nameDe')}</Table.Th><Table.Th>{t('settings.nameEn')}</Table.Th><Table.Th>{t('settings.amount')}</Table.Th><Table.Th>{t('settings.maxHolders')}</Table.Th><Table.Th>{t('settings.office')}</Table.Th><Table.Th>{t('settings.officeDepartments')}</Table.Th><Table.Th /></Table.Tr></Table.Thead>
            <Table.Tbody>
              {form.functionAllowances.map((a, index) => (
                <Table.Tr key={a.key}>
                  <Table.Td><TextInput aria-label={t('settings.nameDe')} value={a.name.de} onChange={(e) => setAllowance(index, { name: { ...a.name, de: e.currentTarget.value } })} /></Table.Td>
                  <Table.Td><TextInput aria-label={t('settings.nameEn')} value={a.name.en} onChange={(e) => setAllowance(index, { name: { ...a.name, en: e.currentTarget.value } })} /></Table.Td>
                  <Table.Td><NumberInput aria-label={t('settings.amount')} value={a.amount} onChange={(v) => setAllowance(index, { amount: Number(v) || 0 })} decimalScale={2} fixedDecimalScale suffix=" €" w={130} /></Table.Td>
                  <Table.Td><NumberInput aria-label={t('settings.maxHolders')} value={a.maxHolders ?? ''} onChange={(v) => setAllowance(index, { maxHolders: v === '' ? null : Number(v) })} min={1} w={80} /></Table.Td>
                  <Table.Td><Select aria-label={t('settings.office')} placeholder={t('settings.officeNone')} data={offices.map((o) => ({ value: o.key, label: localized(o.name) }))} value={a.office ?? null} onChange={(v) => setAllowance(index, { office: v, departmentIds: v ? (a.departmentIds ?? []) : [] })} clearable w={200} /></Table.Td>
                  <Table.Td><MultiSelect aria-label={t('settings.officeDepartments')} placeholder={a.office ? t('settings.allDepartments') : ''} data={departments.map((d) => ({ value: d.id, label: d.shortName || d.name }))} value={a.departmentIds ?? []} onChange={(v) => setAllowance(index, { departmentIds: v })} disabled={!a.office} w={200} /></Table.Td>
                  <Table.Td><ActionIcon variant="subtle" color="red" aria-label={t('settings.remove')} onClick={() => set('functionAllowances', form.functionAllowances.filter((_, i) => i !== index))}><IconTrash size={16} /></ActionIcon></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <Group align="end">
            <Button variant="default" size="xs" onClick={() => set('functionAllowances', [...form.functionAllowances, { key: `function-${Date.now()}`, name: { de: '', en: '' }, amount: 0, maxHolders: null, office: null, departmentIds: [] }])}>{t('settings.addFunction')}</Button>
            <Select label={t('settings.split')} data={(['by-months', 'holder-at-year-end'] as const).map((s) => ({ value: s, label: t(`settings.splits.${s}`) }))} value={form.functionSplit} onChange={(v) => v && set('functionSplit', v as CompensationSettings['functionSplit'])} allowDeselect={false} w={320} />
          </Group>
        </Stack>
      </Panel>
      <Panel title={t('settings.payout')}>
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <NumberInput label={t('settings.taxFreePerYear')} value={form.taxFreePerYear} onChange={(v) => set('taxFreePerYear', Number(v) || 0)} decimalScale={2} suffix=" €" />
          <NumberInput label={t('settings.taxFreePerMonth')} value={form.taxFreePerMonth} onChange={(v) => set('taxFreePerMonth', Number(v) || 0)} decimalScale={2} suffix=" €" />
          <TextInput label={t('settings.transferPurpose')} description={t('settings.transferPurposeHint')} value={form.transferPurpose} onChange={(e) => set('transferPurpose', e.currentTarget.value)} />
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <TextInput label={t('settings.payerName')} description={t('settings.payerHint')} value={form.payer.name} onChange={(e) => set('payer', { ...form.payer, name: e.currentTarget.value })} />
            <TextInput label={t('settings.payerIban')} value={form.payer.iban} onChange={(e) => set('payer', { ...form.payer, iban: e.currentTarget.value })} error={form.payer.iban && !validIban(form.payer.iban) ? t('settings.ibanInvalid') : undefined} />
            <TextInput label={t('settings.payerBic')} value={form.payer.bic} onChange={(e) => set('payer', { ...form.payer, bic: e.currentTarget.value })} />
          </SimpleGrid>
        </SimpleGrid>
        <Switch mt="md" label={t('settings.factualApproval')} description={t('settings.factualApprovalHint')} checked={form.factualApproval} onChange={(e) => set('factualApproval', e.currentTarget.checked)} />
      </Panel>
      <Group justify="flex-end"><Button loading={save.isPending} onClick={() => save.mutate(form)}>{common('actions.save')}</Button></Group>
    </Stack>
  );
}

/** Administration: statute parameters of the compensation module, with a preview for an incident. */
export function SettingsPage() {
  const { t } = useTranslation('compensation');
  const { data, isSuccess } = useCompensationSettings();
  return (
    <Stack gap="lg">
      <PageHeader breadcrumbs={[{ label: t('module') }, { label: t('settings.title') }]} title={t('settings.title')} subtitle={t('settings.subtitle')} />
      {isSuccess && <Form value={CompensationSettings.parse(data ?? {})} />}
    </Stack>
  );
}
