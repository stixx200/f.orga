import { Group } from '@mantine/core';
import { IconLock } from '@tabler/icons-react';
import type { Incident, ReportStatus } from '@forga/incidents-contracts';
import { useTranslation } from '@forga/web-sdk';
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
