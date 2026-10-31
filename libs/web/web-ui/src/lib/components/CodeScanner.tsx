import { ActionIcon, Modal, TextInput, type TextInputProps, Tooltip } from '@mantine/core';
import { IconCamera, IconNfc } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '@forga/web-sdk';
import { Notice } from './Notice';

/**
 * Barcode detection of the browser (Chrome, Edge, Android). Browsers without it (Safari on iOS, Firefox) use the
 * JavaScript decoder of ZXing, loaded only when the camera is opened.
 */
interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
type DetectorClass = new (options: { formats: string[] }) => Detector;
const barcodeDetector = () => (window as unknown as { BarcodeDetector?: DetectorClass }).BarcodeDetector;

/** Labels of f.orga (QR) and the usual barcodes on equipment and clothing. */
export const CODE_FORMATS = ['qr_code', 'code_128', 'code_39', 'code_93', 'ean_13', 'ean_8', 'upc_a', 'data_matrix', 'itf'];

/** The camera can scan wherever the browser grants access to it (secure context); the decoder is built in or loaded. */
export function cameraScanSupported(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
}

/** Decodes the video with the ZXing fallback; returns a function that stops it. */
async function zxingDecode(video: HTMLVideoElement, onValue: (value: string) => void): Promise<() => void> {
  const { BarcodeFormat, BrowserMultiFormatReader } = await import('@zxing/browser');
  const { DecodeHintType } = await import('@zxing/library');
  const formats = [BarcodeFormat.QR_CODE, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.CODE_93, BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.DATA_MATRIX, BarcodeFormat.ITF];
  const reader = new BrowserMultiFormatReader(new Map([[DecodeHintType.POSSIBLE_FORMATS, formats]]), { delayBetweenScanAttempts: 300 });
  const controls = await reader.decodeFromVideoElement(video, (result) => {
    if (result) onValue(result.getText());
  });
  return () => controls.stop();
}

/** Feedback when a code was read: a short vibration (where supported) and a beep. */
export function signalScan(ok = true): void {
  try {
    navigator.vibrate?.(ok ? 80 : [60, 60, 60]);
  } catch {
    // Vibration is optional.
  }
  try {
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;
    const audio = new Context();
    const tone = audio.createOscillator();
    const volume = audio.createGain();
    tone.frequency.value = ok ? 1200 : 400;
    volume.gain.value = 0.08;
    tone.connect(volume).connect(audio.destination);
    tone.start();
    tone.stop(audio.currentTime + (ok ? 0.08 : 0.2));
    tone.addEventListener('ended', () => void audio.close(), { once: true });
  } catch {
    // Sound is optional.
  }
}

/** Web NFC (Chrome on Android) reads the ID of RFID/NFC chips at 13.56 MHz. */
interface NfcReader {
  scan(options: { signal: AbortSignal }): Promise<void>;
  addEventListener(type: 'reading', listener: (event: { serialNumber: string }) => void, options: { signal: AbortSignal }): void;
}
const nfcReader = () => (window as unknown as { NDEFReader?: new () => NfcReader }).NDEFReader;

export function nfcSupported(): boolean {
  return Boolean(nfcReader());
}

/** Waits for the next chip held to the phone and returns its ID; ends when `signal` aborts. */
export async function readNfc(signal: AbortSignal): Promise<string> {
  const Reader = nfcReader();
  if (!Reader) throw new Error('nfc unsupported');
  const reader = new Reader();
  await reader.scan({ signal });
  return new Promise((resolve) => reader.addEventListener('reading', (event) => resolve(event.serialNumber), { signal }));
}

/**
 * Camera image that reports each code seen. The same code stays in front of the camera for a while: it is reported
 * once until another one is seen.
 */
export function CodeCamera({ onCode, height = 320 }: { onCode: (code: string) => void; height?: number }) {
  const { t } = useTranslation('common');
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<'starting' | 'on' | 'unavailable'>(() => (cameraScanSupported() ? 'starting' : 'unavailable'));
  const report = useRef(onCode);
  useEffect(() => {
    report.current = onCode;
  });

  useEffect(() => {
    if (!cameraScanSupported()) return;
    const Barcode = barcodeDetector();
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let stopFallback: (() => void) | null = null;
    let stopped = false;
    let previous = '';
    const seen = (value: string | undefined) => {
      if (value && value !== previous) {
        previous = value;
        report.current(value);
      }
    };
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then(async (s) => {
        if (stopped) {
          for (const track of s.getTracks()) track.stop();
          return;
        }
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play();
        }
        setState('on');
        if (!Barcode) {
          // Without the detector of the browser: ZXing reads the same video.
          if (!video.current) return;
          const stop = await zxingDecode(video.current, seen);
          if (stopped) stop();
          else stopFallback = stop;
          return;
        }
        const detector = new Barcode({ formats: CODE_FORMATS });
        timer = window.setInterval(() => {
          if (!video.current || video.current.readyState < 2) return;
          detector
            .detect(video.current)
            .then((codes) => seen(codes[0]?.rawValue))
            .catch(() => undefined);
        }, 400);
      })
      .catch(() => setState('unavailable'));
    return () => {
      stopped = true;
      window.clearInterval(timer);
      stopFallback?.();
      for (const track of stream?.getTracks() ?? []) track.stop();
    };
  }, []);

  if (state === 'unavailable') return <Notice kind="info">{t('codes.noCamera')}</Notice>;
  return <video ref={video} muted playsInline style={{ width: '100%', maxHeight: height, background: '#000', borderRadius: 4 }} />;
}

/**
 * Field for a barcode or RFID chip. Hand scanners and RFID readers type into it like a keyboard; on phones the
 * camera (barcodes) or NFC (chips) fill it.
 */
export function CodeInput({ value, onChange, source, repeat = false, ...props }: Omit<TextInputProps, 'value' | 'onChange'> & { value: string; onChange: (value: string) => void; source: 'camera' | 'nfc'; repeat?: boolean }) {
  const { t } = useTranslation('common');
  const [camera, setCamera] = useState(false);
  const [reading, setReading] = useState<AbortController | null>(null);
  useEffect(() => () => reading?.abort(), [reading]);

  const read = () => {
    if (reading) {
      reading.abort();
      setReading(null);
      return;
    }
    const controller = new AbortController();
    setReading(controller);
    readNfc(controller.signal)
      .then((id) => {
        signalScan();
        onChange(id);
      })
      .catch(() => undefined)
      .finally(() => {
        controller.abort();
        setReading(null);
      });
  };

  const button =
    source === 'camera' && cameraScanSupported() ? (
      <Tooltip label={t('codes.camera')}>
        <ActionIcon variant="subtle" onClick={() => setCamera(true)} aria-label={t('codes.camera')}>
          <IconCamera size={18} />
        </ActionIcon>
      </Tooltip>
    ) : source === 'nfc' && nfcSupported() ? (
      <Tooltip label={reading ? t('codes.nfcWaiting') : t('codes.nfc')}>
        <ActionIcon variant={reading ? 'filled' : 'subtle'} onClick={read} aria-label={t('codes.nfc')}>
          <IconNfc size={18} />
        </ActionIcon>
      </Tooltip>
    ) : null;

  return (
    <>
      <TextInput {...props} value={value} onChange={(e) => onChange(e.currentTarget.value)} rightSection={button} />
      {camera && (
        <Modal opened onClose={() => setCamera(false)} title={t('codes.camera')} size="lg">
          <CodeCamera
            onCode={(code) => {
              signalScan();
              onChange(code);
              if (!repeat) setCamera(false);
            }}
          />
        </Modal>
      )}
    </>
  );
}
