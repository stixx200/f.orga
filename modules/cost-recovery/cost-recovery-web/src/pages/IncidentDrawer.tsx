import { Button, Drawer, Group, Stack, Table, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import type { NoticeIncident } from '@forga/cost-recovery-contracts';
import { api, formatDateTime, formatTime, useTranslation } from '@forga/web-sdk';
import { Notice as Hint } from '@forga/web-ui';
import { keys } from '../api';

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div>
      <Text size="xs" c="dimmed" fw={700}>{label}</Text>
      <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{children}</Text>
    </div>
  );
}

/**
 * The incident of a notice beside it: times, vehicles with their billed times, personnel, report texts and parties.
 * Without overlay, so the notice stays editable while the drawer is open.
 */
export function IncidentDrawer({ noticeId, opened, onClose }: { noticeId: string; opened: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation('cost-recovery');
  const { data: incident, isLoading, error } = useQuery({
    queryKey: [...keys.notice(noticeId), 'incident'],
    queryFn: () => api<NoticeIncident>(`cost-recovery/notices/${noticeId}/incident`),
    enabled: opened,
  });
  const time = (value: string | null) => (value ? formatTime(value, i18n.language) : '–');

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size="lg"
      withOverlay={false}
      lockScroll={false}
      trapFocus={false}
      closeOnClickOutside={false}
      title={incident ? t('incident.title', { number: incident.dispatchNumber }) : t('incident.show')}
    >
      {isLoading && <Text c="dimmed">{t('incident.loading')}</Text>}
      {error && <Hint kind="error">{t('incident.notAvailable')}</Hint>}
      {incident && (
        <Stack gap="md">
          <Group justify="space-between" align="start">
            <div>
              <Text fw={700}>{incident.alarmKeyword}{incident.alarmMessage ? ` – ${incident.alarmMessage}` : ''}</Text>
              <Text size="sm">{formatDateTime(incident.alarmedAt, i18n.language)}{incident.location ? ` · ${incident.location}` : ''}</Text>
            </div>
            <Button component="a" href={`/incidents/incidents/${incident.incidentId}`} target="_blank" variant="default" size="xs">{t('incident.open')}</Button>
          </Group>
          <Text size="xs" c="dimmed">{t('incident.hint')}</Text>
          <Block label={t('incident.chargeableReason')}>{incident.chargeableReason}</Block>
          <Block label={t('incident.notes')}>{incident.notes}</Block>
          {incident.reports.map((r) => (
            <Stack key={r.reportId} gap="xs" pt="sm" style={{ borderTop: '1px solid var(--mantine-color-gray-3)' }}>
              <Title order={4}>{r.department} · {t('incident.report', { number: r.number })}</Title>
              <Text size="sm">{t('incident.times', { alarm: time(r.alarmedAt), departed: time(r.departedAt), returned: time(r.returnedAt) })}</Text>
              <Block label={t('incident.commander')}>{r.incidentCommander}</Block>
              <Block label={t('incident.situation')}>{r.situation}</Block>
              <Block label={t('incident.actions')}>{r.actions}</Block>
              <Block label={t('incident.cause')}>{r.cause}</Block>
              <Text size="xs" c="dimmed" fw={700}>{t('incident.vehicles')}</Text>
              {r.vehicles.length ? (
                <Table fz="sm" withRowBorders={false}>
                  <Table.Tbody>
                    {r.vehicles.map((v) => (
                      <Table.Tr key={v.vehicleId}>
                        <Table.Td fw={700}>{v.name}</Table.Td>
                        <Table.Td>{time(v.departedAt ?? r.departedAt ?? r.alarmedAt)} – {time(v.returnedAt ?? r.returnedAt)}</Table.Td>
                        <Table.Td c="dimmed">{v.departedAt || v.returnedAt ? t('incident.ownTimes') : t('incident.reportTimes')}</Table.Td>
                        <Table.Td>{t('incident.crew', { count: v.crew })}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              ) : (
                <Text size="sm">{t('incident.none')}</Text>
              )}
              <Text size="xs" c="dimmed" fw={700}>{t('incident.personnel')}</Text>
              <Table fz="sm" withRowBorders={false}>
                <Table.Tbody>
                  {r.personnel.map((p, index) => (
                    <Table.Tr key={index}>
                      <Table.Td>{p.name}</Table.Td>
                      <Table.Td>{p.standby ? t('incident.standby') : p.vehicle}</Table.Td>
                      <Table.Td>{time(p.from)} – {time(p.to)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
              {r.parties.length > 0 && (
                <Block label={t('incident.parties')}>{r.parties.map((p) => [p.name, p.street, [p.postalCode, p.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')).join('\n')}</Block>
              )}
            </Stack>
          ))}
        </Stack>
      )}
    </Drawer>
  );
}
