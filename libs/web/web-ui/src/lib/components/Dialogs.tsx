import { Button, Drawer, Group, Modal, Stack, Text, Textarea } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { type ReactNode, useState } from 'react';
import { useTranslation } from '@forga/web-sdk';

/** Dialog on the desktop, sheet from the bottom on phones. */
export function ResponsiveDialog({
  opened,
  onClose,
  title,
  children,
  actions,
  size = 'md',
}: {
  opened: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  size?: string;
}) {
  const phone = useMediaQuery('(max-width: 48em)');
  const body = (
    <Stack gap="md">
      {children}
      {actions && <Group justify="flex-end" gap="sm">{actions}</Group>}
    </Stack>
  );
  if (phone) {
    return (
      <Drawer opened={opened} onClose={onClose} title={title} position="bottom" size="auto" radius={0}>
        {body}
      </Drawer>
    );
  }
  return (
    <Modal opened={opened} onClose={onClose} title={<Text fw={700} c="brand" size="lg">{title}</Text>} size={size}>
      {body}
    </Modal>
  );
}

/**
 * Confirmation for critical actions; says what happens and can require a reason
 * (e.g. unlocking a report, returning it to the author).
 */
export function ConfirmDialog({
  opened,
  onClose,
  title,
  description,
  confirmLabel,
  onConfirm,
  reason,
  loading,
  children,
}: {
  opened: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  onConfirm: (reason: string) => void;
  /** Label of a required reason field. */
  reason?: string;
  loading?: boolean;
  children?: ReactNode;
}) {
  const { t } = useTranslation('common');
  const [text, setText] = useState('');
  return (
    <ResponsiveDialog
      opened={opened}
      onClose={onClose}
      title={title}
      actions={
        <>
          <Button variant="outline" color="gray" onClick={onClose}>{t('actions.cancel')}</Button>
          <Button loading={loading} disabled={Boolean(reason) && !text.trim()} onClick={() => onConfirm(text.trim())}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {description && <Text size="sm">{description}</Text>}
      {children}
      {reason && <Textarea label={reason} required autosize minRows={2} value={text} onChange={(e) => setText(e.currentTarget.value)} />}
    </ResponsiveDialog>
  );
}
