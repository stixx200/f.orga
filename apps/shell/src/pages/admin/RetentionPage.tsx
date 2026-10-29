import { Anchor, Button, Checkbox, Chip, Group, Radio, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconDownload } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { RetentionCase, RetentionCaseStatus, RetentionCategory, RetentionExecutionResult, RetentionResult } from '@forga/core-contracts';
import { api, apiUrl, can, formatDate, send, translateCode, useLocalized, useSession, useTranslation } from '@forga/web-sdk';
import { ActionBar, ConfirmDialog, DataTable, Notice, notifySuccess, PageHeader, ResponsiveDialog, StatusBadge, type Tone, useAction } from '@forga/web-ui';

const CASES = ['core', 'retention', 'cases'] as const;
type View = 'due' | 'offered' | 'decided' | 'deferred' | 'done';
const VIEWS: Record<View, RetentionCaseStatus[]> = { due: ['due'], offered: ['offered'], decided: ['accepted', 'destroyed'], deferred: ['deferred'], done: ['done'] };
const TONES: Record<RetentionCaseStatus, Tone> = { due: 'warning', offered: 'primary', accepted: 'done', destroyed: 'done', deferred: 'neutral', done: 'done' };
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());

/** What „Ausführen“ does with a case: the action after the decision, or the action of a confirmed special case. */
const finalAction = (c: RetentionCase) =>
  c.status === 'accepted' || c.status === 'destroyed' ? c.afterDecision : c.status === 'due' && (c.action === 'anonymize' || c.action === 'delete') ? c.action : null;

/**
 * Verwaltung → Aussonderung: records whose retention period has passed. Offer them to the archive (export as ZIP), record
 * the decision of the archive, defer special cases, and finally anonymise or delete them in f.orga.
 */
export function RetentionPage() {
  const { t, i18n } = useTranslation('shell');
  const { t: common } = useTranslation('common');
  const localized = useLocalized();
  const session = useSession().data;
  const { data: cases = [] } = useQuery({ queryKey: CASES, queryFn: () => api<RetentionCase[]>('core/retention/cases') });
  const { data: categories = [] } = useQuery({ queryKey: ['core', 'retention', 'categories'], queryFn: () => api<RetentionCategory[]>('core/retention/categories') });
  const [view, setView] = useState<View>('due');
  const [category, setCategory] = useState<string | null>(null);
  const [dueUntil, setDueUntil] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [dialog, setDialog] = useState<'offer' | 'decide' | 'defer' | 'execute' | null>(null);
  const [offer, setOffer] = useState({ archive: '', note: '' });
  const [decision, setDecision] = useState({ decision: 'accepted' as 'accepted' | 'destroyed', date: today(), note: '' });
  const [deferral, setDeferral] = useState({ until: '', reason: '' });

  const byKey = useMemo(() => new Map(categories.map((c) => [c.key, c])), [categories]);
  const categoryName = (c: RetentionCase) => {
    const definition = byKey.get(c.category);
    if (!definition) return c.category;
    const subtype = c.ruleKey.includes(':') ? definition.subtypes.find((s) => `${definition.key}:${s.key}` === c.ruleKey) : null;
    if (subtype) return definition.subtypeMode === 'fixed' ? localized(subtype.name) : `${localized(definition.name)} „${localized(subtype.name)}“`;
    return definition.subtypes.length && definition.otherName ? localized(definition.otherName) : localized(definition.name);
  };
  const rows = cases.filter((c) => VIEWS[view].includes(c.status) && (!category || c.category === category) && (!dueUntil || c.dueSince <= dueUntil));
  const chosen = cases.filter((c) => selected.includes(c.id));
  const counts = Object.fromEntries((Object.keys(VIEWS) as View[]).map((v) => [v, cases.filter((c) => VIEWS[v].includes(c.status)).length])) as Record<View, number>;
  const toggle = (id: string, on: boolean) => setSelected((s) => (on ? [...s, id] : s.filter((x) => x !== id)));
  const done = () => {
    setDialog(null);
    setSelected([]);
  };
  const download = (offerId: string) => window.location.assign(apiUrl(`core/retention/offers/${offerId}/export`, { lang: i18n.language }));

  const offerAction = useAction(() => send<{ offerId: string }>('POST', 'core/retention/cases/offer', { caseIds: selected, ...offer }), {
    invalidate: [CASES],
    onSuccess: ({ offerId }) => {
      done();
      download(offerId);
    },
  });
  const decideAction = useAction(() => send('POST', 'core/retention/cases/decide', { caseIds: selected, ...decision }), { invalidate: [CASES], success: t('retention.list.decided'), onSuccess: done });
  const deferAction = useAction(() => send('POST', 'core/retention/cases/defer', { caseIds: selected, ...deferral }), { invalidate: [CASES], success: t('retention.list.deferredDone'), onSuccess: done });
  const executeAction = useAction(() => send<RetentionExecutionResult>('POST', 'core/retention/cases/execute', { caseIds: selected }), {
    invalidate: [CASES],
    onSuccess: (result) => {
      done();
      notifySuccess(t('retention.list.executed', { count: result.executed }));
      for (const failure of result.failed) {
        const c = cases.find((x) => x.id === failure.caseId);
        notifications.show({ color: 'brand', message: `${c?.label ?? failure.caseId}: ${translateCode(failure.code)}` });
      }
    },
  });
  const refresh = useAction(() => send<RetentionResult>('POST', 'core/retention/run', { dryRun: false }), {
    invalidate: [CASES],
    success: t('retention.list.refreshed'),
  });

  const executable = chosen.filter((c) => finalAction(c));
  const anonymize = executable.filter((c) => finalAction(c) === 'anonymize').length;
  const remove = executable.filter((c) => finalAction(c) === 'delete').length;

  const state = (c: RetentionCase) => {
    const date = (value: string | null) => (value ? formatDate(value, i18n.language) : '');
    const text =
      c.status === 'offered'
        ? t('retention.status.offeredTo', { date: date(c.offeredAt), archive: c.archive ?? '' })
        : c.status === 'accepted' || c.status === 'destroyed'
          ? t(`retention.status.${c.status}On`, { date: date(c.decidedOn) })
          : c.status === 'deferred'
            ? t('retention.status.deferredUntil', { date: date(c.deferredUntil) })
            : c.status === 'done'
              ? t(`retention.status.done.${c.executedAction ?? 'delete'}`, { date: date(c.executedAt) })
              : c.specialCase && c.action !== 'offer-archive'
                ? t('retention.status.dueSpecial')
                : t('retention.status.due');
    return (
      <Stack gap={4}>
        <StatusBadge tone={c.blockedBy ? 'error' : TONES[c.status]}>{c.blockedBy ? t('retention.status.blocked', { reason: translateCode(c.blockedBy) }) : text}</StatusBadge>
        {c.status === 'deferred' && c.deferReason && <Text size="xs" c="dimmed">{c.deferReason}</Text>}
        {c.offerId && c.status !== 'done' && (
          <Anchor size="xs" href={apiUrl(`core/retention/offers/${c.offerId}/export`, { lang: i18n.language })}>
            <IconDownload size={12} /> {t('retention.list.export')}
          </Anchor>
        )}
      </Stack>
    );
  };

  return (
    <Stack gap="lg">
      <PageHeader
        breadcrumbs={[{ label: t('nav.administration') }, { label: t('nav.retention') }]}
        title={t('nav.retention')}
        actions={
          <Group gap="sm">
            <Button variant="default" loading={refresh.isPending} onClick={() => refresh.mutate(undefined)}>{t('retention.list.refresh')}</Button>
            {can(session, 'core.settings.manage') && <Button component={Link} to="/admin/settings?tab=retention" variant="default">{t('retention.list.periods')}</Button>}
          </Group>
        }
      />
      <Chip.Group value={view} onChange={(value) => { setView(value as View); setSelected([]); }}>
        <Group gap="xs">
          {(Object.keys(VIEWS) as View[]).map((v) => (
            <Chip key={v} value={v} radius="xs">{v === 'done' ? t(`retention.views.${v}`) : `${t(`retention.views.${v}`)} (${counts[v]})`}</Chip>
          ))}
        </Group>
      </Chip.Group>
      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <Select
          label={t('retention.list.category')}
          placeholder={t('retention.list.allCategories')}
          clearable
          data={categories.filter((c) => cases.some((x) => x.category === c.key)).map((c) => ({ value: c.key, label: localized(c.name) }))}
          value={category}
          onChange={setCategory}
        />
        <TextInput label={t('retention.list.dueUntil')} type="date" value={dueUntil} onChange={(e) => setDueUntil(e.currentTarget.value)} />
      </SimpleGrid>
      {view === 'due' && <Text size="sm" c="dimmed">{t('retention.list.hint')}</Text>}
      <DataTable
        rows={rows}
        rowKey={(c) => c.id}
        empty={t('retention.list.empty')}
        columns={[
          {
            key: 'select',
            header: '',
            width: 40,
            render: (c) => view !== 'done' && <Checkbox aria-label={c.label} checked={selected.includes(c.id)} onChange={(e) => toggle(c.id, e.currentTarget.checked)} />,
          },
          { key: 'category', header: t('retention.list.category'), render: (c) => categoryName(c) },
          {
            key: 'record',
            header: t('retention.list.record'),
            render: (c) => (
              <Stack gap={2}>
                <Text size="sm">{c.label}</Text>
                <Text size="xs" c="dimmed">
                  {[
                    byKey.get(c.category) ? `${localized(byKey.get(c.category)!.event)} ${formatDate(c.eventDate, i18n.language)}` : formatDate(c.eventDate, i18n.language),
                    c.reason && localized(c.reason),
                    c.attachments > 0 && t('retention.list.attachments', { count: c.attachments }),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </Stack>
            ),
          },
          { key: 'dueSince', header: t('retention.list.dueSince'), render: (c) => formatDate(c.dueSince, i18n.language) },
          { key: 'state', header: t('retention.list.state'), render: state },
        ]}
      />
      {view !== 'done' && (
        <ActionBar info={t('retention.list.selected', { count: selected.length })}>
          <Button variant="default" disabled={!chosen.length} onClick={() => setDialog('defer')}>{t('retention.list.defer')}</Button>
          <Button variant="default" disabled={!chosen.length || chosen.some((c) => !['offered', 'accepted', 'destroyed'].includes(c.status))} onClick={() => setDialog('decide')}>
            {t('retention.list.decide')}
          </Button>
          <Button variant="default" disabled={!executable.length || executable.length !== chosen.length} onClick={() => setDialog('execute')}>{t('retention.list.execute')}</Button>
          <Button disabled={!chosen.length || chosen.some((c) => c.status !== 'due' && c.status !== 'offered')} onClick={() => setDialog('offer')}>{t('retention.list.offer')}</Button>
        </ActionBar>
      )}

      <ResponsiveDialog
        opened={dialog === 'offer'}
        onClose={() => setDialog(null)}
        title={t('retention.offer.title')}
        actions={
          <>
            <Button variant="default" onClick={() => setDialog(null)}>{common('actions.cancel')}</Button>
            <Button loading={offerAction.isPending} disabled={!offer.archive.trim()} onClick={() => offerAction.mutate(undefined)}>{t('retention.offer.confirm')}</Button>
          </>
        }
      >
        <Text size="sm">{t('retention.offer.text', { count: chosen.length })}</Text>
        <TextInput label={t('retention.offer.archive')} required value={offer.archive} placeholder={t('retention.offer.archivePlaceholder')} onChange={(e) => { const archive = e.currentTarget.value; setOffer((o) => ({ ...o, archive })); }} />
        <TextInput label={t('retention.offer.note')} placeholder={t('retention.offer.notePlaceholder')} value={offer.note} onChange={(e) => { const note = e.currentTarget.value; setOffer((o) => ({ ...o, note })); }} />
        <Text size="xs" c="dimmed">{t('retention.offer.after')}</Text>
      </ResponsiveDialog>

      <ResponsiveDialog
        opened={dialog === 'decide'}
        onClose={() => setDialog(null)}
        title={t('retention.decision.title')}
        actions={
          <>
            <Button variant="default" onClick={() => setDialog(null)}>{common('actions.cancel')}</Button>
            <Button loading={decideAction.isPending} disabled={!decision.date} onClick={() => decideAction.mutate(undefined)}>{common('actions.save')}</Button>
          </>
        }
      >
        <Radio.Group value={decision.decision} onChange={(value) => setDecision((d) => ({ ...d, decision: value as 'accepted' | 'destroyed' }))}>
          <Stack gap="xs">
            <Radio value="accepted" label={t('retention.decision.accepted')} description={t('retention.decision.acceptedHint')} />
            <Radio value="destroyed" label={t('retention.decision.destroyed')} description={t('retention.decision.destroyedHint')} />
          </Stack>
        </Radio.Group>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput label={t('retention.decision.date')} type="date" required value={decision.date} onChange={(e) => { const date = e.currentTarget.value; setDecision((d) => ({ ...d, date })); }} />
          <TextInput label={t('retention.decision.note')} value={decision.note} onChange={(e) => { const note = e.currentTarget.value; setDecision((d) => ({ ...d, note })); }} />
        </SimpleGrid>
        <Notice kind="warning">{t('retention.decision.afterwards', { anonymize: chosen.filter((c) => c.afterDecision === 'anonymize').length, delete: chosen.filter((c) => c.afterDecision === 'delete').length })}</Notice>
      </ResponsiveDialog>

      <ResponsiveDialog
        opened={dialog === 'defer'}
        onClose={() => setDialog(null)}
        title={t('retention.defer.title')}
        actions={
          <>
            <Button variant="default" onClick={() => setDialog(null)}>{common('actions.cancel')}</Button>
            <Button loading={deferAction.isPending} disabled={!deferral.until || !deferral.reason.trim()} onClick={() => deferAction.mutate(undefined)}>{t('retention.defer.confirm')}</Button>
          </>
        }
      >
        <Text size="sm">{t('retention.defer.text')}</Text>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput label={t('retention.defer.until')} type="date" required min={today()} value={deferral.until} onChange={(e) => { const until = e.currentTarget.value; setDeferral((d) => ({ ...d, until })); }} />
          <TextInput label={t('retention.defer.reason')} required placeholder={t('retention.defer.reasonPlaceholder')} value={deferral.reason} onChange={(e) => { const reason = e.currentTarget.value; setDeferral((d) => ({ ...d, reason })); }} />
        </SimpleGrid>
      </ResponsiveDialog>

      <ConfirmDialog
        opened={dialog === 'execute'}
        onClose={() => setDialog(null)}
        title={t('retention.execute.title')}
        description={t('retention.execute.text', { anonymize, delete: remove })}
        confirmLabel={t('retention.execute.confirm', { count: executable.length })}
        loading={executeAction.isPending}
        onConfirm={() => executeAction.mutate(undefined)}
      />
    </Stack>
  );
}
