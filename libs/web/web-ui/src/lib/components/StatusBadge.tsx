import type { ReactNode } from 'react';
import classes from './components.module.css';

export type Tone = 'neutral' | 'error' | 'warning' | 'done' | 'primary' | 'highlight';

/** A state as text (the color only supports it), e.g. "überfällig", "Entwurf", "aktiv". */
export function StatusBadge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`${classes.badge} ${classes[`tone-${tone}`]}`}>{children}</span>;
}
