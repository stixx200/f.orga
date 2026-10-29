import { Anchor, Button, Checkbox, Chip, Group, MultiSelect, NumberInput, Select, SimpleGrid, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { type BreachAccount, type BreachLockdownResult, BreachRisk, type PrivacyBreach, type PrivacyBreachInput } from '@forga/privacy-contracts';
import { api, apiUrl, formatDate, formatDateTime, openAfterStepUp, send, useLocalized, useTranslation } from '@forga/web-sdk';
import { ConfirmDialog, DataTable, Notice, notifySuccess, Panel, ResponsiveDialog, StatusBadge, type Tone, useAction } from '@forga/web-ui';
import { useQuery } from '@tanstack/react-query';
import { berlinToday, hoursUntil, privacyKeys, useActivityOptions, useBreaches } from '../api';
import { useRefreshPrivacy } from './dialogs';

/** Form values of a breach: all fields of `PrivacyBreachInput` with `discoveredAt` as local date-time of the input. */
export type BreachFormValues = Required<Omit<PrivacyBreachInput, 'discoveredAt'>> & { discoveredAt: string };

/** `2026-10-29T14:30` in the browser's time zone, for `datetime-local` inputs. */
const pad = (n: number) => String(n).padStart(2, '0');

export function localDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const toInput = (value: BreachFormValues) => ({ ...value, discoveredAt: new Date(value.discoveredAt).toISOString() });

export function emptyBreach(): BreachFormValues {
  return {
    title: '',
    discoveredAt: localDateTime(new Date().toISOString()),
    occurredFrom: null,
    occurredUntil: null,
    description: '',
    activityKeys: [],
    dataCategories: '',
    health: false,
    affectedCount: null,
    consequences: '',
    measures: '',
    risk: null,
    authorityNotifiedOn: null,
    authorityReference: '',
    authorityNotRequired: false,
    authorityNote: '',
    subjectsNotifiedOn: null,
    subjectsNotifiedVia: null,
    subjectsNote: '',
  };
}

export function breachValues(b: PrivacyBreach): BreachFormValues {
  return {
    title: b.title,
    discoveredAt: localDateTime(b.discoveredAt),
    occurredFrom: b.occurredFrom,
    occurredUntil: b.occurredUntil,
    description: b.description,
    activityKeys: b.activityKeys,
    dataCategories: b.dataCategories,
    health: b.health,
    affectedCount: b.affectedCount,
    consequences: b.consequences,
    measures: b.measures,
    risk: b.risk,
    authorityNotifiedOn: b.authorityNotifiedOn,
    authorityReference: b.authorityReference,
    authorityNotRequired: b.authorityNotRequired,
    authorityNote: b.authorityNote,
    subjectsNotifiedOn: b.subjectsNotifiedOn,
    subjectsNotifiedVia: b.subjectsNotifiedVia,
    subjectsNote: b.subjectsNote,
  };
}

/** Badge with the state of the notification to the authority: notified, not notifiable, or the deadline (red when passed). */
export function AuthorityBadge({ breach }: { breach: PrivacyBreach }) {
  const { t, i18n } = useTranslation('privacy');
  if (breach.authorityNotifiedOn) return <StatusBadge tone="done">{t('breaches.authority.notified', { date: formatDate(breach.authorityNotifiedOn, i18n.language) })}</StatusBadge>;
  if (breach.authorityNotRequired) return <StatusBadge tone="neutral">{t('breaches.authority.notRequired')}</StatusBadge>;
  const passed = hoursUntil(breach.notifyBy) < 0;
  const tone: Tone = breach.status === 'closed' ? 'neutral' : passed ? 'error' : 'warning';
  return <StatusBadge tone={tone}>{passed ? t('breaches.overdue') : t('breaches.authority.open')}</StatusBadge>;
}

/** "Verwaltung → Datenschutz → Datenpannen": the recorded breaches, protocols and the emergency stop. */
export function BreachesTab() {
  const { t, i18n } = useTranslation('privacy');
  const navigate = useNavigate();
  const [state, setState] = useState<'open' | 'closed' | 'all'>('open');
  const [creating, setCreating] = useState(false);
  const { data: open = [] } = useBreaches('open');
  const { data: breaches = [], isLoading } = useBreaches(state);
  return (
    <Stack gap="lg">
      <Text size="sm">{t('breaches.intro')}</Text>
      <Group justify="space-between">
        <Chip.Group multiple={false} value={state} onChange={(value) => setState(value as typeof state)}>
          <Group gap="xs">
            {(['open', 'closed', 'all'] as const).map((s) => (
              <Chip key={s} value={s} radius="sm">
                {t(`breaches.filters.${s}`)}
                {s === 'open' ? ` (${open.length})` : ''}
              </Chip>
            ))}
          </Group>
        </Chip.Group>
        <Button onClick={() => setCreating(true)}>{t('breaches.create')}</Button>
      </Group>
      <DataTable
        rows={breaches}
        rowKey={(b) => b.id}
        onRowClick={(b) => navigate(`/privacy/breaches/${b.id}`)}
        highlight={(b) => b.status === 'open' && !b.authorityNotifiedOn && !b.authorityNotRequired}
        empty={isLoading ? null : t('breaches.empty')}
        columns={[
          { key: 'discoveredAt', header: t('breaches.columns.discoveredAt'), render: (b) => formatDateTime(b.discoveredAt, i18n.language) },
          { key: 'title', header: t('breaches.columns.title'), render: (b) => <Anchor component={Link} to={`/privacy/breaches/${b.id}`}>{b.title}</Anchor> },
          { key: 'notifyBy', header: t('breaches.columns.notifyBy'), render: (b) => formatDateTime(b.notifyBy, i18n.language) },
          { key: 'authority', header: t('breaches.columns.authority'), render: (b) => <AuthorityBadge breach={b} /> },
          { key: 'affected', header: t('breaches.columns.affected'), render: (b) => (b.affectedPersonIds.length ? t('breaches.affectedCount', { count: b.affectedPersonIds.length }) : (b.affectedCount ?? '–')) },
          { key: 'status', header: t('breaches.columns.status'), render: (b) => <StatusBadge tone={b.status === 'open' ? 'primary' : 'done'}>{t(`breaches.statuses.${b.status}`)}</StatusBadge> },
        ]}
      />
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <ProtocolsPanel />
        <LockdownPanel />
      </SimpleGrid>
      {creating && <CreateBreachDialog onClose={() => setCreating(false)} onCreated={(b) => navigate(`/privacy/breaches/${b.id}`)} />}
    </Stack>
  );
}

function CreateBreachDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (breach: PrivacyBreach) => void }) {
  const { t } = useTranslation('privacy');
  const { t: common } = useTranslation('common');
  const refresh = useRefreshPrivacy();
  const [value, setValue] = useState(emptyBreach());
  const create = useAction(() => send<PrivacyBreach>('POST', 'privacy/breaches', toInput(value)), {
    success: t('breaches.created'),
    onSuccess: async (breach) => {
      await refresh();
      onCreated(breach);
    },
  });
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={t('breaches.createTitle')}
      size="lg"
      actions={
        <>
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button loading={create.isPending} disabled={value.title.trim().length < 3 || !value.discoveredAt} onClick={() => create.mutate(undefined)}>{common('actions.save')}</Button>
        </>
      }
    >
      <BreachFields value={value} onChange={setValue} compact />
    </ResponsiveDialog>
  );
}

/** The fields of a breach; `compact` (recording) leaves out notifications and consequences. */
export function BreachFields({ value, onChange, compact = false, disabled = false }: { value: BreachFormValues; onChange: (value: BreachFormValues) => void; compact?: boolean; disabled?: boolean }) {
  const { t } = useTranslation('privacy');
  const localized = useLocalized();
  const { data: activities = [] } = useActivityOptions();
  const set = <K extends keyof BreachFormValues>(key: K, v: BreachFormValues[K]) => onChange({ ...value, [key]: v });
  return (
    <Stack gap="sm">
      <TextInput label={t('breaches.fields.title')} placeholder={t('breaches.fields.titlePlaceholder')} required disabled={disabled} value={value.title} onChange={(e) => set('title', e.currentTarget.value)} />
      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <TextInput label={t('breaches.fields.discoveredAt')} description={t('breaches.fields.discoveredAtHint')} type="datetime-local" required disabled={disabled} value={value.discoveredAt} onChange={(e) => set('discoveredAt', e.currentTarget.value)} />
        <TextInput label={t('breaches.fields.occurredFrom')} type="date" disabled={disabled} value={value.occurredFrom ?? ''} onChange={(e) => set('occurredFrom', e.currentTarget.value || null)} />
        <TextInput label={t('breaches.fields.occurredUntil')} type="date" disabled={disabled} value={value.occurredUntil ?? ''} onChange={(e) => set('occurredUntil', e.currentTarget.value || null)} />
      </SimpleGrid>
      <Textarea label={t('breaches.fields.description')} autosize minRows={3} disabled={disabled} value={value.description} onChange={(e) => set('description', e.currentTarget.value)} />
      <MultiSelect
        label={t('breaches.fields.activities')}
        disabled={disabled}
        data={activities.map((a) => ({ value: a.key, label: localized(a.name) }))}
        value={value.activityKeys}
        onChange={(keys) => onChange({ ...value, activityKeys: keys, health: value.health || keys.some((k) => activities.find((a) => a.key === k)?.health) })}
        searchable
        clearable
      />
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <TextInput label={t('breaches.fields.dataCategories')} placeholder={t('breaches.fields.dataCategoriesPlaceholder')} disabled={disabled} value={value.dataCategories} onChange={(e) => set('dataCategories', e.currentTarget.value)} />
        <NumberInput label={t('breaches.fields.affectedCount')} min={0} allowDecimal={false} disabled={disabled} value={value.affectedCount ?? ''} onChange={(n) => set('affectedCount', typeof n === 'number' ? n : null)} />
      </SimpleGrid>
      <Checkbox label={t('breaches.fields.health')} disabled={disabled} checked={value.health} onChange={(e) => set('health', e.currentTarget.checked)} />
      <Select
        label={t('breaches.fields.risk')}
        clearable
        disabled={disabled}
        data={BreachRisk.options.map((r) => ({ value: r, label: t(`breaches.risks.${r}`) }))}
        value={value.risk}
        onChange={(r) => set('risk', r as BreachFormValues['risk'])}
      />
      {!compact && (
        <>
          <Textarea label={t('breaches.fields.consequences')} autosize minRows={2} disabled={disabled} value={value.consequences} onChange={(e) => set('consequences', e.currentTarget.value)} />
          <Textarea label={t('breaches.fields.measures')} autosize minRows={2} disabled={disabled} value={value.measures} onChange={(e) => set('measures', e.currentTarget.value)} />
        </>
      )}
    </Stack>
  );
}

/** Audit log (and further protocols) of a period and optionally one user, as Excel. */
export function ProtocolsPanel({ breachId, from: initialFrom }: { breachId?: string; from?: string }) {
  const { t, i18n } = useTranslation('privacy');
  const [from, setFrom] = useState(initialFrom ?? berlinToday());
  const [to, setTo] = useState(berlinToday());
  const [userId, setUserId] = useState<string | null>(null);
  const accounts = useAccounts();
  const url = apiUrl('privacy/breach-tools/protocols.xlsx', { from, to, userId: userId ?? undefined, breachId, language: i18n.language === 'en' ? 'en' : 'de' });
  return (
    <Panel title={t('breaches.protocolsTitle')}>
      <Stack gap="sm">
        <Text size="xs" c="dimmed">{t('breaches.protocolsHint')}</Text>
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <TextInput label={t('breaches.from')} type="date" value={from} max={to} onChange={(e) => setFrom(e.currentTarget.value)} />
          <TextInput label={t('breaches.to')} type="date" value={to} min={from} onChange={(e) => setTo(e.currentTarget.value)} />
          <AccountSelect accounts={accounts} value={userId} onChange={setUserId} />
        </SimpleGrid>
        <Group>
          <Button variant="default" leftSection={<IconDownload size={16} />} disabled={!from || !to || to < from} onClick={() => void openAfterStepUp(url)}>
            {t('breaches.protocolsDownload')}
          </Button>
        </Group>
      </Stack>
    </Panel>
  );
}

export function useAccounts(): BreachAccount[] {
  return useQuery({ queryKey: [...privacyKeys.all, 'breach-accounts'], queryFn: () => api<BreachAccount[]>('privacy/breach-tools/accounts'), staleTime: 60_000 }).data ?? [];
}

export function AccountSelect({ accounts, value, onChange, required = false }: { accounts: BreachAccount[]; value: string | null; onChange: (id: string | null) => void; required?: boolean }) {
  const { t } = useTranslation('privacy');
  return (
    <Select
      label={t('breaches.account')}
      placeholder={required ? undefined : t('breaches.accountAll')}
      required={required}
      searchable
      clearable={!required}
      data={accounts.map((a) => ({
        value: a.id,
        label: [a.displayName, a.technical ? `(${t('breaches.technical')})` : '', a.active ? '' : `(${t('breaches.inactive')})`].filter(Boolean).join(' '),
      }))}
      value={value}
      onChange={onChange}
    />
  );
}

/** „Alle Sitzungen beenden und alle Tokens widerrufen“ with reason; the own session stays. */
export function LockdownPanel({ breachId }: { breachId?: string }) {
  const { t } = useTranslation('privacy');
  const [confirming, setConfirming] = useState(false);
  const lockdown = useAction((reason: string) => send<BreachLockdownResult>('POST', 'privacy/breach-tools/lockdown', { reason, breachId: breachId ?? null }), {
    onSuccess: (result) => {
      setConfirming(false);
      notifySuccess(t('breaches.lockdownDone', result));
    },
  });
  return (
    <Panel title={t('breaches.lockdownTitle')}>
      <Stack gap="sm">
        <Notice kind="warning">{t('breaches.lockdownText')}</Notice>
        <Group>
          <Button color="red" variant="outline" onClick={() => setConfirming(true)}>{t('breaches.lockdown')}</Button>
        </Group>
      </Stack>
      <ConfirmDialog
        opened={confirming}
        onClose={() => setConfirming(false)}
        title={t('breaches.lockdownConfirmTitle')}
        description={t('breaches.lockdownText')}
        confirmLabel={t('breaches.lockdownConfirm')}
        reason={t('breaches.lockdownReason')}
        loading={lockdown.isPending}
        onConfirm={(reason) => lockdown.mutate(reason)}
      />
    </Panel>
  );
}
