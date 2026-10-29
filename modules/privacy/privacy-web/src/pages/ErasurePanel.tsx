import { Button, Group, Stack, Text, TextInput } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { ErasureArea } from '@forga/core-contracts';
import { type ErasureCheck, OPEN_REQUEST_STATUSES, type PrivacyRequest } from '@forga/privacy-contracts';
import { api, formatDate, formatDateTime, send, useLocalized, useTranslation } from '@forga/web-sdk';
import { DataTable, Notice, Panel, ResponsiveDialog, StatusBadge, type Tone, useAction } from '@forga/web-ui';
import { privacyKeys } from '../api';
import { useRefreshPrivacy } from './dialogs';

const TONES: Record<ErasureArea['outcome'], Tone> = { delete: 'done', anonymize: 'warning', keep: 'warning' };

/**
 * "Löschprüfung" on the page of a request on erasure (mockup `datenschutz/anfrage.html`): per data area of every
 * module delete, anonymise or restrict until the end of the retention period, and "Ausführen …" with the name as
 * confirmation.
 */
export function ErasurePanel({ request }: { request: PrivacyRequest }) {
  const { t, i18n } = useTranslation('privacy');
  const localized = useLocalized();
  const [confirming, setConfirming] = useState(false);
  const { data: check } = useQuery({
    queryKey: [...privacyKeys.request(request.id), 'erasure'],
    queryFn: () => api<ErasureCheck>(`privacy/requests/${request.id}/erasure`),
  });
  if (!check) return null;
  const open = OPEN_REQUEST_STATUSES.includes(request.status);
  const executed = check.executed;
  const outcome = (a: ErasureArea) => (
    <StatusBadge tone={TONES[a.outcome]}>{a.outcome === 'keep' && a.keepUntil ? t('erasure.keepUntil', { date: formatDate(a.keepUntil, i18n.language) }) : t(`erasure.outcomes.${a.outcome}`)}</StatusBadge>
  );
  return (
    <Panel title={t('erasure.title')}>
      <Stack gap="sm">
        {executed && (
          <Notice kind="done">
            {[
              t('erasure.done', { date: formatDateTime(executed.executedAt, i18n.language), deleted: executed.deleted, anonymized: executed.anonymized, kept: executed.kept }),
              executed.kept ? (executed.restrictedUntil ? t('erasure.restrictedUntil', { date: formatDate(executed.restrictedUntil, i18n.language) }) : t('erasure.restrictedOpen')) : null,
            ].filter(Boolean).join(' ')}
          </Notice>
        )}
        <Text size="sm" c="dimmed">{t('erasure.intro')}</Text>
        {check.areas.length ? (
          <DataTable
            exportable={false}
            rows={check.areas}
            rowKey={(a) => a.key}
            columns={[
              { key: 'area', header: t('erasure.area'), render: (a) => localized(a.title) },
              { key: 'data', header: t('erasure.data'), render: (a) => localized(a.data) },
              { key: 'outcome', header: t('erasure.outcome'), render: outcome },
              { key: 'reason', header: t('erasure.reason'), render: (a) => (a.reason ? localized(a.reason) : '–') },
            ]}
          />
        ) : (
          <Text size="sm">{t('erasure.nothing')}</Text>
        )}
        {!executed && check.areas.some((a) => a.outcome === 'keep') && <Notice kind="warning">{t('erasure.keptWarning')}</Notice>}
        {!executed && (
          <Group justify="flex-end">
            {!open && <Text size="xs" c="dimmed">{t('erasure.closedHint')}</Text>}
            <Button disabled={!open || !check.areas.some((a) => a.outcome !== 'keep')} onClick={() => setConfirming(true)}>{t('erasure.execute')}</Button>
          </Group>
        )}
      </Stack>
      {confirming && <ExecuteDialog request={request} check={check} onClose={() => setConfirming(false)} />}
    </Panel>
  );
}

function ExecuteDialog({ request, check, onClose }: { request: PrivacyRequest; check: ErasureCheck; onClose: () => void }) {
  const { t } = useTranslation('privacy');
  const { t: common } = useTranslation('common');
  const refresh = useRefreshPrivacy();
  const [name, setName] = useState('');
  const count = (outcome: ErasureArea['outcome']) => check.areas.filter((a) => a.outcome === outcome).length;
  const execute = useAction(() => send('POST', `privacy/requests/${request.id}/erasure`, { confirmName: name }), {
    onSuccess: async () => {
      await refresh();
      onClose();
    },
  });
  const matches = name.trim().replace(/\s+/g, ' ').toLocaleLowerCase() === check.personName.toLocaleLowerCase();
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={t('erasure.executeTitle')}
      actions={
        <>
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button color="red" loading={execute.isPending} disabled={!matches} onClick={() => execute.mutate(undefined)}>{t('erasure.submit')}</Button>
        </>
      }
    >
      <Text size="sm">{t('erasure.executeText', { name: check.personName, deleted: count('delete'), anonymized: count('anonymize'), kept: count('keep') })}</Text>
      <TextInput label={t('erasure.confirmName')} required placeholder={check.personName} value={name} onChange={(e) => setName(e.currentTarget.value)} />
    </ResponsiveDialog>
  );
}
