import { Anchor, Button, Checkbox, Group, Radio, Select, SimpleGrid, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import type { Language } from '@forga/core-contracts';
import { OPEN_REQUEST_STATUSES, PRIVACY_TEXT_KEYS, type PrivacyRequest, type PrivacyTextKey, REPLY_TEXT_OF_KIND } from '@forga/privacy-contracts';
import { apiUrl, formatDate, formatDateTime, send, useLocalized, useTranslation } from '@forga/web-sdk';
import { EmptyState, Notice, PageHeader, Panel, ResponsiveDialog, StatusBadge, useAction } from '@forga/web-ui';
import { berlinToday, useActivityOptions, useAssignees, usePersonPrivacy, useRecipientOptions, useRequest } from '../api';
import { LiftDialog, RestrictDialog, useRefreshPrivacy } from './dialogs';
import { DeadlineBadge, Field, requestSubject, STATUS_TONES } from './PrivacyPage';
import { ThirdPartyRequestPanel } from './ThirdParties';
import { ErasurePanel } from './ErasurePanel';
import { RequestAccessReports } from './AccessReports';
import { RequestConsents } from '../consents/PersonConsents';
import { RectificationPanel } from './Rectification';

const REPLY_KEYS = PRIVACY_TEXT_KEYS.filter((key) => key.startsWith('reply'));

/** "Verwaltung → Datenschutz → Anfrage": data, processing, extension, recipients (Art. 19), reply letter and restriction. */
export function RequestPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation('privacy');
  const { data: request, error } = useRequest(id);
  if (error) return <EmptyState title={t('notFound')} />;
  if (!request) return null;
  return <RequestView key={`${request.id}:${request.version}`} request={request} />;
}

function RequestView({ request }: { request: PrivacyRequest }) {
  const { t, i18n } = useTranslation('privacy');
  const localized = useLocalized();
  const open = OPEN_REQUEST_STATUSES.includes(request.status);
  const title = `${t(`privacy.kinds.${request.kind}`)} · ${requestSubject(request, t)}`;
  return (
    <Stack gap="lg">
      <PageHeader
        breadcrumbs={[{ label: t('nav.administration') }, { label: t('privacy.title'), to: '/privacy' }, { label: t('privacy.detail.back'), to: '/privacy' }, { label: title }]}
        title={title}
        badges={
          <Group gap={4}>
            <StatusBadge tone={STATUS_TONES[request.status]}>{t(`privacy.statuses.${request.status}`)}</StatusBadge>
            {open && <DeadlineBadge request={request} />}
          </Group>
        }
      />
      <Panel title={t('privacy.detail.received')}>
        <Stack gap={6}>
          <Field label={t('privacy.detail.received')}>{t('privacy.detail.receivedValue', { date: formatDate(request.receivedOn, i18n.language), channel: t(`privacy.channels.${request.channel}`) })}</Field>
          <Field label={t('privacy.detail.person')}>
            {request.thirdParty ? (
              [request.thirdParty.name, request.thirdParty.note].filter(Boolean).join(' – ') + ` (${t('minimisation.requests.thirdParty')})`
            ) : request.personName ? (
              <Anchor component={Link} to={`/masterdata/persons/${request.personId}?tab=privacy`}>{request.personName}</Anchor>
            ) : (
              t('privacy.requests.unknownPerson')
            )}
          </Field>
          <Field label={t('privacy.detail.identity')}>
            {request.channel === 'my-area'
              ? t('privacy.detail.identityByLogin')
              : request.identityChecked
                ? [t('privacy.detail.identityChecked'), request.identityNote].filter(Boolean).join(' – ')
                : t('privacy.detail.identityNotChecked')}
          </Field>
          {request.content && <Field label={t('privacy.detail.content')}>{request.content}</Field>}
          {request.kind === 'objection' && <Field label={t('privacy.detail.activity')}>{[request.activityName && localized(request.activityName), request.activity].filter(Boolean).join(': ') || '–'}</Field>}
          <Field label={t('privacy.detail.language')}>{t(`privacy.languages.${request.language}`)}</Field>
          <Field label={t('privacy.create.deadline')}>
            {formatDate(request.dueOn, i18n.language)}
            {request.extendedUntil && ` → ${t('privacy.detail.extended', { date: formatDate(request.extendedUntil, i18n.language), reason: request.extensionReason })}`}
          </Field>
          {request.closedOn && <Field label={t('privacy.detail.status')}>{t('privacy.detail.closed', { status: t(`privacy.statuses.${request.status}`), date: formatDate(request.closedOn, i18n.language) })}{request.rejectionReason && ` – ${request.rejectionReason}`}</Field>}
          <Text size="xs" c="dimmed">{t('privacy.detail.created', { date: formatDateTime(request.createdAt, i18n.language), name: request.createdByName ?? '–' })}</Text>
        </Stack>
      </Panel>
      {request.rectification && <RectificationPanel requestId={request.id} rectification={request.rectification} />}
      {request.kind === 'consent-withdrawal' && request.personId && <RequestConsents personId={request.personId} requestId={request.id} open={open} />}
      <ExtensionPanel request={request} />
      <WorkPanel request={request} />
      {request.kind === 'erasure' && request.personId && <ErasurePanel request={request} />}
      {['rectification', 'erasure', 'restriction'].includes(request.kind) && <RecipientsPanel request={request} />}
      {request.personId && ['restriction', 'objection', 'erasure', 'rectification'].includes(request.kind) && <RestrictionPanel request={request} />}
      {request.kind === 'access' && request.personId && (
        <RequestAccessReports personId={request.personId} requestId={request.id} />
      )}
      {request.thirdParty && <ThirdPartyRequestPanel request={request} />}
      <ReplyPanel request={request} />
    </Stack>
  );
}

/** Reminder to tell the person about an extension within the first month. */
function ExtensionPanel({ request }: { request: PrivacyRequest }) {
  const { t, i18n } = useTranslation('privacy');
  const refresh = useRefreshPrivacy();
  const [notifiedOn, setNotifiedOn] = useState(berlinToday());
  const notified = useAction(() => send('POST', `privacy/requests/${request.id}/extension-notified`, { version: request.version, notifiedOn }), { onSuccess: () => void refresh() });
  if (!request.extendedUntil) return null;
  if (request.extensionNotifiedOn) return <Notice kind="done">{t('privacy.detail.notified', { date: formatDate(request.extensionNotifiedOn, i18n.language) })}</Notice>;
  return (
    <Notice kind="warning">
      <Stack gap="xs">
        <Text size="sm">{t('privacy.detail.extensionReminder', { date: formatDate(request.dueOn, i18n.language) })}</Text>
        <Group align="flex-end">
          <TextInput label={t('privacy.detail.notifiedOn')} type="date" size="xs" max={berlinToday()} value={notifiedOn} onChange={(e) => setNotifiedOn(e.currentTarget.value)} />
          <Button size="xs" variant="default" loading={notified.isPending} onClick={() => notified.mutate(undefined)}>{t('privacy.detail.markNotified')}</Button>
        </Group>
      </Stack>
    </Notice>
  );
}

/** Status, assignee, identity and notes; extend, close and reopen. */
function WorkPanel({ request }: { request: PrivacyRequest }) {
  const { t } = useTranslation('privacy');
  const { t: common } = useTranslation('common');
  const refresh = useRefreshPrivacy();
  const { data: assignees = [] } = useAssignees();
  const open = OPEN_REQUEST_STATUSES.includes(request.status);
  const [value, setValue] = useState({
    status: request.status === 'in-review' ? 'in-review' : 'received',
    assigneeId: request.assigneeId,
    identityChecked: request.identityChecked,
    identityNote: request.identityNote,
    content: request.content,
    notes: request.notes,
    language: request.language,
    activityKey: request.activityKey,
    activity: request.activity,
  });
  const { data: activities = [] } = useActivityOptions();
  const localized = useLocalized();
  const [dialog, setDialog] = useState<'extend' | 'close' | null>(null);
  const save = useAction(() => send('PUT', `privacy/requests/${request.id}`, { ...value, version: request.version, status: request.status === 'extended' ? undefined : value.status }), {
    success: t('privacy.detail.saved'),
    onSuccess: () => void refresh(),
  });
  const reopen = useAction(() => send('POST', `privacy/requests/${request.id}/reopen`, { version: request.version }), { onSuccess: () => void refresh() });
  return (
    <Panel title={t('privacy.detail.work')}>
      <Stack gap="md">
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Select
            label={t('privacy.detail.status')}
            disabled={!open || request.status === 'extended'}
            allowDeselect={false}
            data={(request.status === 'extended' || !open ? [request.status] : ['received', 'in-review']).map((s) => ({ value: s, label: t(`privacy.statuses.${s}`) }))}
            value={open && request.status !== 'extended' ? value.status : request.status}
            onChange={(s) => s && setValue({ ...value, status: s as 'received' | 'in-review' })}
          />
          <Select
            label={t('privacy.detail.assignee')}
            disabled={!open}
            clearable
            placeholder={t('privacy.detail.nobody')}
            data={assignees.map((a) => ({ value: a.id, label: a.displayName }))}
            value={value.assigneeId}
            onChange={(id) => setValue({ ...value, assigneeId: id })}
          />
          <Select
            label={t('privacy.create.language')}
            disabled={!open}
            allowDeselect={false}
            data={(['de', 'en'] as const).map((l) => ({ value: l, label: t(`privacy.languages.${l}`) }))}
            value={value.language}
            onChange={(l) => l && setValue({ ...value, language: l as Language })}
          />
          {request.kind === 'objection' && (
            <Select
              label={t('privacy.create.activity')}
              disabled={!open}
              clearable
              data={activities.map((a) => ({ value: a.key, label: localized(a.name) }))}
              value={value.activityKey}
              onChange={(key) => setValue({ ...value, activityKey: key })}
            />
          )}
          {request.kind === 'objection' && <TextInput label={t('privacy.create.activityNote')} disabled={!open} value={value.activity} onChange={(e) => setValue({ ...value, activity: e.currentTarget.value })} />}
        </SimpleGrid>
        {request.channel !== 'my-area' && (
          <Group align="flex-end">
            <Checkbox label={t('privacy.create.identityChecked')} disabled={!open} checked={value.identityChecked} onChange={(e) => setValue({ ...value, identityChecked: e.currentTarget.checked })} />
            <TextInput flex={1} aria-label={t('privacy.create.identityNote')} placeholder={t('privacy.create.identityNotePlaceholder')} disabled={!open || !value.identityChecked} value={value.identityNote} onChange={(e) => setValue({ ...value, identityNote: e.currentTarget.value })} />
          </Group>
        )}
        <Textarea label={t('privacy.create.content')} disabled={!open} autosize minRows={2} value={value.content} onChange={(e) => setValue({ ...value, content: e.currentTarget.value })} />
        <Textarea label={t('privacy.detail.notes')} disabled={!open} autosize minRows={3} value={value.notes} onChange={(e) => setValue({ ...value, notes: e.currentTarget.value })} />
        <Group justify="flex-end">
          {open ? (
            <>
              {!request.extendedUntil && <Button variant="default" onClick={() => setDialog('extend')}>{t('privacy.detail.extend')}</Button>}
              <Button variant="default" onClick={() => setDialog('close')}>{t('privacy.detail.close')}</Button>
              <Button loading={save.isPending} onClick={() => save.mutate(undefined)}>{common('actions.save')}</Button>
            </>
          ) : (
            <Button variant="default" loading={reopen.isPending} onClick={() => reopen.mutate(undefined)}>{t('privacy.detail.reopen')}</Button>
          )}
        </Group>
      </Stack>
      {dialog === 'extend' && <ExtendDialog request={request} onClose={() => setDialog(null)} />}
      {dialog === 'close' && <CloseDialog request={request} onClose={() => setDialog(null)} />}
    </Panel>
  );
}

function ExtendDialog({ request, onClose }: { request: PrivacyRequest; onClose: () => void }) {
  const { t } = useTranslation('privacy');
  const { t: common } = useTranslation('common');
  const refresh = useRefreshPrivacy();
  const [months, setMonths] = useState<'1' | '2'>('2');
  const [reason, setReason] = useState('');
  const extend = useAction(() => send('POST', `privacy/requests/${request.id}/extend`, { version: request.version, months: Number(months), reason }), {
    onSuccess: async () => {
      await refresh();
      onClose();
    },
  });
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={t('privacy.detail.extendTitle')}
      actions={
        <>
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button loading={extend.isPending} disabled={reason.trim().length < 10} onClick={() => extend.mutate(undefined)}>{t('privacy.detail.extendSubmit')}</Button>
        </>
      }
    >
      <Text size="sm">{t('privacy.detail.extendText')}</Text>
      <Radio.Group label={t('privacy.detail.months')} value={months} onChange={(v) => setMonths(v as '1' | '2')}>
        <Group mt="xs">
          <Radio value="1" label={t('privacy.detail.month1')} />
          <Radio value="2" label={t('privacy.detail.month2')} />
        </Group>
      </Radio.Group>
      <Textarea label={t('privacy.detail.reason')} required autosize minRows={2} value={reason} onChange={(e) => setReason(e.currentTarget.value)} />
    </ResponsiveDialog>
  );
}

function CloseDialog({ request, onClose }: { request: PrivacyRequest; onClose: () => void }) {
  const { t } = useTranslation('privacy');
  const { t: common } = useTranslation('common');
  const refresh = useRefreshPrivacy();
  const [outcome, setOutcome] = useState<'done' | 'rejected'>('done');
  const [closedOn, setClosedOn] = useState(berlinToday());
  const [reason, setReason] = useState('');
  const close = useAction(() => send('POST', `privacy/requests/${request.id}/close`, { version: request.version, outcome, closedOn, reason }), {
    onSuccess: async () => {
      await refresh();
      onClose();
    },
  });
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={t('privacy.detail.closeTitle')}
      actions={
        <>
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button loading={close.isPending} disabled={!closedOn || (outcome === 'rejected' && reason.trim().length < 10)} onClick={() => close.mutate(undefined)}>{t('privacy.detail.closeSubmit')}</Button>
        </>
      }
    >
      <Radio.Group label={t('privacy.detail.outcome')} value={outcome} onChange={(v) => setOutcome(v as 'done' | 'rejected')}>
        <Group mt="xs">
          <Radio value="done" label={t('privacy.statuses.done')} />
          <Radio value="rejected" label={t('privacy.statuses.rejected')} />
        </Group>
      </Radio.Group>
      <TextInput label={t('privacy.detail.closedOn')} type="date" required min={request.receivedOn} max={berlinToday()} value={closedOn} onChange={(e) => setClosedOn(e.currentTarget.value)} />
      {outcome === 'rejected' && <Textarea label={t('privacy.detail.rejectReason')} required autosize minRows={2} value={reason} onChange={(e) => setReason(e.currentTarget.value)} />}
    </ResponsiveDialog>
  );
}

/** Checklist of the recipients of the register to inform about the change (Art. 19). */
function RecipientsPanel({ request }: { request: PrivacyRequest }) {
  const { t, i18n } = useTranslation('privacy');
  const localized = useLocalized();
  const refresh = useRefreshPrivacy();
  const { data: options = [] } = useRecipientOptions();
  const save = useAction((recipients: PrivacyRequest['recipients']) => send('PUT', `privacy/requests/${request.id}/recipients`, { version: request.version, recipients }), { onSuccess: () => void refresh() });
  const notified = new Map(request.recipients.map((r) => [r.id, r]));
  const recipients = options.map((o) => ({ id: o.id, name: localized(o.name), activities: o.activities.map(localized).join(', ') }));
  const toggle = (recipient: { id: string; name: string }, on: boolean) => {
    const rest = request.recipients.filter((r) => r.id !== recipient.id);
    save.mutate(on ? [...rest, { id: recipient.id, name: recipient.name, notifiedOn: berlinToday() }] : rest);
  };
  return (
    <Panel title={t('privacy.detail.recipients')}>
      <Stack gap="xs">
        {!recipients.length && !request.recipients.length && <Text size="sm">{t('privacy.detail.recipientsNone')}</Text>}
        {[...recipients, ...request.recipients.filter((r) => !recipients.some((c) => c.id === r.id))].map((r) => {
          const done = notified.get(r.id);
          return (
            <Checkbox
              key={r.id}
              disabled={save.isPending}
              checked={Boolean(done)}
              onChange={(e) => toggle(r, e.currentTarget.checked)}
              label={done ? `${r.name} – ${t('privacy.detail.recipientNotified', { date: formatDate(done.notifiedOn, i18n.language) })}` : r.name}
              description={'activities' in r && r.activities ? r.activities : undefined}
            />
          );
        })}
        <Text size="xs" c="dimmed">{t('privacy.detail.recipientsHint')}</Text>
      </Stack>
    </Panel>
  );
}

/** The restriction of the person; restrict (e.g. until the decision on an objection) or lift it. */
function RestrictionPanel({ request }: { request: PrivacyRequest }) {
  const { t, i18n } = useTranslation('privacy');
  const [dialog, setDialog] = useState<'restrict' | 'lift' | null>(null);
  const { data: privacy } = usePersonPrivacy(request.personId ?? '');
  if (!privacy) return null;
  const name = request.personName ?? '';
  const restriction = privacy.restriction;
  return (
    <Panel title={t('privacy.detail.restriction')}>
      <Group justify="space-between">
        <Text size="sm">
          {restriction
            ? [t('privacy.restriction.since', { date: formatDate(restriction.restrictedAt, i18n.language), reason: t(`privacy.reasons.${restriction.reason}`) }), restriction.until && t('privacy.restriction.untilPlanned', { date: formatDate(restriction.until, i18n.language) })].filter(Boolean).join(' · ')
            : t('privacy.restriction.none')}
        </Text>
        {restriction ? (
          <Button variant="default" onClick={() => setDialog('lift')}>{t('privacy.restriction.lift')}</Button>
        ) : (
          <Button variant="default" onClick={() => setDialog('restrict')}>{t('privacy.restriction.restrict')}</Button>
        )}
      </Group>
      {dialog === 'restrict' && request.personId && <RestrictDialog personId={request.personId} name={name} requestId={request.id} onClose={() => setDialog(null)} />}
      {dialog === 'lift' && request.personId && <LiftDialog personId={request.personId} name={name} onClose={() => setDialog(null)} />}
    </Panel>
  );
}

/** Reply letter as PDF from a text block, in the language of the request. */
function ReplyPanel({ request }: { request: PrivacyRequest }) {
  const { t } = useTranslation('privacy');
  const [text, setText] = useState<PrivacyTextKey>(request.status === 'rejected' ? 'replyRejection' : request.extendedUntil && !request.extensionNotifiedOn ? 'replyExtension' : REPLY_TEXT_OF_KIND[request.kind]);
  return (
    <Panel title={t('privacy.detail.reply')}>
      <Group align="flex-end">
        <Select
          label={t('privacy.detail.replyText')}
          allowDeselect={false}
          data={REPLY_KEYS.map((key) => ({ value: key, label: t(`privacy.settings.blocks.${key}`) }))}
          value={text}
          onChange={(key) => key && setText(key as PrivacyTextKey)}
          w={320}
        />
        <Button component="a" href={apiUrl(`privacy/requests/${request.id}/reply.pdf`, { text })} target="_blank" variant="default">
          {t('privacy.detail.reply')}
        </Button>
      </Group>
    </Panel>
  );
}

