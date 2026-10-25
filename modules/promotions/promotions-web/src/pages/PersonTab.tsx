import { Group, Stack, Text } from '@mantine/core';
import { formatDate, useTranslation } from '@forga/web-sdk';
import { DataTable, Panel } from '@forga/web-ui';
import { useCatalogName, usePersonPromotion } from '../api';
import { DecisionBadge, ExplanationTree, ListStatusBadge, StateBadge } from '../parts';

type ListRow = { id: string; title: string; status: 'draft' | 'decided' | 'executed'; targetRank: string; decision: 'promote' | 'defer' | 'reject' };

/** Tab "Dienstgrad" in the person file (extension point `masterdata.person.tab`): next promotion with explanation. */
export function PersonTab({ personId }: { personId?: unknown }) {
  const { t, i18n } = useTranslation('promotions');
  const rank = useCatalogName('rank');
  const { data, isLoading } = usePersonPromotion(String(personId));
  if (isLoading) return <Text c="dimmed">{t('loading')}</Text>;
  if (!data) return null;
  const next = data.next;
  return (
    <Stack gap="md">
      <Panel title={t('person.title')}>
        <Text size="sm">{t('person.current', { rank: rank(data.rank), date: formatDate(data.rankSince, i18n.language) })}</Text>
      </Panel>
      <Panel title={t('person.next')} aside={next && next.targetRank && <StateBadge state={next.state} />}>
        {next?.targetRank && next.explanation ? (
          <Stack gap="xs">
            <Group gap="xs">
              <Text size="sm" fw={700}>{rank(next.targetRank)}</Text>
              {next.metOn && next.state !== 'excluded' && <Text size="sm" c="dimmed">{t('explain.metOn', { date: formatDate(next.metOn, i18n.language) })}</Text>}
            </Group>
            <ExplanationTree explanation={next.explanation} />
          </Stack>
        ) : (
          <Text size="sm" c="dimmed">{t('person.noRule')}</Text>
        )}
      </Panel>
      {data.lists.length > 0 && (
        <Panel title={t('person.lists')}>
          <DataTable<ListRow>
            rows={data.lists}
            rowKey={(l) => l.id}
            columns={[
              { key: 'title', header: t('fields.title'), render: (l) => l.title },
              { key: 'target', header: t('fields.targetRank'), render: (l) => rank(l.targetRank, true) },
              { key: 'decision', header: t('fields.decision'), render: (l) => <DecisionBadge decision={l.decision} /> },
              { key: 'status', header: t('fields.status'), render: (l) => <ListStatusBadge status={l.status} /> },
            ]}
          />
        </Panel>
      )}
    </Stack>
  );
}
