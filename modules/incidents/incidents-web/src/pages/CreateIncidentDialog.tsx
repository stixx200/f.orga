import { Button, Group, MultiSelect, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { Incident, IncidentMatch, Report } from '@forga/incidents-contracts';
import { api, can, formatDateTime, fromLocalInput, send, toLocalInput, useLocalized, useSession, useTranslation, withQuery } from '@forga/web-sdk';
import { Notice, ResponsiveDialog, useAction } from '@forga/web-ui';
import { keys, RELEASE, useDepartments, useKeywords, useNames, WRITE } from '../api';

/**
 * New incident with a draft report for each chosen department; opens the report of the first department.
 * Existing incidents with the same dispatch number (or keyword within two hours) are offered first, so a
 * department joins a joint incident with its own report instead of creating a duplicate.
 */
export function CreateIncidentDialog({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation('incidents');
  const { t: common } = useTranslation('common');
  const localized = useLocalized();
  const navigate = useNavigate();
  const session = useSession().data;
  const { data: keywords = [] } = useKeywords();
  const { data: departments = [] } = useDepartments();
  const writable = departments.filter((d) => d.type !== 'veterans' && d.type !== 'youth' && (can(session, WRITE, d.id) || session?.permissions[RELEASE] === 'brigade'));
  const [form, setForm] = useState(() => ({
    alarmKeyword: null as string | null,
    alarmedAt: toLocalInput(new Date().toISOString()),
    dispatchNumber: '',
    alarmMessage: '',
    street: '',
    houseNumber: '',
    city: '',
    district: '',
    departmentIds: [] as string[],
  }));
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));
  const departmentIds = form.departmentIds.length ? form.departmentIds : writable.length === 1 ? [writable[0].id] : [];
  const names = useNames();
  const alarmedAt = form.alarmedAt ? fromLocalInput(form.alarmedAt) : null;
  const dispatchNumber = form.dispatchNumber.trim();
  const { data: matches = [] } = useQuery({
    queryKey: ['incidents', 'matches', dispatchNumber, form.alarmKeyword, alarmedAt],
    queryFn: () => api<IncidentMatch[]>(withQuery('incidents/incidents/matches', { dispatchNumber: dispatchNumber || undefined, alarmKeyword: form.alarmKeyword ?? undefined, alarmedAt: alarmedAt ?? undefined })),
    enabled: Boolean(alarmedAt) && Boolean(dispatchNumber || form.alarmKeyword),
  });
  const join = useAction(
    ({ incidentId, departmentId }: { incidentId: string; departmentId: string }) => send<Report>('POST', `incidents/incidents/${incidentId}/reports`, { departmentId }),
    {
      invalidate: [keys.incidents],
      onSuccess: (report) => {
        onClose();
        navigate(`/incidents/reports/${report.id}`);
      },
    },
  );

  const create = useAction(
    () =>
      send<Incident>('POST', 'incidents/incidents', {
        dispatchNumber: form.dispatchNumber.trim() || null,
        alarmKeyword: form.alarmKeyword,
        alarmMessage: form.alarmMessage,
        alarmedAt: fromLocalInput(form.alarmedAt),
        location: { street: form.street, houseNumber: form.houseNumber, city: form.city, district: form.district },
        departmentIds,
      }),
    {
      invalidate: [keys.incidents],
      onSuccess: (incident) => {
        onClose();
        const first = incident.reports.find((r) => r.departmentId === departmentIds[0]) ?? incident.reports[0];
        navigate(first ? `/incidents/reports/${first.id}` : `/incidents/incidents/${incident.id}`);
      },
    },
  );

  return (
    <ResponsiveDialog
      opened={opened}
      onClose={onClose}
      title={t('create.title')}
      size="lg"
      actions={
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button type="submit" form="create-incident" loading={create.isPending} disabled={!form.alarmKeyword || !departmentIds.length}>
            {t('create.submit')}
          </Button>
        </Group>
      }
    >
      <form
        id="create-incident"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate(undefined);
        }}
      >
        <Stack gap="sm">
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <Select
              label={t('fields.keyword')}
              data={keywords.filter((k) => k.active).map((k) => ({ value: k.key, label: `${k.key} – ${localized(k.name)}` }))}
              value={form.alarmKeyword}
              onChange={(value) => set('alarmKeyword', value)}
              searchable
              required
            />
            <TextInput label={t('fields.alarmedAt')} type="datetime-local" value={form.alarmedAt} onChange={(e) => set('alarmedAt', e.currentTarget.value)} required />
            <TextInput label={t('fields.dispatchNumber')} description={t('create.dispatchHint')} value={form.dispatchNumber} onChange={(e) => set('dispatchNumber', e.currentTarget.value)} />
            <TextInput label={t('fields.alarmMessage')} value={form.alarmMessage} onChange={(e) => set('alarmMessage', e.currentTarget.value)} />
            <TextInput label={t('fields.street')} value={form.street} onChange={(e) => set('street', e.currentTarget.value)} />
            <TextInput label={t('fields.houseNumber')} value={form.houseNumber} onChange={(e) => set('houseNumber', e.currentTarget.value)} />
            <TextInput label={t('fields.city')} value={form.city} onChange={(e) => set('city', e.currentTarget.value)} />
            <TextInput label={t('fields.district')} value={form.district} onChange={(e) => set('district', e.currentTarget.value)} />
          </SimpleGrid>
          {matches.length > 0 && (
            <Notice kind="warning">
              <Stack gap="xs">
                <Text size="sm" fw={700}>{t('create.matches')}</Text>
                {matches.map((m) => {
                  const own = writable.find((d) => (departmentIds.includes(d.id) || writable.length === 1) && !m.departmentIds.includes(d.id));
                  return (
                    <Group key={m.id} justify="space-between" wrap="nowrap" gap="sm">
                      <Text size="sm">
                        {`${m.alarmKeyword} · ${m.dispatchNumber} · ${formatDateTime(m.alarmedAt, i18n.language)}`}
                        {[m.street, m.city].some(Boolean) ? ` · ${[m.street, m.city].filter(Boolean).join(', ')}` : ''}
                        <Text span size="xs" c="dimmed">{` (${m.departmentIds.map((d) => names.department(d)).join(', ')})`}</Text>
                      </Text>
                      {own ? (
                        <Button size="xs" variant="outline" loading={join.isPending} onClick={() => join.mutate({ incidentId: m.id, departmentId: own.id })}>
                          {t('create.join', { department: own.name })}
                        </Button>
                      ) : (
                        <Text size="xs" c="dimmed">{t('create.chooseDepartment')}</Text>
                      )}
                    </Group>
                  );
                })}
                <Text size="xs" c="dimmed">{t('create.matchesHint')}</Text>
              </Stack>
            </Notice>
          )}
          <MultiSelect
            label={t('create.departments')}
            description={t('create.departmentsHint')}
            data={writable.map((d) => ({ value: d.id, label: d.name }))}
            value={departmentIds}
            onChange={(value) => set('departmentIds', value)}
            required
          />
        </Stack>
      </form>
    </ResponsiveDialog>
  );
}
