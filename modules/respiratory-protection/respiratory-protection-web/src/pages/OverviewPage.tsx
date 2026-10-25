import { Button, Group, Select, SimpleGrid, Stack, Text } from '@mantine/core';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { FitnessColor, FitnessStatus } from '@forga/respiratory-protection-contracts';
import { apiUrl, formatDate, useTranslation } from '@forga/web-sdk';
import { DataTable, KpiTile, PageHeader } from '@forga/web-ui';
import { useDepartments, useStatus } from '../api';
import { FitnessBadge } from '../parts';

const COLORS: FitnessColor[] = ['green', 'yellow', 'red'];

/** Traffic light of all breathing apparatus wearers with tiles per colour. */
export function OverviewPage() {
  const { t, i18n } = useTranslation('respiratory-protection');
  const navigate = useNavigate();
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [color, setColor] = useState<FitnessColor | null>(null);
  const { data: departments = [] } = useDepartments();
  const { data = [], isLoading } = useStatus({ departmentId: departmentId ?? undefined });
  const rows = data.filter((s) => !color || s.color === color);
  const department = (id: string) => departments.find((d) => d.id === id)?.shortName ?? '';
  const missing = (s: FitnessStatus) => s.conditions.filter((c) => !c.met).map((c) => t(`condition.${c.key}`)).join(', ');

  return (
    <Stack gap="lg">
      <PageHeader
        breadcrumbs={[{ label: t('module') }, { label: t('overview.title') }]}
        title={t('overview.title')}
        subtitle={t('overview.subtitle')}
        actions={
          <Button component="a" href={apiUrl('core/lists/respiratory-protection.fitness/export/pdf', { departmentId: departmentId ?? undefined, lang: i18n.language })} target="_blank" variant="default">
            {t('overview.pdf')}
          </Button>
        }
      />
      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        {COLORS.map((c) => (
          <KpiTile key={c} value={data.filter((s) => s.color === c).length} label={t(`color.${c}`)} hint={t(`overview.hint.${c}`)} attention={c === 'red' && data.some((s) => s.color === 'red')} selected={color === c} onClick={() => setColor(color === c ? null : c)} />
        ))}
      </SimpleGrid>
      <Group align="end">
        <Select label={t('overview.department')} placeholder={t('overview.allDepartments')} data={departments.map((d) => ({ value: d.id, label: d.name }))} value={departmentId} onChange={setDepartmentId} clearable />
        <Select label={t('overview.color')} placeholder={t('overview.allColors')} data={COLORS.map((c) => ({ value: c, label: t(`color.${c}`) }))} value={color} onChange={(v) => setColor(v as FitnessColor | null)} clearable />
      </Group>
      <DataTable<FitnessStatus>
        rows={rows}
        rowKey={(s) => s.personId}
        onRowClick={(s) => navigate(`/masterdata/persons/${s.personId}`)}
        empty={isLoading ? t('loading') : t('overview.empty')}
        columns={[
          { key: 'name', header: t('overview.name'), render: (s) => <Text fw={700} size="sm" c="brand">{s.lastName}, {s.firstName}</Text> },
          { key: 'department', header: t('overview.department'), render: (s) => s.departmentIds.map(department).join(', ') },
          { key: 'color', header: t('overview.color'), render: (s) => <FitnessBadge color={s.color} /> },
          { key: 'missing', header: t('overview.missing'), render: (s) => <Text size="sm" c="red.8">{missing(s)}</Text> },
          { key: 'next', header: t('overview.nextDue'), render: (s) => formatDate(s.nextDue, i18n.language) },
        ]}
      />
    </Stack>
  );
}
