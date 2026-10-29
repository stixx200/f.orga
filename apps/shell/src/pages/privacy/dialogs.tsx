import { Button, Checkbox, Select, SimpleGrid, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  addMonthsToDate,
  type Language,
  PrivacyInformationVia,
  type PrivacyRequest,
  PrivacyRequestChannel,
  type PrivacyRequestInput,
  PrivacyRequestKind,
  ProcessingRestrictionReason,
  type ProcessingRestrictionInput,
} from '@forga/core-contracts';
import { send, useLocalized, useTranslation } from '@forga/web-sdk';
import { notifySuccess, ResponsiveDialog, useAction } from '@forga/web-ui';
import { personLabel, usePersons } from '../admin/data';
import { berlinToday, privacyKeys, useActivityOptions } from './api';

/** After a change of a request or a restriction: requests, person file and lists of the privacy page are reloaded. */
export function useRefreshPrivacy() {
  const queryClient = useQueryClient();
  return () => Promise.all([queryClient.invalidateQueries({ queryKey: privacyKeys.all }), queryClient.invalidateQueries({ queryKey: ['masterdata'] })]);
}

/** "Anfrage erfassen": kind, received, channel, identity, content; the deadline follows (received + 1 month). */
export function RequestDialog({ personId, onClose, onCreated }: { personId?: string; onClose: () => void; onCreated?: (request: PrivacyRequest) => void }) {
  const { t } = useTranslation('shell');
  const { t: common } = useTranslation('common');
  const refresh = useRefreshPrivacy();
  const { data: persons = [] } = usePersons();
  const [value, setValue] = useState<Required<Omit<PrivacyRequestInput, 'language'>> & { language: Language }>({
    personId: personId ?? '',
    kind: 'access',
    receivedOn: berlinToday(),
    channel: 'letter',
    identityChecked: false,
    identityNote: '',
    content: '',
    language: 'de',
    activityKey: null,
    activity: '',
    restrict: false,
  });
  const { data: activities = [] } = useActivityOptions();
  const localized = useLocalized();
  const set = <K extends keyof typeof value>(key: K, v: (typeof value)[K]) => setValue((current) => ({ ...current, [key]: v }));
  const create = useAction((input: typeof value) => send<PrivacyRequest>('POST', 'core/privacy/requests', input), {
    success: t('privacy.create.created'),
    onSuccess: async (request) => {
      await refresh();
      onCreated?.(request);
      onClose();
    },
  });
  const canRestrict = value.kind === 'objection' || value.kind === 'restriction';
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={t('privacy.create.title')}
      size="lg"
      actions={
        <>
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button loading={create.isPending} disabled={!value.personId || !value.receivedOn} onClick={() => create.mutate({ ...value, restrict: canRestrict && value.restrict })}>
            {t('privacy.create.submit')}
          </Button>
        </>
      }
    >
      {!personId && (
        <Select
          label={t('privacy.create.person')}
          placeholder={t('privacy.create.personPlaceholder')}
          required
          searchable
          data={persons.map((p) => ({ value: p.id, label: personLabel(p) }))}
          value={value.personId || null}
          onChange={(id) => set('personId', id ?? '')}
        />
      )}
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <Select
          label={t('privacy.create.kind')}
          required
          allowDeselect={false}
          data={PrivacyRequestKind.options.map((k) => ({ value: k, label: t(`privacy.kinds.${k}`) }))}
          value={value.kind}
          onChange={(k) => k && set('kind', k as PrivacyRequestInput['kind'])}
        />
        <TextInput label={t('privacy.create.receivedOn')} type="date" required max={berlinToday()} value={value.receivedOn} onChange={(e) => set('receivedOn', e.currentTarget.value)} />
        <Select
          label={t('privacy.create.channel')}
          allowDeselect={false}
          data={PrivacyRequestChannel.options.filter((c) => c !== 'my-area').map((c) => ({ value: c, label: t(`privacy.channels.${c}`) }))}
          value={value.channel}
          onChange={(c) => c && set('channel', c as PrivacyRequestInput['channel'])}
        />
        <TextInput label={t('privacy.create.deadline')} type="date" disabled value={value.receivedOn ? addMonthsToDate(value.receivedOn, 1) : ''} description={t('privacy.create.deadlineHint')} />
        <Select
          label={t('privacy.create.language')}
          allowDeselect={false}
          data={(['de', 'en'] as const).map((l) => ({ value: l, label: t(`privacy.languages.${l}`) }))}
          value={value.language}
          onChange={(l) => l && set('language', l as Language)}
        />
      </SimpleGrid>
      {value.kind === 'objection' && (
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Select
            label={t('privacy.create.activity')}
            description={t('privacy.create.activityHint')}
            clearable
            data={activities.map((a) => ({ value: a.key, label: localized(a.name) }))}
            value={value.activityKey}
            onChange={(key) => set('activityKey', key)}
          />
          <TextInput label={t('privacy.create.activityNote')} description={t('privacy.create.activityNoteHint')} value={value.activity} onChange={(e) => set('activity', e.currentTarget.value)} />
        </SimpleGrid>
      )}
      <Textarea label={t('privacy.create.content')} autosize minRows={3} value={value.content} onChange={(e) => set('content', e.currentTarget.value)} />
      <Checkbox label={t('privacy.create.identityChecked')} checked={value.identityChecked} onChange={(e) => set('identityChecked', e.currentTarget.checked)} />
      {value.identityChecked && (
        <TextInput label={t('privacy.create.identityNote')} placeholder={t('privacy.create.identityNotePlaceholder')} value={value.identityNote} onChange={(e) => set('identityNote', e.currentTarget.value)} />
      )}
      {canRestrict && (
        <Checkbox label={t('privacy.create.restrict')} description={t('privacy.create.restrictHint')} checked={value.restrict} onChange={(e) => set('restrict', e.currentTarget.checked)} />
      )}
    </ResponsiveDialog>
  );
}

/** "Verarbeitung einschränken?": reason and planned end; critical action, so the dialog says what happens. */
export function RestrictDialog({ personId, name, requestId, onClose }: { personId: string; name: string; requestId?: string; onClose: () => void }) {
  const { t } = useTranslation('shell');
  const { t: common } = useTranslation('common');
  const refresh = useRefreshPrivacy();
  const [reason, setReason] = useState<ProcessingRestrictionInput['reason']>('accuracy-contested');
  const [until, setUntil] = useState('');
  const restrict = useAction(() => send('PUT', `masterdata/persons/${personId}/restriction`, { reason, until: until || null, requestId: requestId ?? null }), {
    success: t('privacy.restriction.restricted'),
    onSuccess: async () => {
      await refresh();
      onClose();
    },
  });
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={t('privacy.restriction.title')}
      actions={
        <>
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button color="brand" loading={restrict.isPending} onClick={() => restrict.mutate(undefined)}>{t('privacy.restriction.submit')}</Button>
        </>
      }
    >
      <Text size="sm">{t('privacy.restriction.text', { name })}</Text>
      <Select
        label={t('privacy.restriction.reason')}
        required
        allowDeselect={false}
        data={ProcessingRestrictionReason.options.map((r) => ({ value: r, label: t(`privacy.reasons.${r}`) }))}
        value={reason}
        onChange={(r) => r && setReason(r as ProcessingRestrictionInput['reason'])}
      />
      <TextInput label={t('privacy.restriction.until')} type="date" min={berlinToday()} description={t('privacy.restriction.untilHint')} value={until} onChange={(e) => setUntil(e.currentTarget.value)} />
    </ResponsiveDialog>
  );
}

/** "Einschränkung aufheben?" */
export function LiftDialog({ personId, name, onClose }: { personId: string; name: string; onClose: () => void }) {
  const { t } = useTranslation('shell');
  const { t: common } = useTranslation('common');
  const refresh = useRefreshPrivacy();
  const lift = useAction(() => send('DELETE', `masterdata/persons/${personId}/restriction`), {
    success: t('privacy.restriction.lifted'),
    onSuccess: async () => {
      await refresh();
      onClose();
    },
  });
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={t('privacy.restriction.liftTitle')}
      actions={
        <>
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button loading={lift.isPending} onClick={() => lift.mutate(undefined)}>{t('privacy.restriction.liftSubmit')}</Button>
        </>
      }
    >
      <Text size="sm">{t('privacy.restriction.liftText', { name })}</Text>
    </ResponsiveDialog>
  );
}

/** "Information vermerken": date and channel for one or many persons. */
export function InformationDialog({ personIds, onClose, onDone }: { personIds: string[]; onClose: () => void; onDone?: () => void }) {
  const { t } = useTranslation('shell');
  const { t: common } = useTranslation('common');
  const refresh = useRefreshPrivacy();
  const [informedOn, setInformedOn] = useState(berlinToday());
  const [via, setVia] = useState<PrivacyInformationVia>('letter');
  const record = useAction(() => send<{ count: number }>('POST', 'masterdata/privacy/information', { personIds, informedOn, via }), {
    onSuccess: async (result) => {
      await refresh();
      notifySuccess(t('privacy.information.recorded', { count: result.count }));
      onDone?.();
      onClose();
    },
  });
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={t('privacy.information.dialogTitle')}
      actions={
        <>
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button loading={record.isPending} disabled={!informedOn} onClick={() => record.mutate(undefined)}>{common('actions.save')}</Button>
        </>
      }
    >
      <Stack gap="sm">
        <Text size="sm">{t('privacy.information.dialogText', { count: personIds.length })}</Text>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput label={t('privacy.information.informedOn')} type="date" required max={berlinToday()} value={informedOn} onChange={(e) => setInformedOn(e.currentTarget.value)} />
          <Select
            label={t('privacy.information.via')}
            allowDeselect={false}
            data={PrivacyInformationVia.options.map((v) => ({ value: v, label: t(`privacy.via.${v}`) }))}
            value={via}
            onChange={(v) => v && setVia(v as PrivacyInformationVia)}
          />
        </SimpleGrid>
      </Stack>
    </ResponsiveDialog>
  );
}
