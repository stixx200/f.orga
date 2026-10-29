import { Anchor, Button, Group, Select, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { Language, MyPrivacy as MyPrivacyDto } from '@forga/core-contracts';
import { api, formatDate, send, useTranslation } from '@forga/web-sdk';
import { DataTable, Panel, ResponsiveDialog, StatusBadge, useAction } from '@forga/web-ui';
import { MY_ACCESS_REPORTS_KEY } from '../../privacy/AccessReports';
import { STATUS_TONES } from './PrivacyPage';

const KEY = ['core', 'privacy', 'me'] as const;

/** "Mein Bereich → Datenschutz": request access (identity checked by the sign-in), own requests, notice and contacts. */
export function MyPrivacy() {
  const { t, i18n } = useTranslation('shell');
  const { t: common } = useTranslation('common');
  const { data } = useQuery({ queryKey: KEY, queryFn: () => api<MyPrivacyDto>('core/privacy/me') });
  const [requesting, setRequesting] = useState(false);
  const [language, setLanguage] = useState<Language>(i18n.language === 'en' ? 'en' : 'de');
  const instant = data?.selfService.mode === 'instant';
  const request = useAction(() => send('POST', 'core/privacy/me/requests', { language }), {
    success: t(instant ? 'privacy.me.created' : 'privacy.me.requested'),
    invalidate: [KEY, MY_ACCESS_REPORTS_KEY],
    onSuccess: () => setRequesting(false),
  });
  if (!data) return null;
  const openAccess = data.requests.some((r) => r.kind === 'access' && ['received', 'in-review', 'extended'].includes(r.status));
  return (
    <Panel title={t('privacy.me.title')}>
      <Stack gap="md">
        <Text size="sm">{t('privacy.me.intro')}</Text>
        <Group>
          <Button variant="default" disabled={openAccess} onClick={() => setRequesting(true)}>{t(instant ? 'privacy.me.createNow' : 'privacy.me.request')}</Button>
        </Group>
        <Text fw={700} size="sm">{t('privacy.me.requests')}</Text>
        <DataTable
          rows={data.requests}
          rowKey={(r) => r.id}
          empty={t('privacy.me.none')}
          columns={[
            { key: 'kind', header: t('privacy.me.columns.kind'), render: (r) => t(`privacy.kinds.${r.kind}`) },
            { key: 'received', header: t('privacy.me.columns.received'), render: (r) => formatDate(r.receivedOn, i18n.language) },
            {
              key: 'status',
              header: t('privacy.me.columns.status'),
              render: (r) => (
                <Group gap={6}>
                  <StatusBadge tone={STATUS_TONES[r.status]}>{t(`privacy.statuses.${r.status}`)}</StatusBadge>
                  {!r.closedOn && <Text size="xs" c="dimmed">{t('privacy.me.deadline', { date: formatDate(r.deadline, i18n.language) })}</Text>}
                </Group>
              ),
            },
          ]}
        />
        <Text size="xs" c="dimmed">
          <Anchor href="/privacy" target="_blank" size="xs">{t('privacy.notice.link')}</Anchor>
          {data.notice.acknowledgedAt && ` · ${t('privacy.me.acknowledged', { version: data.notice.acknowledgedVersion, date: formatDate(data.notice.acknowledgedAt, i18n.language) })}`}
          {data.selfService.contact && ` · ${t('privacy.me.contact', { contact: data.selfService.contact })}`}
          {data.dpo.name && ` · ${t('privacy.me.dpo', { dpo: [data.dpo.name, data.dpo.email].filter(Boolean).join(', ') })}`}
        </Text>
      </Stack>
      {requesting && (
        <ResponsiveDialog
          opened
          onClose={() => setRequesting(false)}
          title={t('privacy.me.dialogTitle')}
          actions={
            <>
              <Button variant="default" onClick={() => setRequesting(false)}>{common('actions.cancel')}</Button>
              <Button loading={request.isPending} onClick={() => request.mutate(undefined)}>{t(instant ? 'privacy.me.submitInstant' : 'privacy.me.submit')}</Button>
            </>
          }
        >
          <Text size="sm">{t(instant ? 'privacy.me.dialogTextInstant' : 'privacy.me.dialogText')}</Text>
          <Select
            label={t('privacy.me.language')}
            allowDeselect={false}
            data={(['de', 'en'] as const).map((l) => ({ value: l, label: t(`privacy.languages.${l}`) }))}
            value={language}
            onChange={(l) => l && setLanguage(l as Language)}
          />
        </ResponsiveDialog>
      )}
    </Panel>
  );
}
