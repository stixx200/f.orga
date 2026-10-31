import { Link } from 'react-router';
import { Anchor } from '@mantine/core';
import { formatDateTime, useTranslation } from '@forga/web-sdk';
import { DataTable, PageHeader, StatusBadge } from '@forga/web-ui';
import { usePersonalLinks } from '../api';

/** All personal access links the user may see. */
export function LinksPage() {
  const { t, i18n } = useTranslation('personal');
  const { data = [], isLoading } = usePersonalLinks();
  return (
    <>
      <PageHeader title={t('links.title')} subtitle={t('links.hint')} />
      <DataTable
        rows={data}
        rowKey={(row) => row.id}
        empty={isLoading ? null : t('links.empty')}
        columns={[
          {
            key: 'person',
            header: t('links.person'),
            render: (row) => <Anchor component={Link} to={`/masterdata/persons/${row.personId}`}>{row.lastName}, {row.firstName}</Anchor>,
          },
          { key: 'prefix', header: t('links.prefix'), render: (row) => row.keyPrefix || '–' },
          { key: 'created', header: t('links.created'), render: (row) => formatDateTime(row.createdAt, i18n.language) },
          { key: 'seen', header: t('links.lastSeen'), render: (row) => row.lastSeenAt ? formatDateTime(row.lastSeenAt, i18n.language) : t('links.never') },
          {
            key: 'status',
            header: t('links.status'),
            render: (row) => <StatusBadge tone={row.active ? 'done' : 'neutral'}>{t(row.active ? 'links.active' : 'links.revoked')}</StatusBadge>,
          },
        ]}
      />
    </>
  );
}
