import { Box, Text } from '@mantine/core';
import { IconAlertTriangle, IconCircleCheck, IconInfoCircle, IconX } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from '@forga/web-sdk';
import classes from './components.module.css';

const ICONS = { error: IconX, warning: IconAlertTriangle, info: IconInfoCircle, done: IconCircleCheck };

/** Message box. Errors and warnings start with "Fehler:" / "Warnung:" so the meaning does not depend on color. */
export function Notice({ kind, children, action }: { kind: 'error' | 'warning' | 'info' | 'done'; children: ReactNode; action?: ReactNode }) {
  const { t } = useTranslation('common');
  const Icon = ICONS[kind];
  return (
    <div className={`${classes.notice} ${classes[`notice-${kind}`]}`} role={kind === 'error' ? 'alert' : 'status'}>
      <Icon size={20} stroke={1.75} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
      <Box style={{ flex: 1 }}>
        {/* A div, as the content may contain block elements such as input fields. */}
        <Text size="sm" component="div">
          {(kind === 'error' || kind === 'warning') && <strong>{t(`notice.${kind}`)} </strong>}
          {children}
        </Text>
      </Box>
      {action}
    </div>
  );
}
