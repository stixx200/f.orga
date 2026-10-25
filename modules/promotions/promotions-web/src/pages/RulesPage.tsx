import { Button, Group, JsonInput, MultiSelect, NumberInput, SegmentedControl, Select, SimpleGrid, Stack, Switch, Text, Textarea, TextInput } from '@mantine/core';
import { useState } from 'react';
import { Condition, type Evaluation, PromotionRule, PromotionSettings, VWV_2022_RULES } from '@forga/promotions-contracts';
import { send, useLocalized, useTranslation } from '@forga/web-sdk';
import { ConfirmDialog, DataTable, PageHeader, Panel, ResponsiveDialog, useAction } from '@forga/web-ui';
import { keys, useCatalog, useCatalogName, usePersons, usePromotionSettings } from '../api';
import { ConditionTree, ExplanationTree, StateBadge } from '../parts';
import { ConditionEditor } from './ConditionEditor';

function RuleDialog({ rule, onSave, onClose }: { rule: PromotionRule; onSave: (rule: PromotionRule) => void; onClose: () => void }) {
  const { t } = useTranslation('promotions');
  const { t: common } = useTranslation('common');
  const { data: ranks = [] } = useCatalog('rank');
  const rankName = useCatalogName('rank');
  const { data: persons = [] } = usePersons();
  const [form, setForm] = useState(rule);
  const [mode, setMode] = useState<'graphic' | 'json'>('graphic');
  const [json, setJson] = useState(() => JSON.stringify(rule.condition, null, 2));
  const [personId, setPersonId] = useState<string | null>(null);
  const [result, setResult] = useState<Evaluation | null>(null);
  const parsed = (() => {
    try {
      return Condition.safeParse(JSON.parse(json));
    } catch {
      return null;
    }
  })();
  // The graphical editor and the JSON text share the condition; the text is the source while editing JSON.
  const setCondition = (condition: Condition) => {
    setJson(JSON.stringify(condition, null, 2));
    setResult(null);
  };
  const valid = parsed?.success && /^[a-z0-9][a-z0-9-]*$/.test(form.key) && form.description.de.trim() && form.description.en.trim();
  const test = useAction(() => send<Evaluation>('POST', 'promotions/rules/test', { personId, rule: { ...form, condition: parsed?.success ? parsed.data : form.condition } }), { onSuccess: setResult });
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      size="xl"
      title={t('rules.edit')}
      actions={
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button disabled={!valid} onClick={() => parsed?.success && onSave({ ...form, condition: parsed.data })}>{common('actions.confirm')}</Button>
        </Group>
      }
    >
      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <TextInput label={t('rules.key')} value={form.key} onChange={(e) => setForm({ ...form, key: e.currentTarget.value })} />
        <Select label={t('fields.targetRank')} data={ranks.map((r) => ({ value: r.key, label: rankName(r.key) }))} value={form.rank} onChange={(v) => v && setForm({ ...form, rank: v })} allowDeselect={false} />
        <Switch mt="xl" label={t('rules.active')} checked={form.active} onChange={(e) => setForm({ ...form, active: e.currentTarget.checked })} />
      </SimpleGrid>
      <TextInput label={t('rules.descriptionDe')} value={form.description.de} onChange={(e) => setForm({ ...form, description: { ...form.description, de: e.currentTarget.value } })} />
      <TextInput label={t('rules.descriptionEn')} value={form.description.en} onChange={(e) => setForm({ ...form, description: { ...form.description, en: e.currentTarget.value } })} />
      <Group justify="space-between" mt="sm">
        <Text size="sm" fw={500}>{t('rules.condition')}</Text>
        <SegmentedControl size="xs" value={mode} onChange={(v) => setMode(v as 'graphic' | 'json')} data={[{ value: 'graphic', label: t('editor.graphic') }, { value: 'json', label: 'JSON' }]} disabled={mode === 'json' && !parsed?.success} />
      </Group>
      {mode === 'graphic' && parsed?.success ? (
        <ConditionEditor value={parsed.data} onChange={setCondition} />
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <JsonInput aria-label={t('rules.condition')} description={t('rules.conditionHint')} value={json} onChange={(v) => { setJson(v); setResult(null); }} autosize minRows={12} maxRows={24} error={parsed?.success === false || parsed === null ? t('rules.conditionInvalid') : undefined} formatOnBlur />
          <Stack gap={4}>
            <Text size="sm" fw={500}>{t('rules.readable')}</Text>
            {parsed?.success && <ConditionTree condition={parsed.data} />}
          </Stack>
        </SimpleGrid>
      )}
      <Stack gap="xs" mt="sm">
        <Text size="sm" fw={500}>{t('editor.testTitle')}</Text>
        <Group align="end">
          <Select aria-label={t('editor.testPerson')} placeholder={t('editor.testPerson')} data={persons.map((p) => ({ value: p.id, label: `${p.lastName}, ${p.firstName}` }))} value={personId} onChange={(v) => { setPersonId(v); setResult(null); }} searchable clearable w={320} />
          <Button variant="default" disabled={!personId || !parsed?.success} loading={test.isPending} onClick={() => test.mutate(undefined)}>{t('editor.test')}</Button>
          {result && <StateBadge state={result.state} />}
        </Group>
        {result && <ExplanationTree explanation={result.explanation} />}
      </Stack>
    </ResponsiveDialog>
  );
}

function Form({ value }: { value: PromotionSettings }) {
  const { t } = useTranslation('promotions');
  const { t: common } = useTranslation('common');
  const localized = useLocalized();
  const rankName = useCatalogName('rank');
  const [form, setForm] = useState(value);
  const [editing, setEditing] = useState<number | null>(null);
  const [template, setTemplate] = useState(false);
  const save = useAction((v: PromotionSettings) => send('PUT', 'core/settings/promotions.general', v), { success: t('rules.saved'), invalidate: [keys.settings, keys.all] });
  const setRules = (rules: PromotionRule[]) => setForm({ ...form, rules });
  const blank: PromotionRule = { key: 'new-rule', rank: 'fm', description: { de: '', en: '' }, condition: { type: 'and', children: [{ type: 'rank', ranks: ['probation'] }] }, active: true };
  return (
    <Stack gap="md">
      <Panel
        title={t('rules.title')}
        aside={
          <Group gap="xs">
            <Button size="xs" variant="default" onClick={() => setTemplate(true)}>{t('rules.template')}</Button>
            <Button size="xs" variant="default" onClick={() => { setRules([...form.rules, blank]); setEditing(form.rules.length); }}>{t('rules.add')}</Button>
          </Group>
        }
      >
        <DataTable<PromotionRule & { index: number }>
          exportable={false}
          rows={form.rules.map((r, index) => ({ ...r, index }))}
          rowKey={(r) => String(r.index)}
          onRowClick={(r) => setEditing(r.index)}
          empty={t('rules.empty')}
          columns={[
            { key: 'rank', header: t('fields.targetRank'), render: (r) => <Text size="sm" fw={700}>{rankName(r.rank)}</Text> },
            { key: 'description', header: t('rules.description'), render: (r) => <Text size="sm" c={r.active ? undefined : 'dimmed'}>{localized(r.description)}</Text> },
            { key: 'active', header: t('rules.active'), render: (r) => <Switch aria-label={t('rules.active')} checked={r.active} onClick={(e) => e.stopPropagation()} onChange={(e) => setRules(form.rules.map((x, i) => (i === r.index ? { ...x, active: e.currentTarget.checked } : x)))} /> },
            { key: 'remove', header: '', align: 'right', render: (r) => <Button size="compact-xs" variant="subtle" color="red" onClick={(e) => { e.stopPropagation(); setRules(form.rules.filter((_, i) => i !== r.index)); }}>{t('rules.remove')}</Button> },
          ]}
        />
      </Panel>
      <Panel title={t('rules.general')}>
        <Stack gap="sm">
          <NumberInput label={t('rules.previewMonths')} description={t('rules.previewHint')} value={form.previewMonths} min={0} max={24} onChange={(v) => setForm({ ...form, previewMonths: Number(v) || 0 })} w={260} />
          <MultiSelect
            label={t('rules.eligibleStatuses')}
            description={t('rules.eligibleStatusesHint')}
            data={(['active', 'probation', 'passive', 'youth', 'veterans'] as const).map((s) => ({ value: s, label: t(`rules.statuses.${s}`) }))}
            value={form.eligibleStatuses}
            onChange={(v) => v.length && setForm({ ...form, eligibleStatuses: v as typeof form.eligibleStatuses })}
            maw={520}
          />
          <Textarea label={t('rules.certificateText')} description={t('rules.certificateHint')} value={form.certificateText} onChange={(e) => setForm({ ...form, certificateText: e.currentTarget.value })} autosize minRows={2} />
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <TextInput label={t('rules.certificatePlace')} value={form.certificatePlace} onChange={(e) => setForm({ ...form, certificatePlace: e.currentTarget.value })} />
            <TextInput label={t('rules.certificateSigner')} value={form.certificateSigner} onChange={(e) => setForm({ ...form, certificateSigner: e.currentTarget.value })} />
          </SimpleGrid>
        </Stack>
      </Panel>
      <Group justify="flex-end">
        <Button loading={save.isPending} onClick={() => save.mutate(form)}>{common('actions.save')}</Button>
      </Group>
      {editing !== null && form.rules[editing] && (
        <RuleDialog
          rule={form.rules[editing]}
          onClose={() => setEditing(null)}
          onSave={(rule) => {
            setRules(form.rules.map((r, i) => (i === editing ? rule : r)));
            setEditing(null);
          }}
        />
      )}
      <ConfirmDialog opened={template} onClose={() => setTemplate(false)} title={t('rules.template')} description={t('rules.templateHint')} confirmLabel={t('rules.templateApply')} onConfirm={() => { setRules(VWV_2022_RULES); setTemplate(false); }} />
    </Stack>
  );
}

/** Promotion rules as configuration (template VwV 2022) and the texts of the certificates. */
export function RulesPage() {
  const { t } = useTranslation('promotions');
  const { data, isLoading } = usePromotionSettings();
  return (
    <Stack gap="lg">
      <PageHeader breadcrumbs={[{ label: t('module') }, { label: t('rules.page') }]} title={t('rules.page')} />
      {isLoading ? <Text c="dimmed">{t('loading')}</Text> : <Form value={PromotionSettings.parse(data ?? {})} />}
    </Stack>
  );
}
