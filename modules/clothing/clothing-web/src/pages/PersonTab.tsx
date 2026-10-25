import { Button, Group, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { useState } from 'react';
import { Link } from 'react-router';
import type { PersonClothing } from '@forga/clothing-contracts';
import { can, send, useLocalized, useSession, useTranslation } from '@forga/web-sdk';
import { Panel, useAction } from '@forga/web-ui';
import { ISSUE, keys, useArticles, usePersonClothing, usePersons } from '../api';
import { PersonClothingView } from './PersonClothingView';
import { ReturnDialog } from './ReturnDialog';

/** Clothing sizes of a person per article; editable with `clothing.issue`. */
function SizesPanel({ personId, data, editable }: { personId: string; data: PersonClothing; editable: boolean }) {
  const { t } = useTranslation('clothing');
  const { t: common } = useTranslation('common');
  const localized = useLocalized();
  const { data: articles = [] } = useArticles();
  const [sizes, setSizes] = useState<Record<string, string>>(data.sizes);
  const relevant = articles.filter((a) => a.active && (a.sizes.length || data.sizes[a.key]));
  const save = useAction(() => send('PUT', `clothing/persons/${personId}/sizes`, { sizes }), { success: t('person.sizesSaved'), invalidate: [keys.all] });
  if (!editable) {
    const known = articles.filter((a) => data.sizes[a.key]);
    return (
      <Panel title={t('person.sizes')}>
        {known.length ? <Text size="sm">{known.map((a) => `${localized(a.name)}: ${data.sizes[a.key]}`).join(' · ')}</Text> : <Text size="sm" c="dimmed">{t('person.noSizes')}</Text>}
      </Panel>
    );
  }
  return (
    <Panel title={t('person.sizes')}>
      <Stack gap="sm">
        <Text size="xs" c="dimmed">{t('person.sizesHint')}</Text>
        <SimpleGrid cols={{ base: 2, sm: 4 }}>
          {relevant.map((a) =>
            a.sizes.length ? (
              <Select key={a.key} label={localized(a.name)} data={a.sizes} value={sizes[a.key] || null} onChange={(v) => setSizes((s) => ({ ...s, [a.key]: v ?? '' }))} clearable />
            ) : (
              <TextInput key={a.key} label={localized(a.name)} value={sizes[a.key] ?? ''} onChange={(e) => { const v = e.currentTarget.value; setSizes((s) => ({ ...s, [a.key]: v })); }} />
            ),
          )}
        </SimpleGrid>
        <Group justify="flex-end"><Button loading={save.isPending} onClick={() => save.mutate(undefined)}>{common('actions.save')}</Button></Group>
      </Stack>
    </Panel>
  );
}

/** Tab "Kleiderkammer" in the person file (extension point `masterdata.person.tab`). */
export function PersonTab({ personId }: { personId?: unknown }) {
  const { t } = useTranslation('clothing');
  const id = String(personId);
  const session = useSession().data;
  const { data: persons = [] } = usePersons();
  const { data, isLoading } = usePersonClothing(id);
  const [returning, setReturning] = useState(false);
  const person = persons.find((p) => p.id === id);
  const mayIssue = Boolean(person?.departmentIds.some((d) => can(session, ISSUE, d))) || session?.permissions[ISSUE] === 'brigade';
  if (isLoading) return <Text c="dimmed">{t('loading')}</Text>;
  if (!data) return null;
  return (
    <Stack gap="lg">
      {mayIssue && (
        <Group>
          <Button component={Link} to={`/clothing/issue?person=${id}`}>{t('person.issueFor')}</Button>
          <Button variant="default" disabled={!data.items.length} onClick={() => setReturning(true)}>{t('issue.takeBackAll')}</Button>
        </Group>
      )}
      <PersonClothingView data={data} personId={id} />
      <SizesPanel key={JSON.stringify(data.sizes)} personId={id} data={data} editable={mayIssue} />
      {returning && <ReturnDialog items={data.items} all onClose={() => setReturning(false)} />}
    </Stack>
  );
}

/** "My area": the own protective equipment and sizes. */
export function MyClothing() {
  const { t } = useTranslation('clothing');
  const { data, isLoading } = usePersonClothing(null, true);
  if (isLoading) return <Text c="dimmed">{t('loading')}</Text>;
  if (!data) return null;
  return (
    <Stack gap="lg">
      <PersonClothingView data={data} links={false} />
      {Object.keys(data.sizes).length > 0 && <SizesPanel personId="" data={data} editable={false} />}
    </Stack>
  );
}
