import { Group, Stack, Text } from '@mantine/core';
import type { Condition, FitnessColor } from '@forga/respiratory-protection-contracts';
import { formatDate, useTranslation } from '@forga/web-sdk';
import { StatusBadge, type Tone } from '@forga/web-ui';

const TONES: Record<FitnessColor, Tone> = { green: 'done', yellow: 'warning', red: 'error', grey: 'neutral' };

export function FitnessBadge({ color }: { color: FitnessColor }) {
  const { t } = useTranslation('respiratory-protection');
  return <StatusBadge tone={TONES[color]}>{t(`color.${color}`)}</StatusBadge>;
}

/** Conditions of the rule with date and validity; unmet ones first in red. */
export function ConditionList({ conditions }: { conditions: Condition[] }) {
  const { t, i18n } = useTranslation('respiratory-protection');
  return (
    <Stack gap={6}>
      {conditions.map((c) => (
        <Group key={c.key} gap="sm" wrap="nowrap" align="baseline">
          <Text fw={700} c={c.met ? 'green.8' : 'red.8'} w={16}>{c.met ? '✓' : '✗'}</Text>
          <Text size="sm" w={220}>{t(`condition.${c.key}`)}</Text>
          <Text size="sm" c="dimmed">
            {c.key === 'minimum-age' ? (
              t('conditions.from', { date: formatDate(c.dueOn, i18n.language) })
            ) : c.concerns ? (
              t('conditions.concerns', { date: formatDate(c.lastDate, i18n.language) })
            ) : (
              <>
                {c.lastDate ? t('conditions.lastOn', { date: formatDate(c.lastDate, i18n.language) }) : t('conditions.missing')}
                {c.dueOn && ` · ${t(c.met ? 'conditions.validUntil' : 'conditions.expiredOn', { date: formatDate(c.dueOn, i18n.language) })}`}
              </>
            )}
          </Text>
        </Group>
      ))}
    </Stack>
  );
}
