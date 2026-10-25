import { Group, Text } from '@mantine/core';
import type { ReactNode } from 'react';
import classes from './components.module.css';

/** Bar sticking to the bottom of the page with status text on the left and actions on the right. */
export function ActionBar({ info, children }: { info?: ReactNode; children: ReactNode }) {
  return (
    <div className={classes.actionBar}>
      <Group justify="space-between" wrap="wrap" gap="sm">
        <Text size="sm" c="dimmed">{info}</Text>
        <Group gap="sm">{children}</Group>
      </Group>
    </div>
  );
}
