import { Button, Checkbox, Code, CopyButton, Group, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { API_TOKEN_MAX_DAYS, API_TOKEN_REMINDER_DAYS, type ApiToken, type ApiTokenInput, type CreatedApiToken, type Permission } from '@forga/core-contracts';
import { api, formatDate, formatDateTime, send, useLocalized, useTranslation } from '@forga/web-sdk';
import { ConfirmDialog, DataTable, Notice, PageHeader, Panel, StatusBadge, useAction } from '@forga/web-ui';

const TOKENS_KEY = ['core', 'tokens'] as const;

function tokenState(token: ApiToken): 'revoked' | 'expired' | 'valid' {
  if (token.revokedAt) return 'revoked';
  if (token.expiresAt && new Date(token.expiresAt) < new Date()) return 'expired';
  return 'valid';
}

/** A day `days` after today as `YYYY-MM-DD` (local date). */
function dayAfter(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Ends within the reminder period (L23). */
const endsSoon = (token: ApiToken) => Boolean(token.expiresAt) && new Date(token.expiresAt!).getTime() - Date.now() < API_TOKEN_REMINDER_DAYS * 86_400_000;

interface Draft {
  name: string;
  recipient: string;
  purpose: string;
  scopes: string[];
  expiresOn: string | null;
  addresses: string;
}

const emptyDraft = (): Draft => ({ name: '', recipient: '', purpose: '', scopes: [], expiresOn: dayAfter(365), addresses: '' });

/** API tokens for other systems (e.g. alarm fax parser); the plain token is shown only once. */
export function TokensPage() {
  const { t, i18n } = useTranslation('shell');
  const localized = useLocalized();
  const { data: tokens = [] } = useQuery({ queryKey: TOKENS_KEY, queryFn: () => api<ApiToken[]>('core/tokens') });
  const { data: permissions = [] } = useQuery({ queryKey: ['core', 'permissions'], queryFn: () => api<Permission[]>('core/permissions') });
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [limits] = useState(() => ({ min: dayAfter(0), max: dayAfter(API_TOKEN_MAX_DAYS) }));
  // Permissions with personal data of the members: the recipient goes into the register and the access report.
  const personalData = draft.scopes.some((s) => s.startsWith('masterdata.persons'));
  const [created, setCreated] = useState<CreatedApiToken | null>(null);
  const [revoking, setRevoking] = useState<ApiToken | null>(null);

  const create = useAction((input: ApiTokenInput) => send<CreatedApiToken>('POST', 'core/tokens', input), {
    invalidate: [TOKENS_KEY],
    onSuccess: (token) => {
      setCreated(token);
      setDraft(emptyDraft());
    },
  });
  const revoke = useAction((token: ApiToken) => send('DELETE', `core/tokens/${token.id}`), { invalidate: [TOKENS_KEY], success: t('tokens.revoked') });

  return (
    <Stack gap="lg">
      <PageHeader breadcrumbs={[{ label: t('nav.administration') }, { label: t('nav.tokens') }]} title={t('nav.tokens')} />
      {created && (
        <Notice kind="done" action={<CopyButton value={created.token}>{({ copied, copy }) => <Button size="xs" variant="outline" onClick={copy}>{t(copied ? 'tokens.copied' : 'tokens.copy')}</Button>}</CopyButton>}>
          <strong>{t('tokens.createdTitle')}</strong> {t('tokens.createdText')}
          <Code block mt={6} style={{ wordBreak: 'break-all' }} translate="no">{created.token}</Code>
        </Notice>
      )}
      <DataTable
        exportable={false}
        rows={tokens}
        rowKey={(token) => token.id}
        highlight={(token) => tokenState(token) !== 'valid'}
        columns={[
          { key: 'name', header: t('tokens.name'), render: (token) => <Text fw={700} size="sm">{token.name}<Text span c="dimmed" size="xs"> · {token.prefix}…</Text></Text> },
          {
            key: 'recipient',
            header: t('hardening.tokens.recipient'),
            render: (token) => (
              <>
                <Text size="sm">{token.recipient || '–'}</Text>
                {token.purpose && <Text size="xs" c="dimmed">{token.purpose}</Text>}
                <Text size="xs" c="dimmed">{token.allowedAddresses.length ? t('hardening.tokens.onlyFrom', { addresses: token.allowedAddresses.join(', ') }) : t('hardening.tokens.anyAddress')}</Text>
              </>
            ),
          },
          {
            key: 'scopes',
            header: t('tokens.scopes'),
            render: (token) => (
              <>
                {token.scopes.map((s) =>
                  token.inactiveScopes.includes(s) ? (
                    <Code key={s} mr={4} title={t('tokens.inactiveScope')}><s>{s}</s></Code>
                  ) : (
                    <Code key={s} mr={4}>{s}</Code>
                  ),
                )}
                {token.inactiveScopes.length > 0 && <Text size="xs" c="dimmed" mt={4}>{t('tokens.inactiveScopes')}</Text>}
              </>
            ),
          },
          {
            key: 'expires',
            header: t('tokens.expires'),
            render: (token) => {
              const state = tokenState(token);
              if (state !== 'valid') return <StatusBadge tone="warning">{t(`tokens.${state}`)}</StatusBadge>;
              if (!token.expiresAt) return <StatusBadge tone="warning">{t('hardening.tokens.noExpiry')}</StatusBadge>;
              return (
                <Group gap={6}>
                  {formatDate(token.expiresAt, i18n.language)}
                  {endsSoon(token) && <StatusBadge tone="warning">{t('hardening.tokens.endsSoon')}</StatusBadge>}
                </Group>
              );
            },
          },
          { key: 'lastUsed', header: t('tokens.lastUsed'), render: (token) => formatDateTime(token.lastUsedAt, i18n.language) },
          {
            key: 'actions',
            header: '',
            align: 'right',
            render: (token) => tokenState(token) === 'revoked' ? null : <Button size="xs" variant="default" onClick={() => setRevoking(token)}>{t('tokens.revoke')}</Button>,
          },
        ]}
      />
      <Panel title={t('tokens.new')} maw={720}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!draft.expiresOn) return;
            create.mutate({
              name: draft.name,
              recipient: draft.recipient,
              purpose: draft.purpose,
              scopes: draft.scopes,
              expiresOn: draft.expiresOn,
              allowedAddresses: draft.addresses.split(/[\s,;]+/).map((a) => a.trim()).filter(Boolean),
            });
          }}
        >
          <Stack gap="md">
            <TextInput label={t('tokens.name')} placeholder={t('tokens.namePlaceholder')} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.currentTarget.value })} required />
            <TextInput label={t('hardening.tokens.recipient')} description={t('hardening.tokens.recipientHint')} value={draft.recipient} onChange={(e) => setDraft({ ...draft, recipient: e.currentTarget.value })} required minLength={3} maxLength={200} />
            <Textarea label={t('hardening.tokens.purpose')} description={t('hardening.tokens.purposeHint')} value={draft.purpose} onChange={(e) => setDraft({ ...draft, purpose: e.currentTarget.value })} required minLength={3} maxLength={500} autosize minRows={2} />
            <DateInput label={t('tokens.validUntil')} description={t('hardening.tokens.validUntilHint', { days: API_TOKEN_MAX_DAYS })} value={draft.expiresOn} onChange={(value) => setDraft({ ...draft, expiresOn: value })} valueFormat="DD.MM.YYYY" required minDate={limits.min} maxDate={limits.max} />
            <Textarea label={t('hardening.tokens.addresses')} description={t('hardening.tokens.addressesHint')} value={draft.addresses} onChange={(e) => setDraft({ ...draft, addresses: e.currentTarget.value })} autosize minRows={1} placeholder="192.0.2.10, 10.0.0.0/8" />
            <Checkbox.Group label={t('tokens.scopes')} value={draft.scopes} onChange={(scopes) => setDraft({ ...draft, scopes })} required>
              <Stack gap={6} mt={6}>
                {/* Never for tokens: administration, privileged permissions and those needing the second factor. */}
                {permissions.filter((p) => !p.id.startsWith('core.') && !p.privileged && (!p.stepUp || p.tokenAllowed)).map((p) => (
                  <Checkbox key={p.id} value={p.id} label={<><Code>{p.id}</Code> {localized(p.name)}</>} />
                ))}
              </Stack>
            </Checkbox.Group>
            {personalData && <Notice kind="warning">{t('hardening.tokens.personalData')}</Notice>}
            <Group justify="flex-end">
              <Button type="submit" loading={create.isPending} disabled={!draft.scopes.length || !draft.expiresOn}>{t('tokens.create')}</Button>
            </Group>
          </Stack>
        </form>
      </Panel>
      <ConfirmDialog
        opened={!!revoking}
        onClose={() => setRevoking(null)}
        title={t('tokens.revokeTitle')}
        description={t('tokens.revokeText', { name: revoking?.name })}
        confirmLabel={t('tokens.revoke')}
        onConfirm={() => {
          if (revoking) revoke.mutate(revoking);
          setRevoking(null);
        }}
      />
    </Stack>
  );
}
