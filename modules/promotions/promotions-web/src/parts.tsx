import { Group, List, Paper, Stack, Text, ThemeIcon } from '@mantine/core';
import type { ReactNode } from 'react';
import { IconCheck, IconClock, IconX } from '@tabler/icons-react';
import type { Condition, EntryDecision, EntryState, Explanation, ListStatus } from '@forga/promotions-contracts';
import { formatDate, useTranslation } from '@forga/web-sdk';
import { StatusBadge, type Tone } from '@forga/web-ui';
import { useCatalogName } from './api';

const STATE_TONES: Record<EntryState, Tone> = { fulfilled: 'done', preview: 'primary', missing: 'neutral', excluded: 'error', manual: 'warning' };
const DECISION_TONES: Record<EntryDecision, Tone> = { promote: 'done', defer: 'warning', reject: 'error' };
const LIST_TONES: Record<ListStatus, Tone> = { draft: 'warning', decided: 'primary', executed: 'done' };

export function StateBadge({ state }: { state: EntryState }) {
  const { t } = useTranslation('promotions');
  return <StatusBadge tone={STATE_TONES[state]}>{t(`state.${state}`)}</StatusBadge>;
}

export function DecisionBadge({ decision }: { decision: EntryDecision }) {
  const { t } = useTranslation('promotions');
  return <StatusBadge tone={DECISION_TONES[decision]}>{t(`decision.${decision}`)}</StatusBadge>;
}

export function ListStatusBadge({ status }: { status: ListStatus }) {
  const { t } = useTranslation('promotions');
  return <StatusBadge tone={LIST_TONES[status]}>{t(`listStatus.${status}`)}</StatusBadge>;
}

/** A condition in words, e.g. "3 Jahre im Dienstgrad" or "Lehrgang Truppführer". */
export function useConditionText() {
  const { t } = useTranslation('promotions');
  const rank = useCatalogName('rank');
  const qualification = useCatalogName('qualification');
  const office = useCatalogName('office');
  return (c: Condition): string => {
    switch (c.type) {
      case 'and':
        return t('condition.and');
      case 'or':
        return t('condition.or');
      case 'rank':
        return t('condition.rank', { ranks: c.ranks.map((r) => rank(r, true)).join(t('condition.orJoin')) });
      case 'years-in-rank':
      case 'years-since-joining':
      case 'min-interval':
        return t(`condition.${c.type}`, { count: c.years, years: String(c.years).replace('.', ',') });
      case 'qualification':
        return t('condition.qualification', { names: c.keys.map((k) => qualification(k)).join(t('condition.orJoin')) });
      case 'probation-ended':
        return t('condition.probation-ended');
      case 'musician':
        return t(c.value ? 'condition.musician' : 'condition.notMusician');
      case 'population': {
        const district = c.scope === 'department' ? 'District' : '';
        return [c.min !== null && t(`condition.populationMin${district}`, { value: c.min.toLocaleString() }), c.max !== null && t(`condition.populationMax${district}`, { value: c.max.toLocaleString() })].filter(Boolean).join(', ');
      }
      case 'office':
        return [
          t(c.current ? 'condition.officeCurrent' : 'condition.officeEver', { names: c.keys.map((k) => office(k)).join(t('condition.orJoin')) }),
          c.years ? t('condition.officeYears', { count: c.years, years: String(c.years).replace('.', ',') }) : '',
        ].filter(Boolean).join(', ');
    }
  };
}

function Status({ e }: { e: Explanation }) {
  const { t, i18n } = useTranslation('promotions');
  if (e.met) return <Text span size="xs" c="green.9">{t('explain.met')}</Text>;
  if (e.metOn) return <Text span size="xs" c="blue.8">{t('explain.metOn', { date: formatDate(e.metOn, i18n.language) })}</Text>;
  return <Text span size="xs" c="red.8">{t('explain.missing')}</Text>;
}

const icon = (e: Explanation) => (
  <ThemeIcon size={18} radius="xl" color={e.met ? 'green' : e.metOn ? 'blue' : 'red'} variant="light">
    {e.met ? <IconCheck size={12} /> : e.metOn ? <IconClock size={12} /> : <IconX size={12} />}
  </ThemeIcon>
);

/** "All of" groups add no information of their own; their conditions are shown in place. */
const flatten = (e: Explanation): Explanation[] => (e.condition.type === 'and' && e.children ? e.children.flatMap(flatten) : [e]);

/**
 * The rule as a list of conditions, each marked met, met on a date, or missing.
 * Alternatives ("one of") are shown as numbered boxes, each with its own conditions.
 */
export function ExplanationTree({ explanation }: { explanation: Explanation }) {
  const { t } = useTranslation('promotions');
  const text = useConditionText();
  const row = (e: Explanation, key: string) => (
    <Group key={key} gap="xs" wrap="nowrap" justify="space-between" align="flex-start">
      <Group gap="xs" wrap="nowrap" align="flex-start">
        {icon(e)}
        <Text size="sm">{text(e.condition)}</Text>
      </Group>
      <Status e={e} />
    </Group>
  );
  const block = (e: Explanation, key: string): ReactNode => {
    if (e.condition.type !== 'or' || !e.children) return row(e, key);
    return (
      <Stack key={key} gap={6}>
        <Group gap="xs" justify="space-between">
          <Text size="sm" fw={700}>{text(e.condition)}</Text>
          <Status e={e} />
        </Group>
        {e.children.map((option, i) => (
          <Paper key={`${key}.${i}`} withBorder p="xs" radius="sm" style={option.met ? { borderColor: 'var(--mantine-color-green-6)' } : undefined}>
            <Stack gap={6}>
              <Group gap="xs" justify="space-between">
                <Text size="xs" fw={700} c="dimmed" tt="uppercase">{t('condition.option', { n: i + 1 })}</Text>
                <Status e={option} />
              </Group>
              {flatten(option).map((c, j) => block(c, `${key}.${i}.${j}`))}
            </Stack>
          </Paper>
        ))}
      </Stack>
    );
  };
  return <Stack gap={8}>{flatten(explanation).map((e, i) => block(e, String(i)))}</Stack>;
}

/** What is still missing, one line each. */
export function MissingList({ missing }: { missing: Explanation[] }) {
  const text = useConditionText();
  const { t, i18n } = useTranslation('promotions');
  if (!missing.length) return null;
  return (
    <Stack gap={0}>
      {missing.map((m, i) => (
        <Text key={i} size="xs" c="dimmed">
          {text(m.condition)}
          {m.metOn ? ` (${t('explain.metOn', { date: formatDate(m.metOn, i18n.language) })})` : ''}
        </Text>
      ))}
    </Stack>
  );
}

/** A rule's condition as a tree in words (settings). */
export function ConditionTree({ condition }: { condition: Condition }) {
  const text = useConditionText();
  const node = (c: Condition, key: string) => (
    <List.Item key={key}>
      <Text size="sm">{text(c)}</Text>
      {(c.type === 'and' || c.type === 'or') && (
        <List spacing={2} size="sm" withPadding>
          {c.children.map((child, i) => node(child, `${key}.${i}`))}
        </List>
      )}
    </List.Item>
  );
  return <List spacing={2} size="sm">{node(condition, '0')}</List>;
}
