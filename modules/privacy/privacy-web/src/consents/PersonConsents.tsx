import { Button, FileInput, Group, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { PersonConsent, PersonConsents as PersonConsentsDto } from '@forga/privacy-contracts';
import { api, formatDate, send, upload, useLocalized, useTranslation } from '@forga/web-sdk';
import { DataTable, Notice, notifyError, Panel, ResponsiveDialog, StatusBadge, useAction } from '@forga/web-ui';

/** Neither withdrawn nor superseded by a consent to a newer version. */
const isValid = (c: PersonConsent) => !c.withdrawnOn && !c.supersededOn;

export const personConsentsKey = (personId: string) => ['privacy', 'person-consents', personId] as const;
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());

export function usePersonConsents(personId: string) {
  return useQuery({ queryKey: personConsentsKey(personId), queryFn: () => api<PersonConsentsDto>(`privacy/persons/${personId}/consents`) });
}

/**
 * „Einwilligungen“ of the person (L9) in the tab „Datenschutz“: given and withdrawn consents with version, way and proof;
 * „Einwilligung erfassen …“ and „Widerruf erfassen …“ (`privacy.consents` for the department or data protection).
 */
export function PersonConsentsPanel({ personId }: { personId: string }) {
  const { t, i18n } = useTranslation('privacy');
  const localized = useLocalized();
  const { data } = usePersonConsents(personId);
  const [recording, setRecording] = useState(false);
  const [withdrawing, setWithdrawing] = useState<PersonConsent | null>(null);
  if (!data) return null;
  const state = (c: PersonConsent) =>
    c.withdrawnOn ? (
      <StatusBadge tone="neutral">{t('transparency.consents.person.withdrawn')}</StatusBadge>
    ) : c.supersededOn ? (
      <StatusBadge tone="neutral">{t('transparency.consents.person.superseded')}</StatusBadge>
    ) : (
      <StatusBadge tone="done">{t('transparency.consents.person.given')}</StatusBadge>
    );
  return (
    <Panel title={t('transparency.consents.person.title')} aside={data.recordable.length > 0 && <Button size="xs" variant="default" onClick={() => setRecording(true)}>{t('transparency.consents.person.record')}</Button>}>
      <Stack gap="sm">
        {data.minor && <Notice kind="info">{t('transparency.consents.person.minor')}</Notice>}
        <DataTable
          rows={data.consents}
          rowKey={(c) => c.id}
          exportable={false}
          empty={t('transparency.consents.person.none')}
          columns={[
            {
              key: 'consent',
              header: t('transparency.consents.columns.consent'),
              render: (c) => (
                <Stack gap={0}>
                  <Text size="sm" fw={700}>{localized(c.title)}</Text>
                  <Text size="xs" c="dimmed">
                    {c.withdrawnOn
                      ? t('transparency.consents.person.withdrawnLine', { date: formatDate(c.withdrawnOn, i18n.language), via: t(`transparency.consents.ways.${c.withdrawnVia ?? 'written'}`) })
                      : t('transparency.consents.person.line', { version: c.version, via: t(`transparency.consents.ways.${c.givenVia}`), date: formatDate(c.givenOn, i18n.language) }) +
                        (c.recordedByName && c.givenVia !== 'my-area' && c.givenVia !== 'first-login' ? t('transparency.consents.person.recordedBy', { name: c.recordedByName }) : '')}
                    {c.proofCount > 0 && ` · ${t('transparency.consents.person.proofs', { count: c.proofCount })}`}
                    {isValid(c) && c.currentVersion !== null && c.currentVersion > c.version && ` · ${t('transparency.consents.person.newVersion', { version: c.currentVersion })}`}
                  </Text>
                </Stack>
              ),
            },
            { key: 'state', header: t('transparency.consents.columns.state'), width: 160, render: state },
            {
              key: 'actions',
              header: '',
              width: 180,
              render: (c) => isValid(c) && <Button size="xs" variant="default" onClick={() => setWithdrawing(c)}>{t('transparency.consents.person.withdraw')}</Button>,
            },
          ]}
        />
      </Stack>
      {recording && <RecordConsentDialog personId={personId} consents={data} onClose={() => setRecording(false)} />}
      {withdrawing && <WithdrawConsentDialog personId={personId} consent={withdrawing} onClose={() => setWithdrawing(null)} />}
    </Panel>
  );
}

/** „Einwilligung erfassen“: catalog entry (version), given on, way and the scanned proof. */
function RecordConsentDialog({ personId, consents, onClose }: { personId: string; consents: PersonConsentsDto; onClose: () => void }) {
  const { t } = useTranslation('privacy');
  const { t: common } = useTranslation('common');
  const localized = useLocalized();
  const queryClient = useQueryClient();
  const [key, setKey] = useState(consents.recordable[0]?.key ?? '');
  const [givenOn, setGivenOn] = useState(today());
  const entry = consents.recordable.find((r) => r.key === key);
  const [via, setVia] = useState<'written' | 'in-person' | 'guardians'>(consents.minor && entry?.givenBy === 'person-or-guardians' ? 'guardians' : 'written');
  const [proof, setProof] = useState<File | null>(null);
  const record = useAction(
    async () => {
      const consent = await send<PersonConsent>('POST', `privacy/persons/${personId}/consents`, { key, givenOn, via });
      // The proof follows the consent; a failed upload leaves the consent recorded.
      if (proof) await upload(`core/attachments?type=privacy.consent&id=${consent.id}`, proof).catch(notifyError);
      return consent;
    },
    {
      success: t('transparency.consents.person.recorded'),
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: personConsentsKey(personId) });
        onClose();
      },
    },
  );
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={t('transparency.consents.person.recordTitle')}
      actions={
        <>
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button loading={record.isPending} disabled={!key || !givenOn} onClick={() => record.mutate(undefined)}>{common('actions.save')}</Button>
        </>
      }
    >
      <Select
        label={t('transparency.consents.person.consent')}
        required
        allowDeselect={false}
        data={consents.recordable.map((r) => ({ value: r.key, label: t('transparency.consents.person.versionLabel', { title: localized(r.title), version: r.version }) }))}
        value={key}
        onChange={(k) => k && setKey(k)}
      />
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <TextInput label={t('transparency.consents.person.givenOn')} type="date" required max={today()} value={givenOn} onChange={(e) => setGivenOn(e.currentTarget.value)} />
        <Select
          label={t('transparency.consents.person.via')}
          allowDeselect={false}
          data={(['written', 'in-person', 'guardians'] as const).map((w) => ({ value: w, label: t(`transparency.consents.ways.${w}`) }))}
          value={via}
          onChange={(w) => w && setVia(w as typeof via)}
        />
      </SimpleGrid>
      <FileInput label={t('transparency.consents.person.proof')} accept="application/pdf,image/png,image/jpeg,image/webp" clearable value={proof} onChange={setProof} />
      <Text size="xs" c="dimmed">{t('transparency.consents.person.textStored')}</Text>
    </ResponsiveDialog>
  );
}

/** „Widerruf erfassen?“: applies from the withdrawal on; with a request "withdrawal of consent" it closes the request. */
export function WithdrawConsentDialog({ personId, consent, requestId, onClose, onDone }: { personId: string; consent: PersonConsent; requestId?: string; onClose: () => void; onDone?: () => void }) {
  const { t } = useTranslation('privacy');
  const { t: common } = useTranslation('common');
  const localized = useLocalized();
  const queryClient = useQueryClient();
  const [withdrawnOn, setWithdrawnOn] = useState(today());
  const [via, setVia] = useState<'written' | 'email' | 'in-person'>('written');
  const withdraw = useAction(() => send('POST', `privacy/given-consents/${consent.id}/withdraw`, { withdrawnOn, via, requestId: requestId ?? null }), {
    success: t('transparency.consents.person.withdrawnDone'),
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: personConsentsKey(personId) }), queryClient.invalidateQueries({ queryKey: ['privacy'] })]);
      onDone?.();
      onClose();
    },
  });
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={t('transparency.consents.person.withdrawTitle')}
      actions={
        <>
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button loading={withdraw.isPending} disabled={!withdrawnOn} onClick={() => withdraw.mutate(undefined)}>{t('transparency.consents.person.withdrawSubmit')}</Button>
        </>
      }
    >
      <Text size="sm">{t('transparency.consents.person.withdrawText', { title: localized(consent.title) })}</Text>
      {requestId && <Text size="sm">{t('transparency.consents.person.withdrawRequest')}</Text>}
      <Group grow align="flex-start">
        <TextInput label={t('transparency.consents.person.withdrawnOn')} type="date" required min={consent.givenOn} max={today()} value={withdrawnOn} onChange={(e) => setWithdrawnOn(e.currentTarget.value)} />
        <Select
          label={t('transparency.consents.person.via')}
          allowDeselect={false}
          data={(['written', 'email', 'in-person'] as const).map((w) => ({ value: w, label: t(`transparency.consents.ways.${w}`) }))}
          value={via}
          onChange={(w) => w && setVia(w as typeof via)}
        />
      </Group>
    </ResponsiveDialog>
  );
}

/** On the page of a request "withdrawal of consent": the person's valid consents, each withdrawable with the request. */
export function RequestConsents({ personId, requestId, open }: { personId: string; requestId: string; open: boolean }) {
  const { t, i18n } = useTranslation('privacy');
  const localized = useLocalized();
  const { data } = usePersonConsents(personId);
  const [withdrawing, setWithdrawing] = useState<PersonConsent | null>(null);
  if (!data) return null;
  const valid = data.consents.filter(isValid);
  return (
    <Panel title={t('transparency.consents.request.title')}>
      <Stack gap="sm">
        {open && <Text size="sm" c="dimmed">{t('transparency.consents.request.hint')}</Text>}
        <DataTable
          rows={valid}
          rowKey={(c) => c.id}
          exportable={false}
          empty={t('transparency.consents.request.none')}
          columns={[
            { key: 'consent', header: t('transparency.consents.columns.consent'), render: (c) => localized(c.title) },
            { key: 'given', header: t('transparency.consents.columns.given'), render: (c) => t('transparency.consents.person.line', { version: c.version, via: t(`transparency.consents.ways.${c.givenVia}`), date: formatDate(c.givenOn, i18n.language) }) },
            { key: 'actions', header: '', width: 180, render: (c) => open && <Button size="xs" variant="default" onClick={() => setWithdrawing(c)}>{t('transparency.consents.person.withdraw')}</Button> },
          ]}
        />
      </Stack>
      {withdrawing && <WithdrawConsentDialog personId={personId} consent={withdrawing} requestId={requestId} onClose={() => setWithdrawing(null)} />}
    </Panel>
  );
}
