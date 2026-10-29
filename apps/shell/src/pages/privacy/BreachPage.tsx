import { Button, Checkbox, Group, Radio, Select, SimpleGrid, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';
import { useState } from 'react';
import { useParams } from 'react-router';
import { type AffectedPersons, BreachNotificationVia, type BreachSourceEntry, type PrivacyBreach } from '@forga/core-contracts';
import { api, apiUrl, formatDate, formatDateTime, openAfterStepUp, send, useLocalized, useTranslation, withQuery } from '@forga/web-sdk';
import { DataTable, EmptyState, HistoryTimeline, Notice, PageHeader, Panel, ResponsiveDialog, StatusBadge, useAction } from '@forga/web-ui';
import { berlinToday, hoursUntil, useBreach } from './api';
import { AccountSelect, AuthorityBadge, BreachFields, breachValues, LockdownPanel, ProtocolsPanel, toInput, useAccounts } from './BreachesTab';
import { useRefreshPrivacy } from './dialogs';

/** "Verwaltung → Datenschutz → Datenpanne": details, notifications, affected persons, protocols and history. */
export function BreachPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation('shell');
  const { data: breach, error } = useBreach(id);
  if (error) return <EmptyState title={t('notFound')} />;
  if (!breach) return null;
  return <BreachView key={`${breach.id}:${breach.version}`} breach={breach} />;
}

function BreachView({ breach }: { breach: PrivacyBreach }) {
  const { t, i18n } = useTranslation('shell');
  const { t: common } = useTranslation('common');
  const refresh = useRefreshPrivacy();
  const [value, setValue] = useState(breachValues(breach));
  const [closing, setClosing] = useState(false);
  const open = breach.status === 'open';
  const save = useAction(() => send('PUT', `core/privacy/breaches/${breach.id}`, { ...toInput(value), version: breach.version }), { success: t('breaches.saved'), onSuccess: () => void refresh() });
  const reopen = useAction(() => send('POST', `core/privacy/breaches/${breach.id}/reopen`, { version: breach.version }), { onSuccess: () => void refresh() });
  const hoursLeft = hoursUntil(breach.notifyBy);
  const authorityOpen = open && !breach.authorityNotifiedOn && !breach.authorityNotRequired;
  return (
    <Stack gap="lg">
      <PageHeader
        breadcrumbs={[{ label: t('nav.administration') }, { label: t('privacy.title'), to: '/admin/privacy' }, { label: t('breaches.back'), to: '/admin/privacy/breaches' }, { label: breach.title }]}
        title={breach.title}
        badges={
          <Group gap={4}>
            <StatusBadge tone={open ? 'primary' : 'done'}>{t(`breaches.statuses.${breach.status}`)}</StatusBadge>
            <AuthorityBadge breach={breach} />
          </Group>
        }
        subtitle={t('breaches.createdInfo', { date: formatDateTime(breach.createdAt, i18n.language), name: breach.createdByName ?? '–' })}
      />
      {authorityOpen && (
        <Notice kind={hoursLeft < 0 ? 'error' : 'warning'}>
          {hoursLeft < 0 ? t('breaches.deadlinePassed', { date: formatDateTime(breach.notifyBy, i18n.language) }) : t('breaches.deadlineOpen', { date: formatDateTime(breach.notifyBy, i18n.language), hours: hoursLeft })}
        </Notice>
      )}
      {open && breach.risk === 'high' && !breach.subjectsNotifiedOn && <Notice kind="warning">{t('breaches.subjectsDue')}</Notice>}
      {!open && <Notice kind="done">{t('breaches.closedInfo', { date: formatDate(breach.closedOn, i18n.language) })}</Notice>}
      <Panel title={t('breaches.createTitle')}>
        <BreachFields value={value} onChange={setValue} disabled={!open} />
      </Panel>
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Panel title={t('breaches.authorityTitle')}>
          <Stack gap="sm">
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <TextInput label={t('breaches.authorityNotifiedOn')} type="date" disabled={!open || value.authorityNotRequired} max={berlinToday()} value={value.authorityNotifiedOn ?? ''} onChange={(e) => setValue({ ...value, authorityNotifiedOn: e.currentTarget.value || null })} />
              <TextInput label={t('breaches.authorityReference')} disabled={!open} value={value.authorityReference} onChange={(e) => setValue({ ...value, authorityReference: e.currentTarget.value })} />
            </SimpleGrid>
            <Checkbox label={t('breaches.authorityNotRequired')} disabled={!open || Boolean(value.authorityNotifiedOn)} checked={value.authorityNotRequired} onChange={(e) => setValue({ ...value, authorityNotRequired: e.currentTarget.checked })} />
            <Textarea label={t('breaches.authorityNote')} autosize minRows={2} disabled={!open} value={value.authorityNote} onChange={(e) => setValue({ ...value, authorityNote: e.currentTarget.value })} />
          </Stack>
        </Panel>
        <Panel title={t('breaches.subjectsTitle')}>
          <Stack gap="sm">
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <TextInput label={t('breaches.subjectsNotifiedOn')} type="date" disabled={!open} max={berlinToday()} value={value.subjectsNotifiedOn ?? ''} onChange={(e) => setValue({ ...value, subjectsNotifiedOn: e.currentTarget.value || null })} />
              <Select
                label={t('breaches.subjectsNotifiedVia')}
                disabled={!open || !value.subjectsNotifiedOn}
                required={Boolean(value.subjectsNotifiedOn)}
                data={BreachNotificationVia.options.map((v) => ({ value: v, label: t(`breaches.via.${v}`) }))}
                value={value.subjectsNotifiedVia}
                onChange={(v) => setValue({ ...value, subjectsNotifiedVia: v as typeof value.subjectsNotifiedVia })}
              />
            </SimpleGrid>
            <Textarea label={t('breaches.subjectsNote')} autosize minRows={2} disabled={!open} value={value.subjectsNote} onChange={(e) => setValue({ ...value, subjectsNote: e.currentTarget.value })} />
          </Stack>
        </Panel>
      </SimpleGrid>
      <Group justify="flex-end">
        {open ? (
          <>
            <Button variant="default" onClick={() => setClosing(true)}>{t('breaches.close')}</Button>
            <Button loading={save.isPending} onClick={() => save.mutate(undefined)}>{common('actions.save')}</Button>
          </>
        ) : (
          <Button variant="default" loading={reopen.isPending} onClick={() => reopen.mutate(undefined)}>{t('breaches.reopen')}</Button>
        )}
      </Group>
      <AffectedPanel breach={breach} />
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <ProtocolsPanel breachId={breach.id} from={breach.occurredFrom ?? breach.discoveredAt.slice(0, 10)} />
        <LockdownPanel breachId={breach.id} />
      </SimpleGrid>
      <Panel title={t('breaches.history')}>
        <HistoryTimeline entity="core.privacy_breach" id={breach.id} />
      </Panel>
      {closing && <CloseDialog breach={breach} onClose={() => setClosing(false)} />}
    </Stack>
  );
}

function CloseDialog({ breach, onClose }: { breach: PrivacyBreach; onClose: () => void }) {
  const { t } = useTranslation('shell');
  const { t: common } = useTranslation('common');
  const refresh = useRefreshPrivacy();
  const [closedOn, setClosedOn] = useState(berlinToday());
  const close = useAction(() => send('POST', `core/privacy/breaches/${breach.id}/close`, { version: breach.version, closedOn }), {
    onSuccess: async () => {
      await refresh();
      onClose();
    },
  });
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={t('breaches.closeTitle')}
      actions={
        <>
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button loading={close.isPending} onClick={() => close.mutate(undefined)}>{t('breaches.closeConfirm')}</Button>
        </>
      }
    >
      <Text size="sm">{t('breaches.closeText')}</Text>
      <TextInput label={t('breaches.closedOn')} type="date" required max={berlinToday()} value={closedOn} onChange={(e) => setClosedOn(e.currentTarget.value)} />
    </ResponsiveDialog>
  );
}

/** The affected persons: count, source, names; determine them and export the contact list (Art. 34). */
function AffectedPanel({ breach }: { breach: PrivacyBreach }) {
  const { t, i18n } = useTranslation('shell');
  const [determining, setDetermining] = useState(false);
  const persons = breach.affectedPersons;
  return (
    <Panel title={t('breaches.affectedTitle')}>
      <Stack gap="sm">
        {persons.length ? (
          <>
            <Text size="sm" fw={500}>{t('breaches.affectedCount', { count: persons.length })}</Text>
            {breach.affectedSource && <Text size="xs" c="dimmed">{t('breaches.affectedSource', { source: breach.affectedSource })}</Text>}
            <Text size="sm">{persons.map((p) => `${p.lastName}, ${p.firstName}`).join('; ')}</Text>
          </>
        ) : (
          <Text size="sm">{t('breaches.affectedNone')}</Text>
        )}
        <Group>
          {breach.status === 'open' && <Button variant="default" onClick={() => setDetermining(true)}>{t('breaches.determine')}</Button>}
          {persons.length > 0 && (
            <Button
              variant="default"
              leftSection={<IconDownload size={16} />}
              onClick={() => void openAfterStepUp(apiUrl(`core/privacy/breaches/${breach.id}/contacts.xlsx`, { language: i18n.language === 'en' ? 'en' : 'de' }))}
            >
              {t('breaches.contacts')}
            </Button>
          )}
        </Group>
        {persons.length > 0 && <Text size="xs" c="dimmed">{t('breaches.contactsHint')}</Text>}
      </Stack>
      {determining && <DetermineDialog breach={breach} onClose={() => setDetermining(false)} />}
    </Panel>
  );
}

/** Reconstructs the affected persons from an export in the audit log or from an account, and takes them over. */
function DetermineDialog({ breach, onClose }: { breach: PrivacyBreach; onClose: () => void }) {
  const { t, i18n } = useTranslation('shell');
  const { t: common } = useTranslation('common');
  const localized = useLocalized();
  const refresh = useRefreshPrivacy();
  const accounts = useAccounts();
  const [kind, setKind] = useState<'audit' | 'account'>('audit');
  const [from, setFrom] = useState(breach.occurredFrom ?? breach.discoveredAt.slice(0, 10));
  const [to, setTo] = useState(berlinToday());
  const [userId, setUserId] = useState<string | null>(null);
  const [sources, setSources] = useState<BreachSourceEntry[] | null>(null);
  const [result, setResult] = useState<AffectedPersons | null>(null);
  const search = useAction(() => api<BreachSourceEntry[]>(withQuery('core/privacy/breach-tools/sources', { from, to, userId })), { onSuccess: setSources });
  const determine = useAction((query: { source: 'audit'; auditId: string } | { source: 'account'; userId: string }) => send<AffectedPersons>('POST', 'core/privacy/breach-tools/affected', query), { onSuccess: setResult });
  const adopt = useAction(
    () => send('PUT', `core/privacy/breaches/${breach.id}/affected`, { version: breach.version, personIds: result!.persons.map((p) => p.id), source: localized(result!.description) }),
    {
      success: t('breaches.adopted'),
      onSuccess: async () => {
        await refresh();
        onClose();
      },
    },
  );
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={t('breaches.determineTitle')}
      size="xl"
      actions={
        <>
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button disabled={!result} loading={adopt.isPending} onClick={() => adopt.mutate(undefined)}>{t('breaches.adopt')}</Button>
        </>
      }
    >
      <Radio.Group label={t('breaches.sourceKind')} value={kind} onChange={(v) => { setKind(v as typeof kind); setResult(null); }}>
        <Stack gap={6} mt={6}>
          <Radio value="audit" label={t('breaches.sourceKinds.audit')} />
          <Radio value="account" label={t('breaches.sourceKinds.account')} />
        </Stack>
      </Radio.Group>
      {kind === 'audit' ? (
        <Stack gap="sm">
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <TextInput label={t('breaches.from')} type="date" value={from} max={to} onChange={(e) => setFrom(e.currentTarget.value)} />
            <TextInput label={t('breaches.to')} type="date" value={to} min={from} onChange={(e) => setTo(e.currentTarget.value)} />
            <AccountSelect accounts={accounts} value={userId} onChange={setUserId} />
          </SimpleGrid>
          <Group>
            <Button variant="default" loading={search.isPending} disabled={!from || !to || to < from} onClick={() => search.mutate(undefined)}>{t('breaches.search')}</Button>
          </Group>
          {sources && (
            <DataTable
              rows={sources}
              rowKey={(s) => s.auditId}
              exportable={false}
              empty={t('breaches.sourcesEmpty')}
              columns={[
                { key: 'time', header: t('breaches.sourceColumns.time'), render: (s) => formatDateTime(s.timestamp, i18n.language) },
                { key: 'user', header: t('breaches.sourceColumns.user'), render: (s) => s.userName ?? '–' },
                { key: 'what', header: t('breaches.sourceColumns.what'), render: (s) => localized(s.label) },
                { key: 'persons', header: t('breaches.sourceColumns.persons'), render: (s) => s.persons ?? t('breaches.personsUnknown') },
                { key: 'pick', header: '', render: (s) => <Button size="xs" variant="subtle" loading={determine.isPending} onClick={() => determine.mutate({ source: 'audit', auditId: s.auditId })}>{t('breaches.pick')}</Button> },
              ]}
            />
          )}
        </Stack>
      ) : (
        <Group align="flex-end">
          <AccountSelect accounts={accounts} value={userId} onChange={setUserId} required />
          <Button variant="default" disabled={!userId} loading={determine.isPending} onClick={() => userId && determine.mutate({ source: 'account', userId })}>{t('breaches.search')}</Button>
        </Group>
      )}
      {result && (
        <Notice kind="info">
          <Stack gap={4}>
            <Text size="sm" fw={500}>{t('breaches.result', { count: result.persons.length })} – {localized(result.description)}</Text>
            <Text size="xs">{t(result.basis === 'recorded' ? 'breaches.basisRecorded' : 'breaches.basisCurrent')}</Text>
            <Text size="sm">{result.persons.map((p) => `${p.lastName}, ${p.firstName}`).join('; ')}</Text>
            {breach.affectedPersonIds.length > 0 && <Text size="xs" c="dimmed">{t('breaches.replaceHint')}</Text>}
          </Stack>
        </Notice>
      )}
    </ResponsiveDialog>
  );
}
