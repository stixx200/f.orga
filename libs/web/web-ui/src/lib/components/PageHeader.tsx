import { Group, Stack, Text } from '@mantine/core';
import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router';
import classes from './components.module.css';

export interface Crumb {
  label: string;
  to?: string;
}

/** Breadcrumbs, page title in service red, optional badges, subtitle and actions on the right. */
export function PageHeader({
  breadcrumbs = [],
  title,
  badges,
  subtitle,
  actions,
}: {
  breadcrumbs?: Crumb[];
  title: ReactNode;
  badges?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <Stack gap={8} mb="lg">
      <Group justify="space-between" align="flex-end" wrap="wrap" gap="md">
        <div>
          {breadcrumbs.length > 0 && (
            <nav className={classes.breadcrumbs} aria-label="Breadcrumb">
              {breadcrumbs.map((crumb, index) => (
                <Fragment key={index}>
                  {index > 0 && ' › '}
                  {crumb.to ? <Link to={crumb.to} style={{ color: 'inherit' }}>{crumb.label}</Link> : crumb.label}
                </Fragment>
              ))}
            </nav>
          )}
          <h1 className={classes.title}>{title}</h1>
        </div>
        {actions && <Group gap="sm">{actions}</Group>}
      </Group>
      {badges && <Group gap={8}>{badges}</Group>}
      {subtitle && <Text c="dimmed">{subtitle}</Text>}
    </Stack>
  );
}
