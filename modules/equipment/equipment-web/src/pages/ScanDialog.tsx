import { Button, Group, Stack, Text, TextInput } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '@forga/web-sdk';
import { Notice, ResponsiveDialog } from '@forga/web-ui';

/** Barcode detection of the browser (Chrome, Edge, Android); not in every browser, hence the typed fallback. */
interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
type DetectorClass = new (options: { formats: string[] }) => Detector;
const barcodeDetector = () => (window as unknown as { BarcodeDetector?: DetectorClass }).BarcodeDetector;
const cameraSupported = () => Boolean(barcodeDetector() && navigator.mediaDevices?.getUserMedia);

/** Item ID from the URL of a label (`…/equipment/items/<id>`), else the text as typed (inventory number). */
export function scannedCode(text: string): { id?: string; inventoryNumber?: string } {
  const match = /\/equipment\/items\/([0-9a-f-]{36})/i.exec(text);
  return match ? { id: match[1].toLowerCase() } : { inventoryNumber: text.trim() };
}

/**
 * Scans the QR codes of the labels one after the other with the camera, or takes the code or inventory number typed in
 * (also from a hand scanner that acts as a keyboard). `onScan` returns the message shown for the last code.
 */
export function ScanDialog({ onScan, onClose }: { onScan: (text: string) => string; onClose: () => void }) {
  const { t } = useTranslation('equipment');
  const { t: common } = useTranslation('common');
  const video = useRef<HTMLVideoElement>(null);
  const [camera, setCamera] = useState<'starting' | 'on' | 'unavailable'>(() => (cameraSupported() ? 'starting' : 'unavailable'));
  const [typed, setTyped] = useState('');
  const [last, setLast] = useState<string | null>(null);
  const scan = useRef(onScan);
  useEffect(() => {
    scan.current = onScan;
  });

  useEffect(() => {
    const Barcode = barcodeDetector();
    if (!Barcode || !cameraSupported()) return;
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let stopped = false;
    let previous = '';
    const detector = new Barcode({ formats: ['qr_code'] });
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((s) => {
        if (stopped) {
          for (const track of s.getTracks()) track.stop();
          return;
        }
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play();
        }
        setCamera('on');
        // The same code stays in front of the camera for a while: count it once until another one is seen.
        timer = window.setInterval(() => {
          if (!video.current || video.current.readyState < 2) return;
          detector
            .detect(video.current)
            .then((codes) => {
              const value = codes[0]?.rawValue;
              if (value && value !== previous) {
                previous = value;
                setLast(scan.current(value));
              }
            })
            .catch(() => undefined);
        }, 400);
      })
      .catch(() => setCamera('unavailable'));
    return () => {
      stopped = true;
      window.clearInterval(timer);
      for (const track of stream?.getTracks() ?? []) track.stop();
    };
  }, []);

  const submit = () => {
    if (!typed.trim()) return;
    setLast(scan.current(typed));
    setTyped('');
  };

  return (
    <ResponsiveDialog opened onClose={onClose} title={t('scan.title')} actions={<Group justify="flex-end"><Button onClick={onClose}>{common('actions.close')}</Button></Group>}>
      <Stack gap="sm">
        {camera !== 'unavailable' && <video ref={video} muted playsInline style={{ width: '100%', maxHeight: 320, background: '#000', borderRadius: 4 }} />}
        {camera === 'unavailable' && <Notice kind="info">{t('scan.noCamera')}</Notice>}
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
