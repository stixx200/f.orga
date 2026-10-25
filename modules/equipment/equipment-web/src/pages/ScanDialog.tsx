import { ActionIcon, Button, Group, Stack, Text, TextInput, Tooltip } from '@mantine/core';
import { IconNfc } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { normalizeRfid } from '@forga/core-contracts';
import type { Item } from '@forga/equipment-contracts';
import { useTranslation } from '@forga/web-sdk';
import { CodeCamera, nfcSupported, readNfc, ResponsiveDialog, signalScan } from '@forga/web-ui';

/** Item ID from the URL of a label (`…/equipment/items/<id>`), else the text as typed (inventory number, barcode, RFID chip). */
export function scannedCode(text: string): { id?: string; code?: string } {
  const match = /\/equipment\/items\/([0-9a-f-]{36})/i.exec(text);
  return match ? { id: match[1].toLowerCase() } : { code: text.trim() };
}

/** Whether a typed or scanned code names the item. */
export function matchesCode(item: Pick<Item, 'id' | 'inventoryNumber' | 'barcode' | 'rfid'>, scanned: { id?: string; code?: string }): boolean {
  if (scanned.id) return item.id === scanned.id;
  const code = scanned.code?.toLowerCase() ?? '';
  return item.inventoryNumber.toLowerCase() === code || item.barcode?.toLowerCase() === code || (item.rfid !== null && item.rfid === normalizeRfid(scanned.code ?? ''));
}

export type ScanResult = { message: string; ok: boolean };

/**
 * Scans the QR codes of the labels one after the other with the camera, reads RFID/NFC chips (where the browser can),
 * or takes the code or inventory number typed in (also from a hand scanner that acts as a keyboard). `onScan` returns
 * the message shown for the last code; a hit vibrates and beeps.
 */
export function ScanDialog({ onScan, onClose }: { onScan: (text: string) => ScanResult | Promise<ScanResult>; onClose: () => void }) {
  const { t } = useTranslation('equipment');
  const { t: common } = useTranslation('common');
  const [typed, setTyped] = useState('');
  const [last, setLast] = useState<ScanResult | null>(null);
  const [reading, setReading] = useState<AbortController | null>(null);
  useEffect(() => () => reading?.abort(), [reading]);
  // One code at a time: a second one waits until the first is handled.
  const queue = useRef(Promise.resolve());

  const handle = (text: string) => {
    queue.current = queue.current.then(async () => {
      const result = await Promise.resolve(onScan(text)).catch((): ScanResult => ({ message: t('scan.failed'), ok: false }));
      signalScan(result.ok);
      setLast(result);
    });
  };

  const submit = () => {
    if (!typed.trim()) return;
    handle(typed);
    setTyped('');
  };

  // Chips are read one after the other until the button is pressed again.
  const nfc = () => {
    if (reading) {
      reading.abort();
      setReading(null);
      return;
    }
    const controller = new AbortController();
    setReading(controller);
    const next = () =>
      readNfc(controller.signal)
        .then((id) => {
          handle(id);
          if (!controller.signal.aborted) void next();
        })
        .catch(() => setReading(null));
    void next();
  };

  return (
    <ResponsiveDialog opened onClose={onClose} title={t('scan.title')} actions={<Group justify="flex-end"><Button onClick={onClose}>{common('actions.close')}</Button></Group>}>
      <Stack gap="sm">
        <CodeCamera onCode={handle} />
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Group align="end" wrap="nowrap">
            <TextInput label={t('scan.code')} value={typed} onChange={(e) => setTyped(e.currentTarget.value)} style={{ flex: 1 }} data-autofocus />
            {nfcSupported() && (
              <Tooltip label={reading ? common('codes.nfcWaiting') : common('codes.nfc')}>
                <ActionIcon size="lg" variant={reading ? 'filled' : 'default'} onClick={nfc} aria-label={common('codes.nfc')}>
                  <IconNfc size={18} />
                </ActionIcon>
              </Tooltip>
            )}
            <Button type="submit" variant="default">{t('scan.add')}</Button>
          </Group>
        </form>
        {last && <Text size="sm" fw={700} c={last.ok ? undefined : 'red.8'} aria-live="polite">{last.message}</Text>}
      </Stack>
    </ResponsiveDialog>
  );
}
