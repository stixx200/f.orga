import { Button, Group, Select, Stack, Switch, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import type { ActiveModule } from '@forga/core-contracts';
import type { Terminal, TerminalLink } from '@forga/info-terminal-contracts';
import type { Department, Station } from '@forga/masterdata-contracts';
import { api, can, formatDateTime, send, useSession, useTranslation } from '@forga/web-sdk';
import { ConfirmDialog, DataTable, PageHeader, Panel, ResponsiveDialog, StatusBadge, useAction } from '@forga/web-ui';
import { fetchLink, keys, MANAGE, notSeenFor, useDepartments, useSettings, useStations, useTerminals } from '../api';
import { LinkDialog } from '../components/LinkDialog';
import { draftOf, emptyDraft, type TerminalDraft, TerminalForm } from '../components/TerminalForm';

/** Is the module training active (sessions at the terminal)? */
export function useTrainingActive(): boolean {
  const { data = [] } = useQuery({ queryKey: ['info-terminal', 'active-modules'], queryFn: () => api<ActiveModule[]>('core/modules'), staleTime: 5 * 60_000 });
  return data.some((m) => m.id === 'training');
}

export const departmentNames = (terminal: Pick<Terminal, 'departmentIds'>, departments: Department[]) =>
  terminal.departmentIds.map((id) => departments.find((d) => d.id === id)?.name).filter(Boolean).join(', ');

/** Shows the link dialog of a terminal (after fetching the link, which is audited). */
export function useLinkDialog() {
  const [link, setLink] = useState<{ link: TerminalLink; created: boolean } | null>(null);
  const show = useAction((terminal: Terminal) => fetchLink(terminal, 'show'), { onSuccess: (result) => setLink({ link: result, created: false }) });
  return { link, setLink, show };
}

/** "Verwaltung → Infoterminals": terminals of the own departments, creating, link, new link, revocation. */
export function TerminalsPage() {
  const { t, i18n } = useTranslation('info-terminal');
  const session = useSession().data;
  const [params] = useSearchParams();
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [includeRevoked, setIncludeRevoked] = useState(false);
  const { data: terminals = [] } = useTerminals(includeRevoked);
  const { data: departments = [] } = useDepartments();
  const { data: stations = [] } = useStations();
  const { data: settings } = useSettings();
  const training = useTrainingActive();
  const [draft, setDraft] = useState<TerminalDraft>(() => ({ ...emptyDraft(), stationId: params.get('stationId') }));
  const [editing, setEditing] = useState<{ terminal: Terminal; draft: TerminalDraft } | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'rotate' | 'revoke'; terminal: Terminal } | null>(null);
  const { link, setLink, show } = useLinkDialog();
  const station = (id: string): Station | undefined => stations.find((s) => s.id === id);
  const mayManage = (terminal: Terminal) => terminal.departmentIds.every((d) => can(session, MANAGE, d));

  const create = useAction((input: TerminalDraft) => send<TerminalLink>('POST', 'info-terminal/terminals', input), {
    invalidate: [keys.terminals],
    onSuccess: (result) => {
      setLink({ link: result, created: true });
      setDraft(emptyDraft());
    },
  });
  const update = useAction((input: { terminal: Terminal; draft: TerminalDraft }) => send<Terminal>('PUT', `info-terminal/terminals/${input.terminal.id}`, { ...input.draft, stationId: undefined, version: input.terminal.version }), {
    invalidate: [keys.terminals],
    success: t('terminals.saved'),
    onSuccess: () => setEditing(null),
  });
  const rotate = useAction((terminal: Terminal) => send<TerminalLink>('POST', `info-terminal/terminals/${terminal.id}/rotate`), {
    invalidate: [keys.terminals],
    onSuccess: (result) => setLink({ link: result, created: true }),
  });
  const revoke = useAction((terminal: Terminal) => send<Terminal>('POST', `info-terminal/terminals/${terminal.id}/revoke`), { invalidate: [keys.terminals], success: t('terminals.revoked') });

  const shown = terminals.filter((terminal) => !departmentId || terminal.departmentIds.includes(departmentId));
  const status = (terminal: Terminal) => {
    if (terminal.revokedAt) return <StatusBadge>{t('terminals.revokedOn', { date: formatDateTime(terminal.revokedAt, i18n.language), by: terminal.revokedBy ?? '' })}</StatusBadge>;
    const days = settings ? notSeenFor(terminal, settings.notSeenWarningDays) : null;
    return days ? <StatusBadge tone="warning">{t('terminals.notSeen', { count: days })}</StatusBadge> : <StatusBadge tone="done">{t('terminals.active')}</StatusBadge>;
  };
  const allowed = (terminal: Terminal) =>
    [t('terminals.incidents'), terminal.allowNewIncident && t('terminals.newIncident'), training && terminal.allowTraining && t('terminals.sessions')].filter(Boolean).join(', ');

  return (
    <Stack gap="lg">
      <PageHeader breadcrumbs={[{ label: t('administration') }, { label: t('terminals.title') }]} title={t('terminals.title')} />
      <Group align="end" gap="md">
        <Select
          label={t('terminals.department')}
          placeholder={t('terminals.allDepartments')}
          data={departments.map((d) => ({ value: d.id, label: d.name }))}
          value={departmentId}
          onChange={setDepartmentId}
          clearable
          w={280}
        />
        <Switch label={t('terminals.showRevoked')} checked={includeRevoked} onChange={(e) => setIncludeRevoked(e.currentTarget.checked)} />
      </Group>
      <DataTable
        exportable={false}
        rows={shown}
        rowKey={(terminal) => terminal.id}
        empty={t('terminals.empty')}
        highlight={(terminal) => Boolean(terminal.revokedAt) || (settings ? notSeenFor(terminal, settings.notSeenWarningDays) !== null : false)}
        columns={[
          {
            key: 'station',
            header: t('terminals.station'),
            render: (terminal) => (
              <>
                <Text fw={700} size="sm">{station(terminal.stationId)?.name ?? '–'}</Text>
                <Text size="xs" c="dimmed">{departments.find((d) => d.id === station(terminal.stationId)?.departmentId)?.shortName ?? ''}</Text>
              </>
            ),
          },
          { key: 'name', header: t('terminals.device'), render: (terminal) => terminal.name },
          { key: 'departments', header: t('terminals.departments'), render: (terminal) => departmentNames(terminal, departments) },
          { key: 'allowed', header: t('terminals.allowed'), render: allowed },
          { key: 'seen', header: t('terminals.lastSeen'), render: (terminal) => (terminal.lastSeenAt ? formatDateTime(terminal.lastSeenAt, i18n.language) : t('terminals.never')) },
          { key: 'status', header: t('terminals.status'), render: status },
          {
            key: 'actions',
            header: '',
            align: 'right',
            render: (terminal) =>
              !terminal.revokedAt &&
              mayManage(terminal) && (
                <Group gap={4} justify="flex-end" wrap="wrap">
                  <Button size="xs" variant="outline" loading={show.isPending && show.variables?.id === terminal.id} onClick={() => show.mutate(terminal)}>{t('terminals.showLink')}</Button>
                  <Button size="xs" variant="default" onClick={() => setEditing({ terminal, draft: draftOf(terminal) })}>{t('terminals.edit')}</Button>
                  <Button size="xs" variant="default" onClick={() => setConfirm({ kind: 'rotate', terminal })}>{t('terminals.rotate')}</Button>
                  <Button size="xs" variant="default" onClick={() => setConfirm({ kind: 'revoke', terminal })}>{t('terminals.revoke')}</Button>
                </Group>
              ),
          },
        ]}
      />
      {stations.some((s) => can(session, MANAGE, s.departmentId)) && (
        <Panel title={t('terminals.new')} maw={760}>
          <TerminalForm
            draft={draft}
            onChange={setDraft}
            stations={stations}
            departments={departments}
            stationFixed={false}
            training={training}
            submitLabel={t('terminals.create')}
            loading={create.isPending}
            onSubmit={() => create.mutate(draft)}
          />
        </Panel>
      )}
      <Text size="sm" c="dimmed" maw={760}>{t('terminals.hint')}</Text>
      {editing && (
        <ResponsiveDialog opened onClose={() => setEditing(null)} title={t('terminals.editTitle', { name: editing.terminal.name })} size="lg">
          <TerminalForm
            draft={editing.draft}
            onChange={(next) => setEditing({ ...editing, draft: next })}
            stations={stations}
            departments={departments}
            stationFixed
            training={training}
            submitLabel={t('terminals.save')}
            loading={update.isPending}
            onSubmit={() => update.mutate(editing)}
          />
        </ResponsiveDialog>
      )}
      {link && (
        <LinkDialog
          link={link.link}
          created={link.created}
          stationName={station(link.link.terminal.stationId)?.name ?? ''}
          departments={departmentNames(link.link.terminal, departments)}
          onClose={() => setLink(null)}
        />
      )}
      <ConfirmDialog
        opened={!!confirm}
        onClose={() => setConfirm(null)}
        title={t(confirm?.kind === 'revoke' ? 'terminals.revokeTitle' : 'terminals.rotateTitle')}
        description={t(confirm?.kind === 'revoke' ? 'terminals.revokeText' : 'terminals.rotateText', { name: confirm?.terminal.name, station: station(confirm?.terminal.stationId ?? '')?.name ?? '' })}
        confirmLabel={t(confirm?.kind === 'revoke' ? 'terminals.revoke' : 'terminals.rotateConfirm')}
        onConfirm={() => {
          if (confirm?.kind === 'revoke') revoke.mutate(confirm.terminal);
          if (confirm?.kind === 'rotate') rotate.mutate(confirm.terminal);
          setConfirm(null);
        }}
      />
    </Stack>
  );
}
