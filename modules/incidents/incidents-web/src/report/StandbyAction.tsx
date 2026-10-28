import { ActionIcon, Button, Menu, Tooltip } from '@mantine/core';
import { IconHome } from '@tabler/icons-react';
import type { ReactElement } from 'react';
import { useTranslation } from '@forga/web-sdk';

/**
 * One click puts a person on standby at the station of the report's department; with several stations a small menu
 * asks for the station, without one the action is disabled with a hint.
 */
export function StandbyAction({ stations, onChoose, variant, disabled }: {
  stations: { id: string; name: string }[];
  onChoose: (stationId: string) => void;
  variant: 'icon' | 'button';
  disabled?: boolean;
}) {
  const { t } = useTranslation('incidents');
  const trigger = (onClick?: () => void, off = false): ReactElement =>
    variant === 'icon' ? (
      <ActionIcon variant="subtle" color="gray" size="lg" aria-label={t('personnel.toStandbyHint')} onClick={onClick} disabled={off}>
        <IconHome size={18} />
      </ActionIcon>
    ) : (
      <Button variant="default" leftSection={<IconHome size={16} />} onClick={onClick} disabled={off}>
        {t('personnel.toStandby')}
      </Button>
    );

  if (!stations.length) {
    // Disabled buttons fire no events: the wrapper shows the hint.
    return (
      <Tooltip label={t('personnel.noStation')}>
        <span>{trigger(undefined, true)}</span>
      </Tooltip>
    );
  }
  if (stations.length === 1) {
    return <Tooltip label={t('personnel.toStandbyHint')}>{trigger(() => onChoose(stations[0].id), disabled)}</Tooltip>;
  }
  return (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        <Tooltip label={t('personnel.toStandbyHint')}>{trigger(undefined, disabled)}</Tooltip>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{t('personnel.chooseStation')}</Menu.Label>
        {stations.map((s) => (
          <Menu.Item key={s.id} onClick={() => onChoose(s.id)}>{s.name}</Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
