import { Button, Center, Paper, Stack, Text, Title } from '@mantine/core';
import { useEffect } from 'react';
import { useTranslation } from '@forga/web-sdk';
import { LanguageSwitch } from '@forga/web-ui';

const RETRY_MS = 15_000;

/**
 * Shown instead of the application while the server answers `503 maintenance` (a backup is being restored); reloads
 * by itself as soon as the server answers again. On a kiosk page (info terminal) it reads „vorübergehend nicht
 * verfügbar“.
 */
export function MaintenancePage({ kiosk = false }: { kiosk?: boolean }) {
  const { t } = useTranslation('shell');
  useEffect(() => {
    const timer = setInterval(() => {
      fetch('/api/core/setup', { credentials: 'include' })
        .then((response) => {
          if (response.status !== 503) window.location.reload();
        })
        .catch(() => undefined);
    }, RETRY_MS);
    return () => clearInterval(timer);
  }, []);
  return (
    <Center mih="100vh" p="md">
      <Paper withBorder p="xl" w={460}>
        <Stack align="center" ta="center">
          <img src="/logo-full.svg" alt="" width={112} />
          {!kiosk && <LanguageSwitch loggedIn={false} />}
          <Title order={2} c="brand">{t(kiosk ? 'maintenance.kioskTitle' : 'maintenance.title')}</Title>
          <Text>{t(kiosk ? 'maintenance.kioskText' : 'maintenance.text')}</Text>
          {!kiosk && <Text size="sm" c="dimmed">{t('maintenance.hint')}</Text>}
          <Button size="lg" fullWidth onClick={() => window.location.reload()}>{t('maintenance.reload')}</Button>
        </Stack>
      </Paper>
    </Center>
  );
}
