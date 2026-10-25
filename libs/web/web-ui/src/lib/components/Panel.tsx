import { Group, Paper, type PaperProps } from '@mantine/core';
import type { ReactNode } from 'react';
import classes from './components.module.css';

/** A card (elevation 1) with an optional red title and something on the right (meta text or actions). */
export function Panel({ title, aside, children, ...props }: { title?: ReactNode; aside?: ReactNode; children: ReactNode } & PaperProps) {
  return (
    <Paper {...props}>
      {(title || aside) && (
        <Group justify="space-between" mb="md" wrap="nowrap" align="center">
          {title && <h2 className={classes.panelTitle}>{title}</h2>}
          {aside}
        </Group>
      )}
      {children}
    </Paper>
  );
}
