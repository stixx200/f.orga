import { Group, Stack, Text } from '@mantine/core';
import { classNames } from '@forga/masterdata-contracts';
import { formatDate, useTranslation } from '@forga/web-sdk';
import { Panel, StatusBadge } from '@forga/web-ui';
import { STATE_TONES, useMyLicense } from './api';
import { useCheckText, useDueText } from './LicensePage';

/**
 * "Mein Bereich": the own licence with classes, expiry, latest and next check. Self-checks happen only at the info
 * terminal of the station, not on the own phone.
 */
export function MyDriverLicense() {
  const { t, i18n } = useTranslation('masterdata');
  const { data } = useMyLicense();
  const checkText = useCheckText();
  const dueText = useDueText();
  if (!data || (!data.monitored && !data.license.classes.length)) return null;
  const expiries = [...new Set(data.license.classes.flatMap((c) => (c.expiresOn ? [c.expiresOn] : [])))].toSorted();
  const lines: [string, string][] = [
    [t('licenses.classes'), classNames(data.license.classes) || '–'],
    ...expiries.map((date): [string, string] => [
      t('licenses.validUntilClasses', { classes: data.license.classes.filter((c) => c.expiresOn === date).map((c) => c.class).join(', ') }),
      formatDate(date, i18n.language),
    ]),
    [t('licenses.lastCheck'), checkText(data.lastCheck) || '–'],
    [t('licenses.nextCheck'), dueText(data.next) || '–'],
  ];
  return (
    <Panel title={t('licenses.mine.title')} aside={data.state && <StatusBadge tone={STATE_TONES[data.state]}>{t(`licenses.states.${data.state}`)}</StatusBadge>}>
      <Stack gap={4}>
        {lines.map(([label, value]) => (
          <Group key={label} gap="xs" wrap="nowrap" align="flex-start">
            <Text size="sm" c="dimmed" w={160}>{label}</Text>
            <Text size="sm">{value}</Text>
          </Group>
        ))}
        <Text size="xs" c="dimmed" mt="xs">{t('licenses.mine.hint')}</Text>
      </Stack>
    </Panel>
  );
}
