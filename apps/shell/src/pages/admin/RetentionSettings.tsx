import { Button, Checkbox, Group, NumberInput, Select, Stack, Table, Text } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  type RetentionSettings as RetentionSettingsValue,
  RETENTION_TEMPLATE_MUNICIPAL,
  type RetentionCategory,
  type RetentionResult,
  RetentionRule,
  retentionRuleKey,
} from '@forga/core-contracts';
import { api, can, send, useLocalized, useSession, useTranslation } from '@forga/web-sdk';
import { ConfirmDialog, Notice, Panel, ResponsiveDialog, StatusBadge, useAction } from '@forga/web-ui';

type Rules = Record<string, RetentionRule>;

const NONE = RetentionRule.parse({});
const SETTINGS_KEY = ['core', 'settings', 'retention'] as const;

/** Values of the select „Nach Ablauf“: an action, or offering to the archive and what happens after the decision. */
type Choice = 'none' | 'offer-archive:anonymize' | 'offer-archive:delete' | 'anonymize' | 'delete';
const CHOICES: Choice[] = ['none', 'offer-archive:anonymize', 'offer-archive:delete', 'anonymize', 'delete'];

const choiceOf = (rule: RetentionRule): Choice => (rule.action === 'offer-archive' ? `offer-archive:${rule.afterDecision ?? 'delete'}` : rule.action);
const allowed = (category: RetentionCategory, choice: Choice) => {
  const [action, after] = choice.split(':') as [RetentionRule['action'], RetentionRule['afterDecision'] | undefined];
  return category.actions.includes(action) && (!after || category.actions.includes(after));
};

/** One row of the table: a category, a subtype of it, or the other records of a category with subtypes. */
interface Row {
  key: string;
  category: RetentionCategory;
  name: string;
  description: string | null;
  removable: boolean;
}

/** Rows in the order of the page; `optional` subtypes only while they have a rule. */
function rowsOf(categories: RetentionCategory[], rules: Rules, localized: (text: { de: string; en: string }) => string): Row[] {
  return categories.flatMap((category) => {
    const base: Row = {
      key: category.key,
      category,
      name: category.subtypes.length && category.otherName ? localized(category.otherName) : localized(category.name),
      description: category.description ? localized(category.description) : null,
      removable: false,
    };
    const subtypes = category.subtypes
      .filter((s) => category.subtypeMode === 'fixed' || rules[retentionRuleKey(category.key, s.key)])
      .map((s) => ({
        key: retentionRuleKey(category.key, s.key),
        category,
        name: category.subtypeMode === 'fixed' ? localized(s.name) : `${localized(category.name)} „${localized(s.name)}“`,
        description: s.description ? localized(s.description) : null,
        removable: category.subtypeMode === 'optional',
      }));
    return [...subtypes, base];
  });
}

/** Rules as stored, with the defaults of the categories for missing rows. */
function initialRules(categories: RetentionCategory[], stored: Rules): Rules {
  const rules: Rules = { ...stored };
  for (const category of categories) rules[category.key] ??= category.defaultRule;
  return rules;
}

/**
 * Settings → Datenschutz → Aufbewahrung: per data category a period from an event and an action. Nothing happens until an
 * administrator chooses; the template „Kommunaler Aktenplan (Beispiel)“ fills the form only after a click.
 */
export function RetentionSettings() {
  const { data: categories } = useQuery({ queryKey: ['core', 'retention', 'categories'], queryFn: () => api<RetentionCategory[]>('core/retention/categories') });
  const { data: stored, isLoading } = useQuery({ queryKey: SETTINGS_KEY, queryFn: () => api<RetentionSettingsValue | null>('core/settings/retention') });
  if (!categories || isLoading) return null;
  return <RetentionForm categories={categories} initial={initialRules(categories, stored?.retention ?? {})} />;
}

function RetentionForm({ categories, initial }: { categories: RetentionCategory[]; initial: Rules }) {
  const { t } = useTranslation('shell');
  const { t: common } = useTranslation('common');
  const localized = useLocalized();
  const session = useSession().data;
  const [rules, setRules] = useState<Rules>(initial);
  const [templateApplied, setTemplateApplied] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [confirmRun, setConfirmRun] = useState(false);
  const [adding, setAdding] = useState<Record<string, string | null>>({});
  const rows = useMemo(() => rowsOf(categories, rules, localized), [categories, rules, localized]);
  const ruleOf = (key: string) => rules[key] ?? NONE;
  const set = (key: string, change: Partial<RetentionRule>) => setRules((current) => ({ ...current, [key]: { ...(current[key] ?? NONE), ...change } }));

  // What the rules of the form would affect today (dry run), recomputed shortly after each change.
  const [debounced] = useDebouncedValue(rules, 600);
  const preview = useQuery({
    queryKey: ['core', 'retention', 'preview', debounced],
    queryFn: () => send<RetentionResult>('POST', 'core/retention/run', { dryRun: true, settings: { retention: debounced } }),
  });
  const save = useAction(() => send('PUT', 'core/settings/retention', { retention: rules }), {
    success: t('settings.saved'),
    invalidate: [SETTINGS_KEY],
    onSuccess: () => setTemplateApplied(false),
  });
  const run = useAction(() => send<RetentionResult>('POST', 'core/retention/run', { dryRun: false }), {
    invalidate: [['core', 'retention']],
    onSuccess: () => setConfirmRun(false),
  });

  const applyTemplate = () => {
    const next: Rules = {};
    // Rows of the template only; everything else back to „nichts“ (the audit log keeps its default).
    for (const row of rowsOf(categories, {}, localized)) next[row.key] = NONE;
    for (const category of categories) if (category.key === 'core.audit') next[category.key] = category.defaultRule;
    for (const [key, rule] of Object.entries(RETENTION_TEMPLATE_MUNICIPAL)) {
      const category = categories.find((c) => key === c.key || key.startsWith(`${c.key}:`));
      const subtype = key.includes(':') ? key.slice(key.indexOf(':') + 1) : null;
      if (category && (!subtype || category.subtypes.some((s) => s.key === subtype))) next[key] = RetentionRule.parse(rule);
    }
    setRules(next);
    setTemplateApplied(true);
    setTemplateOpen(false);
  };

  const count = (key: string) => preview.data?.counts[key];
  const changed = JSON.stringify(rules) !== JSON.stringify(initial);

  return (
    <Stack gap="lg">
      <Notice kind="info">{t('retention.settings.intro')}</Notice>
      <Panel
        title={t('retention.settings.title')}
        aside={<Button variant="outline" size="xs" onClick={() => setTemplateOpen(true)}>{t('retention.template.button')}</Button>}
      >
        <Stack gap="md">
          {templateApplied && <Notice kind="warning">{t('retention.template.applied')}</Notice>}
          {preview.data?.warnings.map((code) => <Notice key={code} kind="warning">{t(`retention.warnings.${code}`)}</Notice>)}
          <Table.ScrollContainer minWidth={760}>
            <Table striped verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('retention.settings.category')}</Table.Th>
                  <Table.Th w={110}>{t('retention.settings.years')}</Table.Th>
                  <Table.Th w={230}>{t('retention.settings.action')}</Table.Th>
                  <Table.Th w={110}>{t('retention.settings.specialCase')}</Table.Th>
                  <Table.Th w={140}>{t('retention.settings.affected')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {categories.map((category) => {
                  const own = rows.filter((r) => r.category.key === category.key);
                  const addable = category.subtypeMode === 'optional' ? category.subtypes.filter((s) => !rules[retentionRuleKey(category.key, s.key)]) : [];
                  return (
                    <Fragment key={category.key}>
                      {own.map((row) => {
                        const rule = ruleOf(row.key);
                        const effective = preview.data?.effectiveYears[row.key];
                        const affected = count(row.key);
                        return (
                          <Table.Tr key={row.key}>
                            <Table.Td>
                              <Text size="sm" fw={700}>{row.name}</Text>
                              {row.description && <Text size="xs" c="dimmed">{row.description}</Text>}
                              <Text size="xs" c="dimmed">{t('retention.settings.from', { event: localized(category.event) })}</Text>
                              {rule.note && <Text size="xs" c="dimmed" fs="italic">{rule.note}</Text>}
                              {row.removable && (
                                <Button variant="subtle" size="compact-xs" px={0} onClick={() => setRules((current) => Object.fromEntries(Object.entries(current).filter(([k]) => k !== row.key)))}>
                                  {t('retention.settings.removeRow')}
                                </Button>
                              )}
                            </Table.Td>
                            <Table.Td>
                              <NumberInput
                                aria-label={t('retention.settings.years')}
                                min={1}
                                max={100}
                                value={rule.years ?? ''}
                                placeholder="–"
                                onChange={(value) => set(row.key, { years: value === '' ? null : Number(value) })}
                              />
                            </Table.Td>
                            <Table.Td>
                              <Select
                                aria-label={t('retention.settings.action')}
                                data={CHOICES.filter((c) => allowed(category, c)).map((c) => ({ value: c, label: t(`retention.choices.${c}`) }))}
                                value={choiceOf(rule)}
                                allowDeselect={false}
                                onChange={(value) => {
                                  const [action, after] = (value ?? 'none').split(':') as [RetentionRule['action'], RetentionRule['afterDecision'] | undefined];
                                  set(row.key, { action, afterDecision: after ?? null });
                                }}
                              />
                            </Table.Td>
                            <Table.Td>
                              <Checkbox label={t('retention.settings.check')} checked={rule.specialCase} disabled={rule.action === 'none'} onChange={(e) => set(row.key, { specialCase: e.currentTarget.checked })} />
                            </Table.Td>
                            <Table.Td>
                              {effective ? (
                                <StatusBadge tone="warning">{t('retention.settings.effective', { count: effective })}</StatusBadge>
                              ) : rule.action === 'none' || rule.years === null ? (
                                <Text size="sm" c="dimmed">–</Text>
                              ) : (
                                <Text size="sm">{affected === undefined ? '…' : affected}</Text>
                              )}
                            </Table.Td>
                          </Table.Tr>
                        );
                      })}
                      {addable.length > 0 && (
                        <Table.Tr>
                          <Table.Td colSpan={5}>
                            <Group gap="xs">
                              <Select
                                size="xs"
                                aria-label={t('retention.settings.addSubtype')}
                                placeholder={t('retention.settings.addSubtype')}
                                data={addable.map((s) => ({ value: s.key, label: localized(s.name) }))}
                                value={adding[category.key] ?? null}
                                onChange={(value) => setAdding((a) => ({ ...a, [category.key]: value }))}
                              />
                              <Button
                                size="xs"
                                variant="default"
                                disabled={!adding[category.key]}
                                onClick={() => {
                                  const key = retentionRuleKey(category.key, adding[category.key]!);
                                  setRules((current) => ({ ...current, [key]: current[category.key] ?? NONE }));
                                  setAdding((a) => ({ ...a, [category.key]: null }));
                                }}
                              >
                                {t('retention.settings.addRow')}
                              </Button>
                            </Group>
                          </Table.Td>
                        </Table.Tr>
                      )}
                    </Fragment>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          <Text size="xs" c="dimmed">{t('retention.settings.footnote')}</Text>
          <Group justify="space-between">
            <Group gap="sm">
              {can(session, 'core.retention.manage') && <Button component={Link} to="/admin/retention" variant="default">{t('retention.settings.toList')}</Button>}
              <Button variant="default" disabled={changed} onClick={() => setConfirmRun(true)}>{t('retention.settings.runNow')}</Button>
            </Group>
            <Button loading={save.isPending} onClick={() => save.mutate(undefined)}>{common('actions.save')}</Button>
          </Group>
          {run.data && (
            <Notice kind="info">
              {t('retention.settings.runResult', {
                executed: Object.entries(run.data.counts).filter(([key]) => key !== 'core.imports').reduce((sum, [, c]) => sum + c, 0),
                cases: Object.values(run.data.cases).reduce((sum, c) => sum + c, 0),
              })}
            </Notice>
          )}
          <Text size="xs" c="dimmed">{t('retention.settings.daily')}</Text>
        </Stack>
      </Panel>
      <ResponsiveDialog
        opened={templateOpen}
        onClose={() => setTemplateOpen(false)}
        title={t('retention.template.title')}
        size="lg"
        actions={
          <>
            <Button variant="default" onClick={() => setTemplateOpen(false)}>{common('actions.cancel')}</Button>
            <Button onClick={applyTemplate}>{t('retention.template.apply')}</Button>
          </>
        }
      >
        <Text size="sm">{t('retention.template.text')}</Text>
        <Table striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('retention.template.plan')}</Table.Th>
              <Table.Th>{t('retention.template.period')}</Table.Th>
              <Table.Th>{t('retention.template.category')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(['personnel', 'members', 'logBooks', 'brigade', 'logs', 'staffMeetings', 'committees'] as const).map((key) => (
              <Table.Tr key={key}>
                <Table.Td>{t(`retention.template.rows.${key}.plan`)}</Table.Td>
                <Table.Td>{t(`retention.template.rows.${key}.period`)}</Table.Td>
                <Table.Td>{t(`retention.template.rows.${key}.category`)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        <Text size="xs" c="dimmed">{t('retention.template.hint')}</Text>
      </ResponsiveDialog>
      <ConfirmDialog
        opened={confirmRun}
        onClose={() => setConfirmRun(false)}
        title={t('retention.settings.runTitle')}
        description={t('retention.settings.runText')}
        confirmLabel={t('retention.settings.runNow')}
        loading={run.isPending}
        onConfirm={() => run.mutate(undefined)}
      />
    </Stack>
  );
}
