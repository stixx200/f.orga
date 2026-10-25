import { Text } from '@mantine/core';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import classes from './components.module.css';

/** Key figure on the start page; a red edge marks figures that need attention. Links with `to`, acts as a toggle with `onClick`. */
export function KpiTile({
  value,
  label,
  hint,
  to,
  attention,
  onClick,
  selected,
}: {
  value: ReactNode;
  label: string;
  hint?: string;
  to?: string;
  attention?: boolean;
  onClick?: () => void;
  selected?: boolean;
}) {
  const content = (
    <>
      <div className={classes.kpiValue}>{value}</div>
      <Text fw={700}>{label}</Text>
      {hint && <Text size="sm" c="dimmed">{hint}</Text>}
    </>
  );
  const className = `${classes.kpi} ${attention ? classes.attention : ''}`;
  if (to) return <Link to={to} className={className}>{content}</Link>;
  if (onClick) {
    return (
      <button type="button" className={`${className} ${classes.kpiButton}`} onClick={onClick} aria-pressed={selected ?? false}>
        {content}
      </button>
    );
  }
  return <div className={className}>{content}</div>;
}
