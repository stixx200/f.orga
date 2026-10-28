import { ActionIcon, Button, Group, NumberInput, Select, SimpleGrid, Stack, Switch, Table, Tabs, TagsInput, Text, TextInput } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { type AlarmKeyword, type AlarmKeywordInput, DEFAULT_RULE_LEVELS, IncidentSettings, RATE_TEMPLATE, RULE_IDS } from '@forga/incidents-contracts';
import { extensionsOf, send, useLocalized, useTranslation } from '@forga/web-sdk';
import { AliasesInput, DataTable, PageHeader, Panel, ResponsiveDialog, useAction } from '@forga/web-ui';
import { useKeywords, useSettings } from '../api';

const SETTINGS_KEY = ['core', 'settings', 'incidents.general'];
const KEYWORDS_KEY = ['incidents', 'keywords'];

function KeywordDialog({ keyword, onClose }: { keyword?: AlarmKeyword; onClose: () => void }) {
  const { t } = useTranslation('incidents');
  const { t: common } = useTranslation('common');
  const [form, setForm] = useState<Required<AlarmKeywordInput>>(() => ({
    key: keyword?.key ?? '',
    name: keyword?.name ?? { de: '', en: '' },
    mainType: keyword?.mainType ?? null,
    technicalCategory: keyword?.technicalCategory ?? null,
    falseAlarmType: keyword?.falseAlarmType ?? null,
    requiresVehicle: keyword?.requiresVehicle ?? true,
    compensationKind: keyword?.compensationKind ?? 'incident',
    active: keyword?.active ?? true,
    aliases: keyword?.aliases ?? [],
  }));
  const save = useAction(
    () => {
      const body = { ...form, name: { de: form.name.de, en: form.name.en || form.name.de } };
      return keyword ? send('PUT', `incidents/keywords/${keyword.id}`, body) : send('POST', 'incidents/keywords', body);
    },
    { success: t('settingsPage.saved'), invalidate: [KEYWORDS_KEY], onSuccess: onClose },
  );
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={keyword ? t('settingsPage.editKeyword') : t('settingsPage.newKeyword')}
      size="lg"
      actions={
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button loading={save.isPending} disabled={!form.key || !form.name.de} onClick={() => save.mutate(undefined)}>{common('actions.save')}</Button>
        </Group>
      }
    >
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <TextInput label={t('fields.keyword')} value={form.key} onChange={(e) => setForm({ ...form, key: e.currentTarget.value })} disabled={Boolean(keyword)} required />
        <TextInput label={t('settingsPage.nameDe')} value={form.name.de} onChange={(e) => setForm({ ...form, name: { ...form.name, de: e.currentTarget.value } })} required />
        <TextInput label={t('settingsPage.nameEn')} value={form.name.en} onChange={(e) => setForm({ ...form, name: { ...form.name, en: e.currentTarget.value } })} />
        <Select
          label={t('statistics.mainType')}
          description={t('settingsPage.mainTypeHint')}
          data={(['fire', 'technical-assistance', 'false-alarm', 'other'] as const).map((m) => ({ value: m, label: t(`statistics.mainTypes.${m}`) }))}
          value={form.mainType}
          onChange={(v) => setForm({ ...form, mainType: v as AlarmKeyword['mainType'], technicalCategory: null, falseAlarmType: null })}
          clearable
        />
        {form.mainType === 'technical-assistance' && (
          <Select
            label={t('statistics.technicalCategory')}
            data={(['rescue-persons', 'hazardous-materials', 'oil-trace', 'animal-rescue', 'insects', 'flood-weather', 'storm', 'other'] as const).map((c) => ({ value: c, label: t(`statistics.technical.${c}`) }))}
            value={form.technicalCategory}
            onChange={(v) => setForm({ ...form, technicalCategory: v as AlarmKeyword['technicalCategory'] })}
            clearable
          />
        )}
        {form.mainType === 'false-alarm' && (
          <Select
            label={t('statistics.falseAlarmType')}
            data={(['good-faith', 'malicious', 'fire-alarm-system'] as const).map((f) => ({ value: f, label: t(`statistics.falseAlarm.${f}`) }))}
            value={form.falseAlarmType}
            onChange={(v) => setForm({ ...form, falseAlarmType: v as AlarmKeyword['falseAlarmType'] })}
            clearable
          />
        )}
        <Select
          label={t('settingsPage.compensationKind')}
          data={(['incident', 'standby', 'fire-watch'] as const).map((k) => ({ value: k, label: t(`settingsPage.kinds.${k}`) }))}
          value={form.compensationKind}
          onChange={(v) => v && setForm({ ...form, compensationKind: v as AlarmKeyword['compensationKind'] })}
          allowDeselect={false}
        />
      </SimpleGrid>
      <Group mt="md">
        <Switch label={t('settingsPage.requiresVehicle')} checked={form.requiresVehicle} onChange={(e) => setForm({ ...form, requiresVehicle: e.currentTarget.checked })} />
        <Switch label={t('settingsPage.active')} checked={form.active} onChange={(e) => setForm({ ...form, active: e.currentTarget.checked })} />
      </Group>
      <AliasesInput value={form.aliases} onChange={(aliases) => setForm({ ...form, aliases })} mt="md" />
    </ResponsiveDialog>
  );
}

function SettingsForm({ initial }: { initial: IncidentSettings }) {
  const { t } = useTranslation('incidents');
  const { t: common } = useTranslation('common');
  const localized = useLocalized();
  const { data: keywords = [] } = useKeywords();
  const [form, setForm] = useState<IncidentSettings>(initial);
  const [keyword, setKeyword] = useState<AlarmKeyword | 'new' | null>(null);
  const [thisYear] = useState(() => new Date().getFullYear());
  const save = useAction((value: IncidentSettings) => send('PUT', 'core/settings/incidents.general', value), { success: t('settingsPage.saved'), invalidate: [SETTINGS_KEY] });
  const template = useAction(() => send('POST', 'incidents/keywords/templates/bw'), { success: t('settingsPage.templateApplied'), invalidate: [KEYWORDS_KEY] });
  const set = <K extends keyof IncidentSettings>(key: K, value: IncidentSettings[K]) => setForm((f) => ({ ...f, [key]: value }));
  // An active module keeping the hourly rates and the rounding (compensation, statute) shows where they are set instead.
  const ratesElsewhere = extensionsOf('incidents.settings.rates');
  const saveButton = (
    <Group justify="flex-end" mt="md">
      <Button loading={save.isPending} onClick={() => save.mutate(form)}>{common('actions.save')}</Button>
    </Group>
  );

  return (
    <Tabs defaultValue="compensation" keepMounted={false}>
      <Tabs.List mb="lg">
        <Tabs.Tab value="compensation">{t('settingsPage.tabs.compensation')}</Tabs.Tab>
        <Tabs.Tab value="keywords">{t('settingsPage.tabs.keywords')}</Tabs.Tab>
        <Tabs.Tab value="rules">{t('settingsPage.tabs.rules')}</Tabs.Tab>
        <Tabs.Tab value="mp-feuer">{t('settingsPage.tabs.mpFeuer')}</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="compensation">
        <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
          {ratesElsewhere.length ? (
            ratesElsewhere.map(({ module, component: Contribution }) => <Contribution key={module} />)
          ) : (
            <Panel
              title={t('settingsPage.rates')}
              aside={
                <Group gap="xs">
                  {/* Example values of a statute are offered, never applied without asking. */}
                  {!form.rates.length && <Button size="xs" variant="subtle" onClick={() => set('rates', RATE_TEMPLATE)}>{t('settingsPage.rateTemplate')}</Button>}
                  <Button size="xs" variant="outline" onClick={() => set('rates', [...form.rates, { kind: 'incident', amount: 0, validFrom: `${thisYear}-01-01` }])}>{t('settingsPage.addRate')}</Button>
                </Group>
              }
            >
              {!form.rates.length && <Text size="sm" c="brand" mb="xs">{t('settingsPage.noRates')}</Text>}
              <Table withTableBorder>
                <Table.Thead><Table.Tr><Table.Th>{t('settingsPage.kind')}</Table.Th><Table.Th>{t('settingsPage.amountPerHour')}</Table.Th><Table.Th>{t('settingsPage.validFrom')}</Table.Th><Table.Th /></Table.Tr></Table.Thead>
                <Table.Tbody>
                  {form.rates.map((rate, index) => (
                    <Table.Tr key={index}>
                      <Table.Td>
                        <Select aria-label={t('settingsPage.kind')} data={(['incident', 'standby', 'fire-watch'] as const).map((k) => ({ value: k, label: t(`settingsPage.kinds.${k}`) }))} value={rate.kind} onChange={(v) => v && set('rates', form.rates.map((r, i) => (i === index ? { ...r, kind: v as typeof rate.kind } : r)))} allowDeselect={false} />
                      </Table.Td>
                      <Table.Td><NumberInput aria-label={t('settingsPage.amountPerHour')} value={rate.amount} onChange={(v) => set('rates', form.rates.map((r, i) => (i === index ? { ...r, amount: Number(v) || 0 } : r)))} min={0} decimalScale={2} suffix=" €" w={110} /></Table.Td>
                      <Table.Td><DateInput aria-label={t('settingsPage.validFrom')} value={rate.validFrom} onChange={(v) => v && set('rates', form.rates.map((r, i) => (i === index ? { ...r, validFrom: v } : r)))} valueFormat="DD.MM.YYYY" w={140} /></Table.Td>
                      <Table.Td><ActionIcon aria-label={common('actions.delete')} onClick={() => set('rates', form.rates.filter((_, i) => i !== index))}><IconTrash size={16} /></ActionIcon></Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
              <Text size="xs" c="dimmed" mt="xs">{t('settingsPage.ratesHint')}</Text>
            </Panel>
          )}
          <Panel title={t('settingsPage.calculation')}>
            <Stack gap="sm">
              {!ratesElsewhere.length && <Select
                label={t('settingsPage.rounding')}
                data={(['started-hour', 'started-half-hour', 'exact-minutes'] as const).map((r) => ({ value: r, label: t(`settingsPage.roundings.${r}`) }))}
                value={form.rounding}
                onChange={(v) => v && set('rounding', v as IncidentSettings['rounding'])}
                allowDeselect={false}
              />}
              {!ratesElsewhere.length && <NumberInput label={t('settingsPage.minimumHours')} description={t('settingsPage.minimumHoursHint')} value={form.minimumHours ?? ''} onChange={(v) => set('minimumHours', v === '' ? null : Number(v))} min={0} max={24} decimalScale={2} suffix=" h" />}
              <NumberInput label={t('settingsPage.standbyHours')} value={form.standbyHours} onChange={(v) => set('standbyHours', Number(v) || 0)} min={0} decimalScale={1} />
              <NumberInput label={t('settingsPage.longDurationHours')} description={t('settingsPage.longDurationHint')} value={form.longDurationHours} onChange={(v) => set('longDurationHours', Number(v) || 24)} min={1} max={240} />
              <Switch label={t('settingsPage.twoSteps')} description={t('settingsPage.twoStepsHint')} checked={form.compensationRelease} onChange={(e) => set('compensationRelease', e.currentTarget.checked)} />
              <Switch label={t('settingsPage.workingHours')} description={t('settingsPage.workingHoursHint')} checked={form.compensateDuringWorkingHours} onChange={(e) => set('compensateDuringWorkingHours', e.currentTarget.checked)} />
              <TagsInput label={t('settingsPage.homeMunicipalities')} description={t('settingsPage.homeMunicipalitiesHint')} value={form.homeMunicipalities} onChange={(v) => set('homeMunicipalities', v)} />
            </Stack>
          </Panel>
        </SimpleGrid>
        {saveButton}
      </Tabs.Panel>
      <Tabs.Panel value="keywords">
        <Panel
          title={t('settingsPage.keywords')}
          aside={
            <Group gap="xs">
              <Button size="xs" variant="default" loading={template.isPending} onClick={() => template.mutate(undefined)}>{t('settingsPage.applyTemplate')}</Button>
              <Button size="xs" variant="outline" onClick={() => setKeyword('new')}>{t('settingsPage.addKeyword')}</Button>
            </Group>
          }
        >
          <Text size="sm" c="dimmed" mb="sm">{t('settingsPage.keywordsHint')}</Text>
          <DataTable<AlarmKeyword>
            rows={keywords}
            rowKey={(k) => k.id}
            onRowClick={(k) => setKeyword(k)}
            highlight={(k) => !k.active}
            columns={[
              { key: 'key', header: t('fields.keyword'), render: (k) => <Text fw={700} size="sm">{k.key}</Text> },
              { key: 'name', header: t('settingsPage.name'), render: (k) => localized(k.name) },
              { key: 'main', header: t('statistics.mainType'), render: (k) => (k.mainType ? t(`statistics.mainTypes.${k.mainType}`) : t('settingsPage.notCounted')) },
              { key: 'sub', header: t('settingsPage.subcategory'), render: (k) => (k.technicalCategory ? t(`statistics.technical.${k.technicalCategory}`) : k.falseAlarmType ? t(`statistics.falseAlarm.${k.falseAlarmType}`) : '') },
              { key: 'vehicle', header: t('settingsPage.requiresVehicle'), render: (k) => t(k.requiresVehicle ? 'settingsPage.yes' : 'settingsPage.no') },
              { key: 'kind', header: t('settingsPage.compensationKind'), render: (k) => t(`settingsPage.kinds.${k.compensationKind}`) },
            ]}
          />
        </Panel>
      </Tabs.Panel>
      <Tabs.Panel value="rules">
        <Panel title={t('settingsPage.rules')}>
          <Text size="sm" c="dimmed" mb="sm">{t('settingsPage.rulesHint')}</Text>
          <Table withTableBorder striped>
            <Table.Tbody>
              {RULE_IDS.map((rule) => {
                const setting = form.rules[rule] ?? { enabled: true };
                const level = setting.level ?? DEFAULT_RULE_LEVELS[rule];
                return (
                  <Table.Tr key={rule}>
                    <Table.Td><Switch label={t(`settingsPage.ruleNames.${rule}`)} checked={setting.enabled} onChange={(e) => set('rules', { ...form.rules, [rule]: { ...setting, enabled: e.currentTarget.checked } })} /></Table.Td>
                    <Table.Td w={180}>
                      <Select
                        aria-label={t('settingsPage.level')}
                        data={[{ value: 'error', label: t('settingsPage.levels.error') }, { value: 'warning', label: t('settingsPage.levels.warning') }]}
                        value={level}
                        onChange={(v) => v && set('rules', { ...form.rules, [rule]: { ...setting, level: v as 'error' | 'warning' } })}
                        allowDeselect={false}
                        disabled={!setting.enabled}
                      />
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
          {saveButton}
        </Panel>
      </Tabs.Panel>
      <Tabs.Panel value="mp-feuer">
        <Panel title={t('settingsPage.parallel')} maw={720}>
          <Stack gap="sm">
            <Text size="sm" c="dimmed">{t('settingsPage.parallelHint')}</Text>
            <Select
              label={t('settingsPage.externalLeading')}
              description={t('settingsPage.externalLeadingHint')}
              data={[{ value: '', label: 'f.orga' }, { value: 'mp-feuer', label: 'MP-Feuer' }]}
              value={form.externalLeading ?? ''}
              onChange={(v) => set('externalLeading', v === 'mp-feuer' ? 'mp-feuer' : null)}
              allowDeselect={false}
            />
            <DateInput
              label={t('settingsPage.externalEventsFrom')}
              description={t('settingsPage.externalEventsFromHint')}
              value={form.externalEventsFrom}
              onChange={(v) => set('externalEventsFrom', v || null)}
              valueFormat="DD.MM.YYYY"
              clearable
            />
          </Stack>
          {saveButton}
        </Panel>
      </Tabs.Panel>
      {keyword && <KeywordDialog keyword={keyword === 'new' ? undefined : keyword} onClose={() => setKeyword(null)} />}
    </Tabs>
  );
}

/** Settings of the incident reports: compensation, keywords, report rules. */
export function SettingsPage() {
  const { t } = useTranslation('incidents');
  const { data, isLoading } = useSettings();
  return (
    <Stack gap="lg">
      <PageHeader breadcrumbs={[{ label: t('module') }, { label: t('settingsPage.title') }]} title={t('settingsPage.title')} />
      {!isLoading && <SettingsForm initial={IncidentSettings.parse(data ?? {})} />}
    </Stack>
  );
}
