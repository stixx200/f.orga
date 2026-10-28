import { Button, Group, Stack, Text } from '@mantine/core';
import { IconDeviceTablet } from '@tabler/icons-react';
import { Link } from 'react-router';
import type { Station } from '@forga/masterdata-contracts';
import { can, formatDateTime, useSession, useTranslation } from '@forga/web-sdk';
import { notifyError, Panel, StatusBadge } from '@forga/web-ui';
import { MANAGE, notSeenFor, openTerminal, READ, useDepartments, useSettings, useTerminals } from '../api';
import { LinkDialog } from '../components/LinkDialog';
import { departmentNames, useLinkDialog } from './TerminalsPage';

/**
 * Card "Infoterminal" at a station in the organization of the master data (extension point
 * `masterdata.station.sections`): its terminals, "Öffnen" in this browser and "Link anzeigen" for those who manage
 * them, and the way to the administration.
 */
export function StationSection(props: Record<string, unknown>) {
  const station = props['station'] as Station;
  const { t, i18n } = useTranslation('info-terminal');
  const session = useSession().data;
  const readable = can(session, READ, station.departmentId) || can(session, MANAGE, station.departmentId);
  const { data: terminals = [] } = useTerminals();
  const { data: departments = [] } = useDepartments();
  const { data: settings } = useSettings();
  const { link, setLink, show } = useLinkDialog();
  if (!readable) return null;
  const own = terminals.filter((terminal) => terminal.stationId === station.id);
  const manage = can(session, MANAGE, station.departmentId);
  if (!own.length && !manage) return null;
  const short = (ids: string[]) => ids.map((id) => departments.find((d) => d.id === id)?.shortName).filter(Boolean).join(', ');

  return (
    <Panel title={t('station.title', { station: station.name })}>
      <Stack gap="sm">
        {own.length === 0 && <Text size="sm" c="dimmed">{t('station.none')}</Text>}
        {own.map((terminal) => {
          const days = settings ? notSeenFor(terminal, settings.notSeenWarningDays) : null;
          const mine = terminal.departmentIds.every((d) => can(session, MANAGE, d));
          return (
            <Group key={terminal.id} justify="space-between" wrap="nowrap" align="center">
              <Group gap="sm" wrap="nowrap" align="start">
                <IconDeviceTablet size={22} aria-hidden />
                <div>
                  <Text fw={700} size="sm">
                    {terminal.name} {days ? <StatusBadge tone="warning">{t('terminals.notSeen', { count: days })}</StatusBadge> : <StatusBadge tone="done">{t('terminals.active')}</StatusBadge>}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {short(terminal.departmentIds)} · {terminal.lastSeenAt ? t('station.lastSeen', { date: formatDateTime(terminal.lastSeenAt, i18n.language) }) : t('station.neverSeen')}
                  </Text>
                </div>
              </Group>
              {mine && (
                <Group gap={4} wrap="nowrap">
                  <Button size="xs" variant="outline" onClick={() => void openTerminal(terminal).catch(notifyError)}>{t('station.open')}</Button>
                  <Button size="xs" variant="default" loading={show.isPending && show.variables?.id === terminal.id} onClick={() => show.mutate(terminal)}>{t('terminals.showLink')}</Button>
                </Group>
              )}
            </Group>
          );
        })}
        <Text size="xs" c="dimmed">{t('station.hint')}</Text>
        <Group gap="xs">
          <Button size="xs" variant="default" component={Link} to={`/info-terminal/terminals?stationId=${station.id}`}>{t('station.manage')}</Button>
        </Group>
      </Stack>
      {link && <LinkDialog link={link.link} created={link.created} stationName={station.name} departments={departmentNames(link.link.terminal, departments)} onClose={() => setLink(null)} />}
    </Panel>
  );
}
