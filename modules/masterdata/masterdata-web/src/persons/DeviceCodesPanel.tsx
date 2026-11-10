import { Button, Group, SegmentedControl, Stack, Table, Text } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { Person, PersonDeviceToken, PersonDeviceTokenKind } from '@forga/masterdata-contracts';
import { api, formatDate, send, useTranslation } from '@forga/web-sdk';
import { CodeInput, ConfirmDialog, Notice, Panel, ResponsiveDialog, StatusBadge, useAction } from '@forga/web-ui';

const keyOf = (personId: string) => ['masterdata', 'persons', personId, 'device-tokens'] as const;

/**
 * Devices of the person for the info terminal (NFC sticker or barcode): registered after the person was identified,
 * revoked at once. Shows only the last characters of the ID. Editing needs the same permission as the person.
 */
export function DeviceCodesPanel({ person, disabled }: { person: Person; disabled: boolean }) {
  const { t, i18n } = useTranslation('masterdata');
  const queryClient = useQueryClient();
  const [registering, setRegistering] = useState(false);
  const [revoking, setRevoking] = useState<PersonDeviceToken | null>(null);
  const devices = useQuery({ queryKey: keyOf(person.id), queryFn: () => api<PersonDeviceToken[]>(`masterdata/persons/${person.id}/device-tokens`) });
  const kindName = (kind: PersonDeviceTokenKind) => (kind === 'nfc' ? t('person.devices.nfc') : t('person.devices.barcode'));
  const active = (devices.data ?? []).filter((d) => !d.revokedAt);
  const history = (devices.data ?? []).filter((d) => d.revokedAt);

  return (
    <Panel title={t('person.devices.title')}>
      <Stack gap="sm">
        <Text size="sm" c="dimmed">{t('person.devices.text')}</Text>
        {devices.isError && <Notice kind="error">{t('person.devices.loadFailed')}</Notice>}
        {devices.isSuccess && !active.length && <Text size="sm">{t('person.devices.none')}</Text>}
        {active.length > 0 && (
          <Table withTableBorder>
            <Table.Tbody>
              {active.map((d) => (
                <Table.Tr key={d.id}>
                  <Table.Td>{kindName(d.kind)}</Table.Td>
                  <Table.Td>…{d.suffix}</Table.Td>
                  <Table.Td>{formatDate(d.registeredAt, i18n.language)}</Table.Td>
                  <Table.Td>
                    {!disabled && <Button size="xs" variant="default" color="red" onClick={() => setRevoking(d)}>{t('person.devices.revoke')}</Button>}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
        {history.length > 0 && (
          <Group gap="xs">
            {history.map((d) => (
              <StatusBadge key={d.id}>{`${kindName(d.kind)} …${d.suffix}: ${t('person.devices.revoked', { date: formatDate(d.revokedAt, i18n.language) })}`}</StatusBadge>
            ))}
          </Group>
        )}
        {!disabled && <Group><Button size="xs" variant="default" onClick={() => setRegistering(true)}>{t('person.devices.add')}</Button></Group>}
      </Stack>
      {registering && <RegisterDeviceDialog personId={person.id} onClose={() => setRegistering(false)} onSaved={() => void queryClient.invalidateQueries({ queryKey: keyOf(person.id) })} />}
      {revoking && (
        <RevokeDeviceDialog
          personId={person.id}
          token={revoking}
          onClose={() => setRevoking(null)}
          onRevoked={() => void queryClient.invalidateQueries({ queryKey: keyOf(person.id) })}
        />
      )}
    </Panel>
  );
}

function RegisterDeviceDialog({ personId, onClose, onSaved }: { personId: string; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation('masterdata');
  const { t: common } = useTranslation('common');
  const [kind, setKind] = useState<PersonDeviceTokenKind>('nfc');
  const [code, setCode] = useState('');
  const save = useAction(() => send<PersonDeviceToken[]>('POST', `masterdata/persons/${personId}/device-tokens`, { kind, code }), {
    success: t('person.devices.saved'),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={t('person.devices.registerTitle')}
      actions={
        <>
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button loading={save.isPending} disabled={code.trim().length < 4} onClick={() => save.mutate(undefined)}>{t('person.devices.register')}</Button>
        </>
      }
    >
      <Stack gap="sm">
        <SegmentedControl
          value={kind}
          onChange={(v) => setKind(v as PersonDeviceTokenKind)}
          data={[
            { value: 'nfc', label: t('person.devices.nfc') },
            { value: 'barcode', label: t('person.devices.barcode') },
          ]}
        />
        <CodeInput
          label={t('licenses.token.code')}
          placeholder={t('licenses.token.codePlaceholder')}
          value={code}
          onChange={setCode}
          source={kind === 'nfc' ? 'nfc' : 'camera'}
          autoComplete="off"
        />
        <Notice kind="warning">{t('person.devices.seal')}</Notice>
      </Stack>
    </ResponsiveDialog>
  );
}

function RevokeDeviceDialog({ personId, token, onClose, onRevoked }: { personId: string; token: PersonDeviceToken; onClose: () => void; onRevoked: () => void }) {
  const { t } = useTranslation('masterdata');
  const run = useAction((reason: string) => send<PersonDeviceToken[]>('POST', `masterdata/persons/${personId}/device-tokens/${token.id}/revoke`, { reason }), {
    success: t('person.devices.revokedDone'),
    onSuccess: () => {
      onRevoked();
      onClose();
    },
  });
  return (
    <ConfirmDialog
      opened
      onClose={onClose}
      title={t('person.devices.revokeTitle')}
      description={t('person.devices.revokeText', { suffix: token.suffix })}
      confirmLabel={t('person.devices.revokeConfirm')}
      reason={t('person.devices.reason')}
      loading={run.isPending}
      onConfirm={(reason) => run.mutate(reason)}
    />
  );
}
