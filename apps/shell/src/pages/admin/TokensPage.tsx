import { Button, Checkbox, Code, CopyButton, Group, Stack, Text, TextInput } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { ApiToken, ApiTokenInput, CreatedApiToken, Permission } from '@forga/core-contracts';
import { api, formatDate, formatDateTime, send, useLocalized, useTranslation } from '@forga/web-sdk';
import { ConfirmDialog, DataTable, Notice, PageHeader, Panel, StatusBadge, useAction } from '@forga/web-ui';

const TOKENS_KEY = ['core', 'tokens'] as const;

function tokenState(token: ApiToken): 'revoked' | 'expired' | 'valid' {
  if (token.revokedAt) return 'revoked';
  if (token.expiresAt && new Date(token.expiresAt) < new Date()) return 'expired';
  return 'valid';
}

/** API tokens for other systems (e.g. alarm fax parser); the plain token is shown only once. */
export function TokensPage() {
  const { t, i18n } = useTranslation('shell');
  const localized = useLocalized();
  const { data: tokens = [] } = useQuery({ queryKey: TOKENS_KEY, queryFn: () => api<ApiToken[]>('core/tokens') });
  const { data: permissions = [] } = useQuery({ queryKey: ['core', 'permissions'], queryFn: () => api<Permission[]>('core/permissions') });
  const [draft, setDraft] = useState<{ name: string; scopes: string[]; expiresOn: string | null }>({ name: '', scopes: [], expiresOn: null });
  const [today] = useState(() => new Date());
  const [created, setCreated] = useState<CreatedApiToken | null>(null);
  const [revoking, setRevoking] = useState<ApiToken | null>(null);

  const create = useAction((input: ApiTokenInput) => send<CreatedApiToken>('POST', 'core/tokens', input), {
    invalidate: [TOKENS_KEY],
    onSuccess: (token) => {
      setCreated(token);
      setDraft({ name: '', scopes: [], expiresOn: null });
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
          { key: 'scopes', header: t('tokens.scopes'), render: (token) => token.scopes.map((s) => <Code key={s} mr={4}>{s}</Code>) },
          {
            key: 'expires',
            header: t('tokens.expires'),
            render: (token) => {
              const state = tokenState(token);
              return state === 'valid' ? (token.expiresAt ? formatDate(token.expiresAt, i18n.language) : t('tokens.never')) : <StatusBadge tone="warning">{t(`tokens.${state}`)}</StatusBadge>;
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
            create.mutate(draft);
          }}
        >
          <Stack gap="md">
            <TextInput label={t('tokens.name')} placeholder={t('tokens.namePlaceholder')} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.currentTarget.value })} required />
            <DateInput label={t('tokens.validUntil')} value={draft.expiresOn} onChange={(value) => setDraft({ ...draft, expiresOn: value })} valueFormat="DD.MM.YYYY" clearable minDate={today} />
            <Checkbox.Group label={t('tokens.scopes')} value={draft.scopes} onChange={(scopes) => setDraft({ ...draft, scopes })} required>
              <Stack gap={6} mt={6}>
                {permissions.filter((p) => !p.id.startsWith('core.')).map((p) => (
                  <Checkbox key={p.id} value={p.id} label={<><Code>{p.id}</Code> {localized(p.name)}</>} />
                ))}
              </Stack>
            </Checkbox.Group>
            <Group justify="flex-end">
              <Button type="submit" loading={create.isPending} disabled={!draft.scopes.length}>{t('tokens.create')}</Button>
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
