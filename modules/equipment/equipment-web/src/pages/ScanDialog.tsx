import { Button, Group, Stack, Text, TextInput } from '@mantine/core';
import { useState } from 'react';
import { normalizeRfid } from '@forga/core-contracts';
import type { Item } from '@forga/equipment-contracts';
import { useTranslation } from '@forga/web-sdk';
import { CodeCamera, ResponsiveDialog } from '@forga/web-ui';

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

/**
 * Scans the QR codes of the labels one after the other with the camera, or takes the code or inventory number typed in
 * (also from a hand scanner that acts as a keyboard). `onScan` returns the message shown for the last code.
 */
export function ScanDialog({ onScan, onClose }: { onScan: (text: string) => string; onClose: () => void }) {
  const { t } = useTranslation('equipment');
  const { t: common } = useTranslation('common');
  const [typed, setTyped] = useState('');
  const [last, setLast] = useState<string | null>(null);

  const submit = () => {
    if (!typed.trim()) return;
    setLast(onScan(typed));
    setTyped('');
  };

  return (
    <ResponsiveDialog opened onClose={onClose} title={t('scan.title')} actions={<Group justify="flex-end"><Button onClick={onClose}>{common('actions.close')}</Button></Group>}>
      <Stack gap="sm">
        <CodeCamera onCode={(code) => setLast(onScan(code))} />
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Group align="end" wrap="nowrap">
            <TextInput label={t('scan.code')} value={typed} onChange={(e) => setTyped(e.currentTarget.value)} style={{ flex: 1 }} data-autofocus />
            <Button type="submit" variant="default">{t('scan.add')}</Button>
          </Group>
        </form>
        {last && <Text size="sm" fw={700} aria-live="polite">{last}</Text>}
      </Stack>
    </ResponsiveDialog>
  );
}
