import { ActionIcon, Button, Group, Text, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconNfc } from '@tabler/icons-react';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import type { Item, ItemStatus } from '@forga/clothing-contracts';
import { normalizeRfid } from '@forga/core-contracts';
import { can, formatDate, localDate, send, useSession, useTranslation } from '@forga/web-sdk';
import { CodeInput, ConfirmDialog, nfcSupported, readNfc, StatusBadge, type Tone, useAction } from '@forga/web-ui';
import { ISSUE, keys, MANAGE } from './api';

const STATUS_TONES: Record<ItemStatus, Tone> = { stock: 'neutral', issued: 'done', retired: 'warning' };

export function ItemStatusBadge({ status }: { status: ItemStatus }) {
  const { t } = useTranslation('clothing');
  return <StatusBadge tone={STATUS_TONES[status]}>{t(`status.${status}`)}</StatusBadge>;
}

/** Why a piece may not be issued: to repair after a failed inspection, to wash after a return to the laundry. */
export function BlockBadges({ item }: { item: Pick<Item, 'blockedBy'> }) {
  const { t } = useTranslation('clothing');
  return (
    <>
      {item.blockedBy.map((block) => (
        <Tooltip key={block} label={t(`blockHints.${block}`)} multiline w={260}>
          <span><StatusBadge tone={block === 'inspection' ? 'error' : 'warning'}>{t(`blocks.${block}`)}</StatusBadge></span>
        </Tooltip>
      ))}
    </>
  );
}

/** Today in Berlin, for the latest date of date inputs (nothing is recorded in advance). */
export const today = () => localDate();

/** A due date, red when overdue, highlighted within 30 days. */
export function Due({ date }: { date: string | null }) {
  const { i18n } = useTranslation('clothing');
  const [{ now, soon }] = useState(() => ({ now: localDate(), soon: localDate(new Date(Date.now() + 30 * 86_400_000)) }));
  if (!date) return null;
  return (
    <Text span size="sm" c={date < now ? 'red.8' : date <= soon ? 'orange.8' : undefined} fw={date <= soon ? 700 : undefined}>
      {formatDate(date, i18n.language)}
    </Text>
  );
}

/** The inspection of the piece is overdue. */
export const inspectionOverdue = (item: Pick<Item, 'inspectionDueOn'>) => Boolean(item.inspectionDueOn && item.inspectionDueOn < localDate());

/**
 * The piece a scanned code belongs to: label of f.orga (QR code with the address of the piece), barcode, RFID chip,
 * inventory or serial number; case and separators of the chip ID do not matter.
 */
export function findByCode<T extends Pick<Item, 'id' | 'barcode' | 'rfid' | 'inventoryNumber' | 'serialNumber'>>(items: T[], code: string): T | undefined {
  const value = code.trim();
  if (!value) return undefined;
  const label = /\/clothing\/items\/([0-9a-f-]{36})/i.exec(value)?.[1]?.toLowerCase();
  const lower = value.toLowerCase();
  const rfid = normalizeRfid(value);
  return items.find(
    (i) => (label && i.id === label) || i.barcode?.toLowerCase() === lower || (rfid && i.rfid === rfid) || i.inventoryNumber.toLowerCase() === lower || (i.serialNumber && i.serialNumber.toLowerCase() === lower),
  );
}

/**
 * Field for scanning pieces: hand scanners and RFID readers type into it and end with Enter, the phone camera and
 * NFC fill it at once. Each code is passed on and the field is cleared.
 */
export function ScanField({ onCode, ...props }: { onCode: (code: string) => void; label?: string; style?: React.CSSProperties }) {
  const { t } = useTranslation('clothing');
  const { t: common } = useTranslation('common');
  const [value, setValue] = useState('');
  const [reading, setReading] = useState<AbortController | null>(null);
  const report = useRef(onCode);
  useEffect(() => {
    report.current = onCode;
  });
  useEffect(() => () => reading?.abort(), [reading]);
  const submit = (code: string) => {
    if (code.trim()) report.current(code.trim());
    setValue('');
  };
  const change = (next: string) => {
    // More than one character at once: camera, NFC or pasted, not typed.
    if (next.length - value.length > 1) submit(next);
    else setValue(next);
  };
  const nfc = () => {
    if (reading) {
      reading.abort();
      setReading(null);
      return;
    }
    const controller = new AbortController();
    setReading(controller);
    readNfc(controller.signal)
      .then(submit)
      .catch(() => undefined)
      .finally(() => {
        controller.abort();
        setReading(null);
      });
  };
  return (
    <Group gap="xs" align="end" wrap="nowrap" style={props.style}>
      <CodeInput
        repeat
        label={props.label ?? t('scan.label')}
        placeholder={t('scan.placeholder')}
        value={value}
        onChange={change}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit(value);
          }
        }}
        source="camera"
        style={{ flex: 1 }}
      />
      {nfcSupported() && (
        <Tooltip label={reading ? common('codes.nfcWaiting') : common('codes.nfc')}>
          <ActionIcon size="lg" mb={2} variant={reading ? 'filled' : 'default'} onClick={nfc} aria-label={common('codes.nfc')}>
            <IconNfc size={18} />
          </ActionIcon>
        </Tooltip>
      )}
    </Group>
  );
}

/** Reports a scanned code without a matching piece. */
export function useUnknownCode() {
  const { t } = useTranslation('clothing');
  return (code: string) => notifications.show({ color: 'orange', message: t('scan.unknown', { code }) });
}

interface Entry {
  id: string;
  recordedById: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancelReason: string;
}

/** Text of an entry; cancelled entries are crossed out with who cancelled them and why. */
export function Cancelled({ entry, children }: { entry: Entry; children: React.ReactNode }) {
  const { t } = useTranslation('clothing');
  if (!entry.cancelledAt) return <>{children}</>;
  return (
    <>
      <Text span size="sm" td="line-through" c="dimmed">{children}</Text>
      <Text size="xs" c="dimmed">{t('cancel.cancelled', { name: entry.cancelledBy, reason: entry.cancelReason })}</Text>
    </>
  );
}

/** Own entries may be cancelled by those recording them, all entries by those managing the store of the department. */
export function useMayCancel() {
  const session = useSession().data;
  return (entry: Entry, departmentIds: string[]) =>
    !entry.cancelledAt &&
    ((entry.recordedById === session?.user.id && departmentIds.some((d) => can(session, ISSUE, d))) || departmentIds.some((d) => can(session, MANAGE, d)));
}

/** Button that cancels a wrong entry with a reason (`path` e.g. `clothing/care/<id>`). */
export function CancelButton({ path }: { path: string }) {
  const { t } = useTranslation('clothing');
  const [open, setOpen] = useState(false);
  const cancel = useAction((reason: string) => send('POST', `${path}/cancel`, { reason }), { success: t('cancel.done'), invalidate: [keys.all], onSuccess: () => setOpen(false) });
  return (
    <>
      <Button size="compact-xs" variant="subtle" color="red" onClick={() => setOpen(true)}>{t('cancel.action')}</Button>
      {open && (
        <ConfirmDialog
          opened
          onClose={() => setOpen(false)}
          title={t('cancel.title')}
          description={t('cancel.text')}
          reason={t('cancel.reason')}
          confirmLabel={t('cancel.action')}
          loading={cancel.isPending}
          onConfirm={(reason) => cancel.mutate(reason)}
        />
      )}
    </>
  );
}
