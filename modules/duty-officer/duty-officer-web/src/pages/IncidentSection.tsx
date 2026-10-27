import { Button, Group, Stack, Text, Textarea } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { can, formatDateTime, send, useSession, useTranslation } from '@forga/web-sdk';
import { Notice, Panel, ResponsiveDialog, StatusBadge, type Tone, useAction } from '@forga/web-ui';
import { canAny, keys, MANAGE, personName, READ, useIncidentDutyOfficer, usePersons, WRITE } from '../api';

const TONES: Record<string, Tone> = { draft: 'warning', review: 'primary', 'released-compensation': 'done', 'released-billing': 'done' };

/** Card "Einsatzleiter vom Dienst" on the incident page: the EvD report, who was on duty, "no duty officer". */
export function IncidentSection({ incidentId }: { incidentId?: unknown; chargeable?: unknown; disabled?: unknown }) {
  const { t, i18n } = useTranslation('duty-officer');
  const { t: common } = useTranslation('common');
  const session = useSession().data;
  const client = useQueryClient();
  const id = String(incidentId);
  const visible = canAny(session, READ, WRITE, MANAGE);
  const manager = can(session, MANAGE);
  const { data } = useIncidentDutyOfficer(id, visible);
  const { data: persons = [] } = usePersons();
  const [exempting, setExempting] = useState(false);
  const [reason, setReason] = useState('');
  const refresh = () => Promise.all([['incidents', 'incidents'], ['incidents', 'reports'], keys.incident(id)].map((queryKey) => client.invalidateQueries({ queryKey })));
  const exempt = useAction(() => send('POST', `duty-officer/incidents/${id}/exemption`, { reason: reason.trim() }), {
    success: t('incident.exemptedDone'),
    onSuccess: () => {
      setExempting(false);
      setReason('');
      void refresh();
    },
  });
  const create = useAction(() => send('POST', `duty-officer/incidents/${id}/report`, {}), { success: t('incident.created'), onSuccess: () => void refresh() });
  if (!visible || !data) return null;

  const name = (personId: string | null) => {
    const p = persons.find((x) => x.id === personId);
    return p ? personName(p) : '';
  };
  const { report, exemption } = data;

  return (
    <Panel title={t('incident.title')} aside={report && <StatusBadge tone={TONES[report.status] ?? 'neutral'}>{t(`status.${report.status}`)}</StatusBadge>}>
      <Stack gap="sm">
        {report && (
          <Text size="sm">
            <Text span c="dimmed">{t('incident.report')}: </Text>
            {report.number}
            {report.authorPersonId ? ` · ${name(report.authorPersonId)}` : ''}
          </Text>
        )}
        <Text size="sm">
          <Text span c="dimmed">{t('incident.onDuty')}: </Text>
          {data.onDuty.length ? data.onDuty.map(name).filter(Boolean).join(', ') : t('incident.nobodyOnDuty')}
        </Text>
        {exemption && <Text size="sm">{t('incident.exempted', { reason: exemption.reason, by: exemption.by, at: formatDateTime(exemption.at, i18n.language) })}</Text>}
        {data.missing && <Notice kind="warning">{t('incident.missing')}</Notice>}
        {!report && !exemption && !data.missing && <Text size="sm" c="dimmed">{data.reportRequired ? t('incident.none') : t('incident.notAutomatic')}</Text>}
        <Group justify="flex-end" gap="xs">
          {manager && (report || data.expected) && !exemption && !report?.locked && report?.status !== 'review' && !report?.status.startsWith('released') && (
            <Button variant="subtle" size="xs" onClick={() => setExempting(true)}>{t('incident.exempt')}</Button>
          )}
          {manager && !report && (
            <Button variant="outline" size="xs" loading={create.isPending} onClick={() => create.mutate(undefined)}>{t('incident.create')}</Button>
          )}
          {report && <Button component={Link} to={`/incidents/reports/${report.id}`} variant="outline" size="xs">{t('incident.open')}</Button>}
        </Group>
      </Stack>
      <ResponsiveDialog
        opened={exempting}
        onClose={() => setExempting(false)}
        title={t('incident.exemptTitle')}
        actions={
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setExempting(false)}>{common('actions.cancel')}</Button>
            <Button loading={exempt.isPending} disabled={!reason.trim()} onClick={() => exempt.mutate(undefined)}>{t('incident.exempt')}</Button>
          </Group>
        }
      >
        <Text size="sm" mb="sm">{t('incident.exemptText')}</Text>
        <Textarea label={t('incident.reason')} value={reason} onChange={(e) => setReason(e.currentTarget.value)} required autosize minRows={2} />
      </ResponsiveDialog>
    </Panel>
  );
}
