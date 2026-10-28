import { Button, Code, CopyButton, Group, Stack, Text } from '@mantine/core';
import { QRCodeSVG } from 'qrcode.react';
import type { TerminalLink } from '@forga/info-terminal-contracts';
import { useTranslation } from '@forga/web-sdk';
import { Notice, notifyError, ResponsiveDialog } from '@forga/web-ui';
import { fetchLink } from '../api';

/**
 * The link of a terminal with QR code, to scan with the tablet or to copy. `created`: right after creating it or
 * after a new link. Copying and opening are recorded in the audit log as well.
 */
export function LinkDialog({ link, created, stationName, departments, onClose }: { link: TerminalLink; created: boolean; stationName: string; departments: string; onClose: () => void }) {
  const { t } = useTranslation('info-terminal');
  const record = (purpose: 'copy' | 'open') => fetchLink(link.terminal, purpose).catch(notifyError);
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={created ? t('link.createdTitle') : t('link.title', { name: link.terminal.name })}
      actions={
        <Group gap="sm">
          <CopyButton value={link.url}>
            {({ copied, copy }) => (
              <Button
                variant="default"
                onClick={() => {
                  copy();
                  void record('copy');
                }}
              >
                {t(copied ? 'link.copied' : 'link.copy')}
              </Button>
            )}
          </CopyButton>
          {created ? (
            <Button onClick={onClose}>{t('link.done')}</Button>
          ) : (
            <Button
              onClick={() => {
                void record('open').then(() => window.location.assign(link.url));
              }}
            >
              {t('link.open')}
            </Button>
          )}
        </Group>
      }
    >
      <Stack gap="sm">
        {created ? (
          <Notice kind="done">
            <strong>{t('link.createdNotice')}</strong> {t('link.createdText')}
          </Notice>
        ) : (
          <Text size="sm" c="dimmed">{stationName} · {departments}</Text>
        )}
        <QRCodeSVG value={link.url} size={200} style={{ alignSelf: 'center' }} aria-label={t('link.qr')} />
        <Code block style={{ wordBreak: 'break-all' }} translate="no">{link.url}</Code>
        <Text size="sm" c="dimmed">{t(created ? 'link.hintCreated' : 'link.hint')}</Text>
      </Stack>
    </ResponsiveDialog>
  );
}
