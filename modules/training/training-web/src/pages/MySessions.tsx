import { Button, Group, Stack, Text, Textarea } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { MySession, MyTraining } from '@forga/training-contracts';
import { api, formatDateTime, send, useTranslation } from '@forga/web-sdk';
import { DataTable, Panel, ResponsiveDialog, StatusBadge, useAction } from '@forga/web-ui';
import { useTypeName } from '../api';

const KEY = ['training', 'me'] as const;

function ExcuseDialog({ session, onClose }: { session: MySession; onClose: () => void }) {
  const { t, i18n } = useTranslation('training');
  const { t: common } = useTranslation('common');
  const [note, setNote] = useState(session.own?.note ?? '');
  const save = useAction(() => send('PUT', `training/me/sessions/${session.id}/excuse`, { note }), { success: t('me.excused'), invalidate: [KEY], onSuccess: onClose });
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={t('me.excuseTitle')}
      actions={
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button loading={save.isPending} onClick={() => save.mutate(undefined)}>{t('me.excuse')}</Button>
        </Group>
      }
    >
      <Text size="sm">{session.title} · {formatDateTime(session.startsAt, i18n.language)}</Text>
      <Textarea label={t('me.note')} description={t('me.noteHint')} value={note} onChange={(e) => setNote(e.currentTarget.value)} autosize minRows={2} />
    </ResponsiveDialog>
  );
}

function OwnStatus({ session }: { session: MySession }) {
  const { t } = useTranslation('training');
  if (!session.own) return <Text size="sm" c="dimmed">–</Text>;
  const tone = session.own.status === 'present' ? 'done' : session.own.status === 'excused' ? 'warning' : 'error';
  return (
    <>
      <StatusBadge tone={tone}>{t(`attendance.${session.own.status}`)}</StatusBadge>
      {session.own.note && <Text size="xs" c="dimmed">{session.own.note}</Text>}
    </>
  );
}

/** "My area": upcoming sessions of the own departments with excuses, past ones with the own attendance. */
export function MySessions() {
  const { t, i18n } = useTranslation('training');
  const typeName = useTypeName();
  const { data } = useQuery({ queryKey: KEY, queryFn: () => api<MyTraining>('training/me') });
  const [excusing, setExcusing] = useState<MySession | null>(null);
  const withdraw = useAction((id: string) => send('DELETE', `training/me/sessions/${id}/excuse`), { success: t('me.withdrawn'), invalidate: [KEY] });
  if (!data) return null;
  const columns = [
    { key: 'when', header: t('fields.startsAt'), render: (s: MySession) => formatDateTime(s.startsAt, i18n.language) },
    { key: 'title', header: t('fields.title'), render: (s: MySession) => <><Text size="sm" fw={700}>{s.title}</Text><Text size="xs" c="dimmed">{typeName(s.type)}</Text></> },
    { key: 'own', header: t('me.own'), render: (s: MySession) => <OwnStatus session={s} /> },
  ];
  return (
    <Stack gap="md">
      <Panel title={t('me.upcoming')} aside={<Text size="sm">{t('me.year', { present: data.year.present, sessions: data.year.sessions })}</Text>}>
        <DataTable<MySession>
          rows={data.upcoming}
          rowKey={(s) => s.id}
          empty={t('me.noUpcoming')}
          columns={[
            ...columns,
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (s) =>
                s.own?.status === 'excused' ? (
                  <Group gap={4} justify="flex-end" wrap="nowrap">
                    <Button size="compact-xs" variant="default" onClick={() => setExcusing(s)}>{t('me.changeNote')}</Button>
                    <Button size="compact-xs" variant="subtle" loading={withdraw.isPending} onClick={() => withdraw.mutate(s.id)}>{t('me.withdraw')}</Button>
                  </Group>
                ) : (
                  s.own?.status !== 'present' && s.status !== 'closed' && <Button size="compact-xs" variant="default" onClick={() => setExcusing(s)}>{t('me.excuse')}</Button>
                ),
            },
          ]}
        />
      </Panel>
      <Panel title={t('me.past')}>
        <DataTable<MySession> rows={data.past} rowKey={(s) => s.id} empty={t('me.noPast')} columns={columns} />
      </Panel>
      {excusing && <ExcuseDialog session={excusing} onClose={() => setExcusing(null)} />}
    </Stack>
  );
}
