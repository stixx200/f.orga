import { Button, Checkbox, Group, Select, SegmentedControl, Stack, Table, Text, TextInput } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useMemo, useState } from 'react';
import {
  type DriverLicenseCheckInput,
  type DriverLicenseClass,
  type DriverLicenseFile,
  type DriverLicenseTokenKind,
  LICENSE_CLASSES,
} from '@forga/masterdata-contracts';
import { formatDate, send, useSession, useTranslation } from '@forga/web-sdk';
import { CodeInput, ConfirmDialog, Notice, ResponsiveDialog, useAction } from '@forga/web-ui';
import { personName, today, usePersons } from '../api';
import { COMMON_CLASSES, useLicenseChanged } from './api';

type Row = { on: boolean; expiresOn: string | null };

const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** The fields of a sticker: kind and ID from a hand scanner, NFC reader, the camera or Web NFC. */
function TokenFields({ kind, code, onChange }: { kind: DriverLicenseTokenKind; code: string; onChange: (value: { kind: DriverLicenseTokenKind; code: string }) => void }) {
  const { t } = useTranslation('masterdata');
  return (
    <Stack gap="xs">
      <SegmentedControl
        value={kind}
        onChange={(v) => onChange({ kind: v as DriverLicenseTokenKind, code })}
        data={[{ value: 'nfc', label: t('licenses.token.nfc') }, { value: 'barcode', label: t('licenses.token.barcode') }]}
      />
      <CodeInput
        label={t('licenses.token.code')}
        placeholder={t('licenses.token.codePlaceholder')}
        value={code}
        onChange={(v) => onChange({ kind, code: v })}
        source={kind === 'nfc' ? 'nfc' : 'camera'}
        autoComplete="off"
      />
      <Notice kind="warning">{t('licenses.token.seal')}</Notice>
    </Stack>
  );
}

/**
 * "Kontrolle erfassen": date, examiner, original presented, the classes as on the original with their own expiry
 * (changes against the file are marked), expiry of the document, note and optionally a sticker. No copy, no photo.
 */
export function CheckDialog({ file, onClose }: { file: DriverLicenseFile; onClose: () => void }) {
  const { t, i18n } = useTranslation('masterdata');
  const { t: common } = useTranslation('common');
  const session = useSession().data;
  const changed = useLicenseChanged();
  const { data: persons = [] } = usePersons();
  const known = new Map(file.license.classes.map((c) => [c.class, c]));
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries([...new Set([...COMMON_CLASSES, ...known.keys()])].map((c) => [c, { on: known.has(c), expiresOn: known.get(c)?.expiresOn ?? null }])),
  );
  const [checkedOn, setCheckedOn] = useState<string | null>(today());
  const [examiner, setExaminer] = useState<string | null>(session?.user.personId ?? null);
  const [original, setOriginal] = useState(true);
  const [documentExpiresOn, setDocumentExpiresOn] = useState<string | null>(file.license.documentExpiresOn);
  const [note, setNote] = useState('');
  const [withToken, setWithToken] = useState(false);
  const [token, setToken] = useState<{ kind: DriverLicenseTokenKind; code: string }>({ kind: 'nfc', code: '' });
  const examiners = useMemo(() => {
    const own = session?.user.personId ? [{ value: session.user.personId, label: session.user.displayName }] : [];
    return [...own, ...persons.filter((p) => p.id !== session?.user.personId && p.status !== 'left').map((p) => ({ value: p.id, label: `${p.lastName}, ${p.firstName}` }))];
  }, [persons, session]);
  const classes: DriverLicenseClass[] = Object.entries(rows)
    .filter(([, r]) => r.on)
    .map(([c, r]) => ({ class: c, expiresOn: r.expiresOn }));
  const differs = (c: string) => {
    const row = rows[c];
    const before = known.get(c);
    return row.on !== Boolean(before) || (row.on && (row.expiresOn ?? null) !== (before?.expiresOn ?? null));
  };
  const save = useAction(
    () =>
      send<DriverLicenseFile>('POST', `masterdata/persons/${file.person.id}/driver-license/checks`, {
        checkedOn: checkedOn ?? '',
        checkedById: examiner ?? '',
        originalPresented: true,
        classes,
        documentExpiresOn,
        note,
        token: withToken && token.code.trim() ? token : null,
      } satisfies DriverLicenseCheckInput),
    {
      success: t('licenses.check.saved'),
      onSuccess: (saved) => {
        changed(saved);
        onClose();
      },
    },
  );
  const others = LICENSE_CLASSES.filter((c) => !(c in rows));
  const open = file.requests.find((r) => !r.completedByCheckId && !r.withdrawnAt);
  const valid = Boolean(checkedOn && checkedOn <= today() && examiner && original && (!withToken || token.code.trim().length >= 4));

  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      size="lg"
      title={t('licenses.check.title')}
      actions={
        <>
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button loading={save.isPending} disabled={!valid} onClick={() => save.mutate(undefined)}>{t('licenses.check.save')}</Button>
        </>
      }
    >
      <Stack gap="sm">
        <Text size="sm" c="dimmed">{personName(file.person)}</Text>
        {open && <Notice kind="info">{t('licenses.check.settlesRequest', { date: formatDate(open.dueOn, i18n.language) })}</Notice>}
        <Group grow align="start">
          <DateInput label={t('licenses.check.date')} value={checkedOn} onChange={setCheckedOn} valueFormat="DD.MM.YYYY" maxDate={today()} required />
          <Select label={t('licenses.check.examiner')} data={examiners} value={examiner} onChange={setExaminer} searchable required />
        </Group>
        <Checkbox label={t('licenses.check.original')} checked={original} onChange={(e) => setOriginal(e.currentTarget.checked)} />
        <Text fw={700} size="sm" mt="xs">{t('licenses.check.classesTitle')}</Text>
        <Table withTableBorder>
          <Table.Thead>
            <Table.Tr><Table.Th>{t('licenses.class')}</Table.Th><Table.Th>{t('licenses.validUntil')}</Table.Th></Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {Object.entries(rows).map(([c, row]) => (
              <Table.Tr key={c} bg={differs(c) ? 'var(--mantine-color-yellow-light)' : undefined}>
                <Table.Td>
                  <Checkbox label={c} checked={row.on} onChange={(e) => setRows({ ...rows, [c]: { ...row, on: e.currentTarget.checked } })} />
                </Table.Td>
                <Table.Td>
                  <DateInput
                    aria-label={t('licenses.validUntilClass', { class: c })}
                    value={row.expiresOn}
                    onChange={(v) => setRows({ ...rows, [c]: { on: true, expiresOn: v } })}
                    valueFormat="DD.MM.YYYY"
                    clearable
                    size="xs"
                  />
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        <Group align="end">
          {others.length > 0 && (
            <Select
              label={t('licenses.check.addClass')}
              data={others}
              value={null}
              onChange={(c) => c && setRows({ ...rows, [c]: { on: true, expiresOn: null } })}
              searchable
              w={180}
            />
          )}
          <Text size="xs" c="dimmed">{t('licenses.check.classesHint')}</Text>
        </Group>
        <DateInput label={t('licenses.documentExpiresOn')} description={t('licenses.check.documentHint')} value={documentExpiresOn} onChange={setDocumentExpiresOn} valueFormat="DD.MM.YYYY" clearable />
        <TextInput label={t('licenses.check.note')} placeholder={t('licenses.check.notePlaceholder')} value={note} onChange={(e) => setNote(e.currentTarget.value)} />
        <Checkbox label={t('licenses.check.registerToken')} checked={withToken} onChange={(e) => setWithToken(e.currentTarget.checked)} />
        {withToken && <TokenFields kind={token.kind} code={token.code} onChange={setToken} />}
        <Notice kind="info">{t('licenses.check.noCopy')}</Notice>
      </Stack>
    </ResponsiveDialog>
  );
}

/** "Erneute Vorlage anfordern" with a reason (seen only by the checkers) and a due date (default in 14 days). */
export function RequestDialog({ file, onClose }: { file: DriverLicenseFile; onClose: () => void }) {
  const { t } = useTranslation('masterdata');
  const { t: common } = useTranslation('common');
  const changed = useLicenseChanged();
  const [reason, setReason] = useState('');
  const [dueOn, setDueOn] = useState<string | null>(addDays(today(), 14));
  const save = useAction(() => send<DriverLicenseFile>('POST', `masterdata/persons/${file.person.id}/driver-license/requests`, { reason, dueOn }), {
    success: t('licenses.request.saved'),
    onSuccess: (saved) => {
      changed(saved);
      onClose();
    },
  });
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={t('licenses.request.title')}
      actions={
        <>
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button loading={save.isPending} disabled={!reason.trim() || !dueOn} onClick={() => save.mutate(undefined)}>{t('licenses.request.save')}</Button>
        </>
      }
    >
      <Stack gap="sm">
        <Text size="sm" c="dimmed">{personName(file.person)}</Text>
        <Text size="sm">{t('licenses.request.text')}</Text>
        <TextInput label={t('licenses.request.reason')} description={t('licenses.request.reasonHint')} placeholder={t('licenses.request.reasonPlaceholder')} value={reason} onChange={(e) => setReason(e.currentTarget.value)} required />
        <DateInput label={t('licenses.request.dueOn')} value={dueOn} onChange={setDueOn} valueFormat="DD.MM.YYYY" required />
      </Stack>
    </ResponsiveDialog>
  );
}

/** Registers or replaces the sticker after the original was seen. */
export function TokenDialog({ file, onClose }: { file: DriverLicenseFile; onClose: () => void }) {
  const { t } = useTranslation('masterdata');
  const { t: common } = useTranslation('common');
  const changed = useLicenseChanged();
  const [token, setToken] = useState<{ kind: DriverLicenseTokenKind; code: string }>({ kind: 'nfc', code: '' });
  const save = useAction(() => send<DriverLicenseFile>('POST', `masterdata/persons/${file.person.id}/driver-license/tokens`, token), {
    success: t('licenses.token.saved'),
    onSuccess: (saved) => {
      changed(saved);
      onClose();
    },
  });
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={t('licenses.token.title')}
      actions={
        <>
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button loading={save.isPending} disabled={token.code.trim().length < 4} onClick={() => save.mutate(undefined)}>{t('licenses.token.register')}</Button>
        </>
      }
    >
      <Stack gap="sm">
        <Text size="sm">{t('licenses.token.text')}</Text>
        <TokenFields kind={token.kind} code={token.code} onChange={setToken} />
      </Stack>
    </ResponsiveDialog>
  );
}

/** Confirmation with a required reason that ends in the file (cancel a check, withdraw a request, revoke a sticker). */
export function ReasonDialog({ file, path, title, description, confirmLabel, reasonLabel, onClose }: {
  file: DriverLicenseFile;
  path: string;
  title: string;
  description: string;
  confirmLabel: string;
  reasonLabel: string;
  onClose: () => void;
}) {
  const { t } = useTranslation('masterdata');
  const changed = useLicenseChanged();
  const run = useAction((reason: string) => send<DriverLicenseFile>('POST', `masterdata/persons/${file.person.id}/driver-license/${path}`, { reason }), {
    success: t('licenses.done'),
    onSuccess: (saved) => {
      changed(saved);
      onClose();
    },
  });
  return <ConfirmDialog opened onClose={onClose} title={title} description={description} confirmLabel={confirmLabel} reason={reasonLabel} loading={run.isPending} onConfirm={(reason) => run.mutate(reason)} />;
}

const REVOKE_REASONS = ['lost', 'newLicense', 'misuse', 'other'] as const;

/** "Transponder sperren": takes effect at once; a scan then shows "not registered". */
export function RevokeDialog({ file, tokenId, suffix, onClose }: { file: DriverLicenseFile; tokenId: string; suffix: string; onClose: () => void }) {
  const { t } = useTranslation('masterdata');
  const { t: common } = useTranslation('common');
  const changed = useLicenseChanged();
  const [reason, setReason] = useState<(typeof REVOKE_REASONS)[number]>('lost');
  const [other, setOther] = useState('');
  const text = reason === 'other' ? other.trim() : t(`licenses.revoke.reasons.${reason}`);
  const run = useAction(() => send<DriverLicenseFile>('POST', `masterdata/persons/${file.person.id}/driver-license/tokens/${tokenId}/revoke`, { reason: text }), {
    success: t('licenses.done'),
    onSuccess: (saved) => {
      changed(saved);
      onClose();
    },
  });
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={t('licenses.revoke.title')}
      actions={
        <>
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button color="red" loading={run.isPending} disabled={!text} onClick={() => run.mutate(undefined)}>{t('licenses.revoke.confirm')}</Button>
        </>
      }
    >
      <Stack gap="sm">
        <Text size="sm">{t('licenses.revoke.text', { suffix, name: personName(file.person) })}</Text>
        <Select
          label={t('licenses.revoke.reason')}
          data={REVOKE_REASONS.map((r) => ({ value: r, label: t(`licenses.revoke.reasons.${r}`) }))}
          value={reason}
          onChange={(v) => v && setReason(v as (typeof REVOKE_REASONS)[number])}
          allowDeselect={false}
          required
        />
        {reason === 'other' && <TextInput label={t('licenses.revoke.otherReason')} value={other} onChange={(e) => setOther(e.currentTarget.value)} required />}
      </Stack>
    </ResponsiveDialog>
  );
}
