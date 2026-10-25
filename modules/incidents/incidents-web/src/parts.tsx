import { Group, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconLock } from '@tabler/icons-react';
import type { Incident, ReleaseManyResult, ReportStatus } from '@forga/incidents-contracts';
import { translateCode, useTranslation } from '@forga/web-sdk';
import { StatusBadge, type Tone } from '@forga/web-ui';

const TONES: Record<ReportStatus, Tone> = {
  draft: 'warning',
  review: 'primary',
  'released-compensation': 'done',
  'released-billing': 'done',
};

export function ReportStatusBadge({ status, locked }: { status: ReportStatus; locked?: boolean }) {
  const { t } = useTranslation('incidents');
  return (
    <Group gap={4} wrap="nowrap">
      <StatusBadge tone={TONES[status]}>{t(`status.${status}`)}</StatusBadge>
      {locked && (
        <StatusBadge>
          <Group gap={2} wrap="nowrap"><IconLock size={12} aria-hidden />{t('locked')}</Group>
        </StatusBadge>
      )}
    </Group>
  );
}

/** Primary report dark, secondary reports light, as in the mockups. */
export function DepartmentBadge({ name, primary }: { name: string; primary: boolean }) {
  return <StatusBadge tone={primary ? 'primary' : 'highlight'}>{name}</StatusBadge>;
}

/** Overall state of an incident: the least advanced report status. */
export function incidentStatus(incident: Incident): ReportStatus | null {
  const order: ReportStatus[] = ['draft', 'review', 'released-compensation', 'released-billing'];
  const statuses = incident.reports.map((r) => r.status);
  return order.find((s) => statuses.includes(s)) ?? null;
}

export const keywordLabel = (incident: Pick<Incident, 'alarmKeyword' | 'alarmMessage'>) =>
  [incident.alarmKeyword, incident.alarmMessage].filter(Boolean).join(' ');

export const locationLabel = (incident: Pick<Incident, 'location'>) => {
  const { street, houseNumber, district, city } = incident.location;
  return [[city, district && district !== city ? district : ''].filter(Boolean).join('-'), [street, houseNumber].filter(Boolean).join(' ')].filter(Boolean).join(', ');
};

/**
 * Result of releasing several reports: the number released and every report that was not released with its
 * reason; shown as a warning as soon as one failed.
 */
export function notifyReleaseResult(result: ReleaseManyResult, label: (reportId: string) => string, t: (key: string, options?: Record<string, unknown>) => string): void {
  const failed = result.failed.length > 0;
  notifications.show({
    color: failed ? 'orange' : 'green',
    autoClose: failed ? false : undefined,
    title: failed ? t('review.notAllReleased', { count: result.failed.length }) : undefined,
    message: (
      <Stack gap={2}>
        <Text size="sm">{t('review.releasedMany', { count: result.released.length })}</Text>
        {result.failed.map((f) => (
          <Text key={f.reportId} size="sm">{`${label(f.reportId)}: ${translateCode(f.code)}`}</Text>
        ))}
      </Stack>
    ),
  });
}
