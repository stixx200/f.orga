import { Checkbox, SimpleGrid, Stack, Text } from '@mantine/core';
import { useState } from 'react';
import type { ImportResult, ImportRowAction } from '@forga/core-contracts';
import { translateCode, useTranslation } from '@forga/web-sdk';
import { DataTable, KpiTile, StatusBadge, type Tone } from '@forga/web-ui';

const TONES: Record<ImportRowAction, Tone> = { create: 'done', update: 'primary', unchanged: 'neutral', error: 'error' };

/** Counts and rows of an import check or import. */
export function ResultView({ result }: { result: ImportResult }) {
  const { t } = useTranslation('shell');
  const [onlyProblems, setOnlyProblems] = useState(result.counts.error > 0);
  const rows = result.rows.filter((r) => !onlyProblems || r.action === 'error' || r.messages.length > 0);
  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 2, md: 4 }}>
        {(['create', 'update', 'unchanged', 'error'] as const).map((action) => (
          <KpiTile key={action} value={result.counts[action] ?? 0} label={t(`imports.actions.${action}`)} attention={action === 'error' && result.counts.error > 0} />
        ))}
      </SimpleGrid>
      <Checkbox label={t('imports.onlyProblems')} checked={onlyProblems} onChange={(e) => setOnlyProblems(e.currentTarget.checked)} />
      <DataTable
        rows={rows.slice(0, 500)}
        rowKey={(r) => `${r.row}-${r.label}`}
        empty={t('imports.noProblems')}
        columns={[
          { key: 'row', header: t('imports.row'), width: 80, align: 'right', render: (r) => r.row },
          { key: 'action', header: t('imports.action'), width: 140, render: (r) => <StatusBadge tone={TONES[r.action]}>{t(`imports.actions.${r.action}`)}</StatusBadge> },
          { key: 'label', header: t('imports.record'), render: (r) => r.label },
          { key: 'messages', header: t('imports.messages'), render: (r) => r.messages.map((m) => translateCode(m.code, m.params)).join(' · ') },
        ]}
      />
      {rows.length > 500 && <Text size="sm" c="dimmed">{t('imports.truncated', { count: rows.length })}</Text>}
    </Stack>
  );
}
