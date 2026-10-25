import { Button, Group, Menu, Select, Stack, Text, Textarea } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { EntryDecision, ExcludedCandidate, ListEntry, PromotionList } from '@forga/promotions-contracts';
import { apiUrl, can, formatDate, formatDateTime, localDate, send, useSession, useTranslation } from '@forga/web-sdk';
import { ActionBar, ConfirmDialog, DataTable, EmptyState, Notice, PageHeader, Panel, ResponsiveDialog, useAction } from '@forga/web-ui';
import { DECIDE, keys, PROPOSE, useCatalog, useCatalogName, useDepartmentName, useDepartments, useList, usePersons } from '../api';
import { DecisionBadge, ListStatusBadge, MissingList, StateBadge } from '../parts';
import { ListDialog } from './ListsPage';

function EntryDialog({ list, entry, onClose }: { list: PromotionList; entry: ListEntry; onClose: () => void }) {
  const { t } = useTranslation('promotions');
  const { t: common } = useTranslation('common');
  const rank = useCatalogName('rank');
  const [decision, setDecision] = useState<EntryDecision>(entry.decision);
  const [comment, setComment] = useState(entry.comment);
  const save = useAction(() => send('PUT', `promotions/lists/${list.id}/entries/${entry.personId}`, { decision, comment, version: list.version }), { success: t('entry.saved'), invalidate: [keys.all], onSuccess: onClose });
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={`${entry.firstName} ${entry.lastName}: ${rank(entry.rank, true)} → ${rank(entry.targetRank, true)}`}
      actions={
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button loading={save.isPending} disabled={decision === 'reject' && !comment.trim()} onClick={() => save.mutate(undefined)}>{common('actions.save')}</Button>
        </Group>
      }
    >
      <Select label={t('fields.decision')} data={(['promote', 'defer', 'reject'] as const).map((d) => ({ value: d, label: t(`decision.${d}`) }))} value={decision} onChange={(v) => v && setDecision(v as EntryDecision)} allowDeselect={false} />
      <Textarea label={t('fields.comment')} description={decision === 'reject' ? t('entry.reasonRequired') : undefined} value={comment} onChange={(e) => setComment(e.currentTarget.value)} autosize minRows={2} />
    </ResponsiveDialog>
  );
}

function ManualDialog({ list, onClose }: { list: PromotionList; onClose: () => void }) {
  const { t } = useTranslation('promotions');
  const { t: common } = useTranslation('common');
  const { data: persons = [] } = usePersons();
  const { data: ranks = [] } = useCatalog('rank');
  const rankName = useCatalogName('rank');
  const [personId, setPersonId] = useState<string | null>(null);
  const [targetRank, setTargetRank] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const listed = new Set(list.entries.map((e) => e.personId));
  const save = useAction(() => send('POST', `promotions/lists/${list.id}/entries`, { personId, targetRank, comment, version: list.version }), { success: t('entry.added'), invalidate: [keys.all], onSuccess: onClose });
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={t('entry.manual')}
      actions={
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button loading={save.isPending} disabled={!personId || !targetRank || !comment.trim()} onClick={() => save.mutate(undefined)}>{common('actions.save')}</Button>
        </Group>
      }
    >
      <Text size="sm" c="dimmed">{t('entry.manualHint')}</Text>
      <Select label={t('fields.person')} searchable data={persons.filter((p) => !listed.has(p.id)).map((p) => ({ value: p.id, label: `${p.lastName}, ${p.firstName}` }))} value={personId} onChange={setPersonId} />
      <Select label={t('fields.targetRank')} data={ranks.filter((r) => r.active).map((r) => ({ value: r.key, label: rankName(r.key) }))} value={targetRank} onChange={setTargetRank} />
      <Textarea label={t('fields.reason')} value={comment} onChange={(e) => setComment(e.currentTarget.value)} autosize minRows={2} required />
    </ResponsiveDialog>
  );
}

function DecideDialog({ list, onClose }: { list: PromotionList; onClose: () => void }) {
  const { t } = useTranslation('promotions');
  const { t: common } = useTranslation('common');
  const [decidedOn, setDecidedOn] = useState(() => localDate());
  const [notes, setNotes] = useState(list.notes);
  const save = useAction(() => send('POST', `promotions/lists/${list.id}/decide`, { decidedOn, notes, version: list.version }), { success: t('list.decidedDone'), invalidate: [keys.all], onSuccess: onClose });
  const count = list.entries.filter((e) => e.decision === 'promote').length;
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={t('list.decide')}
      actions={
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button loading={save.isPending} onClick={() => save.mutate(undefined)}>{t('list.decide')}</Button>
        </Group>
      }
    >
      <Text size="sm">{t('list.decideHint', { count })}</Text>
      <DateInput label={t('fields.decidedOn')} value={decidedOn} onChange={(v) => v && setDecidedOn(v)} valueFormat="DD.MM.YYYY" />
      <Textarea label={t('fields.notes')} value={notes} onChange={(e) => setNotes(e.currentTarget.value)} autosize minRows={2} />
    </ResponsiveDialog>
  );
}

/** A promotion list: proposals of the departments, decision, certificates and execution. */
export function ListPage() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation('promotions');
  const navigate = useNavigate();
  const session = useSession().data;
  const rank = useCatalogName('rank');
  const department = useDepartmentName();
  const { data: departments = [] } = useDepartments();
  const { data: list, isLoading } = useList(id);
  const [editing, setEditing] = useState<ListEntry | null>(null);
  const [dialog, setDialog] = useState<'edit' | 'manual' | 'decide' | 'execute' | 'delete' | 'reopen' | null>(null);
  const [filter, setFilter] = useState('');
  const decide = can(session, DECIDE);
  const refresh = useAction(() => send('POST', `promotions/lists/${id}/refresh`, { version: list?.version }), { success: t('list.refreshed'), invalidate: [keys.all] });
  const execute = useAction(() => send('POST', `promotions/lists/${id}/execute`, { version: list?.version }), { success: t('list.executedDone'), invalidate: [keys.all, ['masterdata']], onSuccess: () => setDialog(null) });
  const reopen = useAction(() => send('POST', `promotions/lists/${id}/reopen`, { version: list?.version }), { success: t('list.reopened'), invalidate: [keys.all], onSuccess: () => setDialog(null) });
  const remove = useAction(() => send('DELETE', `promotions/lists/${id}`), { success: t('list.deleted'), invalidate: [keys.all], onSuccess: () => navigate('/promotions/lists') });
  const removeManual = useAction((personId: string) => send('DELETE', `promotions/lists/${id}/entries/${personId}?version=${list?.version}`), { success: t('entry.removed'), invalidate: [keys.all] });

  if (isLoading) return <Text c="dimmed">{t('loading')}</Text>;
  if (!list) return <EmptyState title={t('notFound')} />;
  const draft = list.status === 'draft';
  const rows = list.entries.filter((e) => !filter || e.decision === filter);
  const promote = list.entries.filter((e) => e.decision === 'promote').length;

  return (
    <Stack gap="lg">
      <PageHeader
        breadcrumbs={[{ label: t('module') }, { label: t('lists.title'), to: '/promotions/lists' }, { label: list.title }]}
        title={list.title}
        badges={<ListStatusBadge status={list.status} />}
        subtitle={t('list.subtitle', { reference: formatDate(list.referenceDate, i18n.language), effective: formatDate(list.effectiveDate, i18n.language) })}
        actions={
          <Group gap="xs">
              <Menu position="bottom-end">
                <Menu.Target><Button variant="default">{t('list.print')}</Button></Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item component="a" href={apiUrl('core/lists/promotions.list/export/pdf', { listId: id, lang: i18n.language })} target="_blank">{t('list.printAll')}</Menu.Item>
                  <Menu.Item component="a" href={apiUrl('core/lists/promotions.list/export/xlsx', { listId: id, lang: i18n.language })}>{t('list.excel')}</Menu.Item>
                  {[...new Set(list.entries.map((e) => e.departmentId).filter((d): d is string => d !== null))].map((d) => (
                    <Menu.Item key={d} component="a" href={apiUrl('core/lists/promotions.list/export/pdf', { listId: id, departmentId: d, lang: i18n.language })} target="_blank">
                      {departments.find((x) => x.id === d)?.name ?? d}
                    </Menu.Item>
                  ))}
                </Menu.Dropdown>
              </Menu>
              {decide && draft && <Button variant="default" onClick={() => setDialog('edit')}>{t('lists.edit')}</Button>}
              {decide && draft && <Button variant="default" loading={refresh.isPending} onClick={() => refresh.mutate(undefined)}>{t('list.refresh')}</Button>}
              {decide && list.status !== 'draft' && <Button component="a" href={apiUrl(`promotions/lists/${id}/certificates.pdf`)} target="_blank" variant="default">{t('list.certificates')}</Button>}
              {decide && list.status !== 'executed' && <Button variant="subtle" color="red" onClick={() => setDialog('delete')}>{t('list.delete')}</Button>}
          </Group>
        }
      />
      {list.status === 'decided' && <Notice kind="info">{t('list.decidedInfo', { date: formatDate(list.decidedOn, i18n.language), by: list.decidedBy ?? '' })}</Notice>}
      {list.status === 'executed' && <Notice kind="done">{t('list.executedInfo', { date: formatDateTime(list.executedAt ?? undefined, i18n.language) })}</Notice>}
      {list.notes && <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{list.notes}</Text>}
      <Panel
        title={t('list.entries')}
        aside={<Select size="xs" w={180} placeholder={t('list.allDecisions')} data={(['promote', 'defer', 'reject'] as const).map((d) => ({ value: d, label: t(`decision.${d}`) }))} value={filter || null} onChange={(v) => setFilter(v ?? '')} clearable />}
      >
        <DataTable<ListEntry>
          rows={rows}
          rowKey={(e) => e.personId}
          empty={t('list.empty')}
          columns={[
            { key: 'name', header: t('fields.name'), render: (e) => <><Text size="sm" fw={700}>{e.lastName}, {e.firstName}</Text><Text size="xs" c="dimmed">{department(e.departmentId)}</Text></> },
            { key: 'rank', header: t('fields.rank'), render: (e) => <><Text size="sm">{rank(e.rank, true)}</Text><Text size="xs" c="dimmed">{t('fields.since', { date: formatDate(e.rankSince, i18n.language) })}</Text></> },
            { key: 'target', header: t('fields.targetRank'), render: (e) => <Text size="sm" fw={700}>{rank(e.targetRank, true)}</Text> },
            { key: 'state', header: t('fields.state'), render: (e) => <><StateBadge state={e.state} />{e.state === 'preview' && e.metOn && <Text size="xs" c="dimmed">{t('explain.metOn', { date: formatDate(e.metOn, i18n.language) })}</Text>}{e.state === 'preview' && <MissingList missing={e.missing} />}</> },
            { key: 'decision', header: t('fields.decision'), render: (e) => <><DecisionBadge decision={e.decision} />{e.comment && <Text size="xs" c="dimmed">{e.comment}</Text>}</> },
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (e) => (
                <Group gap={4} justify="flex-end" wrap="nowrap">
                  {draft && (decide || can(session, PROPOSE, e.departmentId ?? undefined)) && <Button size="compact-xs" variant="default" onClick={() => setEditing(e)}>{t('entry.edit')}</Button>}
                  {draft && decide && e.state === 'manual' && <Button size="compact-xs" variant="subtle" color="red" onClick={() => removeManual.mutate(e.personId)}>{t('entry.remove')}</Button>}
                  {list.status !== 'draft' && decide && e.decision === 'promote' && <Button size="compact-xs" variant="subtle" component="a" href={apiUrl(`promotions/lists/${id}/certificates.pdf`, { personId: e.personId })} target="_blank">{t('entry.certificate')}</Button>}
                </Group>
              ),
            },
          ]}
        />
        {draft && decide && <Group mt="sm"><Button size="xs" variant="default" onClick={() => setDialog('manual')}>{t('entry.manual')}</Button></Group>}
      </Panel>
      {list.excluded.length > 0 && (
        <Panel title={t('list.excluded')} aside={<Text size="xs" c="dimmed">{t('list.excludedHint')}</Text>}>
          <DataTable<ExcludedCandidate>
            rows={list.excluded}
            rowKey={(e) => e.personId}
            columns={[
              { key: 'name', header: t('fields.name'), render: (e) => <><Text size="sm" c="dimmed">{e.lastName}, {e.firstName}</Text><Text size="xs" c="dimmed">{department(e.departmentId)}</Text></> },
              { key: 'rank', header: t('fields.rank'), render: (e) => <Text size="sm" c="dimmed">{rank(e.rank, true)}</Text> },
              { key: 'target', header: t('fields.targetRank'), render: (e) => <Text size="sm" c="dimmed">{rank(e.targetRank, true)}</Text> },
              {
                key: 'exclusion',
                header: t('list.exclusion'),
                render: (e) => (
                  <>
                    <StateBadge state="excluded" />
                    {e.exclusion && <Text size="xs" c="dimmed">{e.exclusion.until ? t('list.excludedUntil', { date: formatDate(e.exclusion.until, i18n.language) }) : t('list.excludedOpen')} · {e.exclusion.reason}</Text>}
                  </>
                ),
              },
            ]}
          />
        </Panel>
      )}
      {decide && list.status !== 'executed' && (
        <ActionBar info={t('list.summary', { promote, total: list.entries.length })}>
          {draft && <Button onClick={() => setDialog('decide')} disabled={promote === 0}>{t('list.decide')}</Button>}
          {list.status === 'decided' && <Button variant="default" onClick={() => setDialog('reopen')}>{t('list.reopen')}</Button>}
          {list.status === 'decided' && <Button onClick={() => setDialog('execute')}>{t('list.execute')}</Button>}
        </ActionBar>
      )}
      {editing && <EntryDialog list={list} entry={editing} onClose={() => setEditing(null)} />}
      {dialog === 'edit' && <ListDialog list={list} onClose={() => setDialog(null)} />}
      {dialog === 'manual' && <ManualDialog list={list} onClose={() => setDialog(null)} />}
      {dialog === 'decide' && <DecideDialog list={list} onClose={() => setDialog(null)} />}
      <ConfirmDialog opened={dialog === 'execute'} onClose={() => setDialog(null)} title={t('list.execute')} description={t('list.executeHint', { count: promote, date: formatDate(list.effectiveDate, i18n.language) })} confirmLabel={t('list.execute')} loading={execute.isPending} onConfirm={() => execute.mutate(undefined)} />
      <ConfirmDialog opened={dialog === 'reopen'} onClose={() => setDialog(null)} title={t('list.reopen')} description={t('list.reopenHint')} confirmLabel={t('list.reopen')} loading={reopen.isPending} onConfirm={() => reopen.mutate(undefined)} />
      <ConfirmDialog opened={dialog === 'delete'} onClose={() => setDialog(null)} title={t('list.delete')} description={t('list.deleteHint')} confirmLabel={t('list.delete')} loading={remove.isPending} onConfirm={() => remove.mutate(undefined)} />
    </Stack>
  );
}
