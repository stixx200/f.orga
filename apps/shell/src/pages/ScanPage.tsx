import { Button, Group, Stack, Text, TextInput, UnstyledButton } from '@mantine/core';
import { IconBarcode, IconCamera, IconNfc } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { SearchHit } from '@forga/core-contracts';
import { api, useLocalized, useTranslation, withQuery } from '@forga/web-sdk';
import { cameraScanSupported, CodeCamera, Notice, nfcSupported, PageHeader, Panel, readNfc, signalScan } from '@forga/web-ui';

type Result = { code: string; hits: SearchHit[] };

/**
 * Input mask for barcodes and RFID chips: hand scanners and RFID readers type into the field like a keyboard and end
 * with Enter; on phones the camera or NFC reads the code. A single hit opens the item right away.
 */
export function ScanPage() {
  const { t } = useTranslation('shell');
  const { t: common } = useTranslation('common');
  const localized = useLocalized();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const input = useRef<HTMLInputElement>(null);
  const [typed, setTyped] = useState('');
  const [camera, setCamera] = useState(false);
  const [nfc, setNfc] = useState<AbortController | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => () => nfc?.abort(), [nfc]);

  const lookup = async (raw: string) => {
    const code = raw.trim();
    if (!code) return;
    setBusy(true);
    setFailed(false);
    try {
      const hits = await api<SearchHit[]>(withQuery('core/codes', { code }));
      // Hand scanners, the camera and NFC give no feedback of their own: a beep tells whether the code was known.
      signalScan(hits.length > 0);
      if (hits.length === 1) {
        navigate(hits[0].to);
        return;
      }
      setResult({ code, hits });
      setTyped('');
      input.current?.focus();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  const latest = useRef(lookup);
  useEffect(() => {
    latest.current = lookup;
  });

  // `/scan?code=…` (e.g. written on an NFC tag as a link) looks the code up right away.
  const linked = params.get('code');
  useEffect(() => {
    if (!linked) return;
    setParams({}, { replace: true });
    void latest.current(linked);
  }, [linked, setParams]);

  const readChip = () => {
    if (nfc) {
      nfc.abort();
      setNfc(null);
      return;
    }
    const controller = new AbortController();
    setNfc(controller);
    readNfc(controller.signal)
      .then((id) => lookup(id))
      .catch(() => undefined)
      .finally(() => {
        controller.abort();
        setNfc(null);
      });
  };

  const groups = [...new Set(result?.hits.map((h) => localized(h.group)) ?? [])];

  return (
    <Stack gap="lg" maw={720}>
      <PageHeader breadcrumbs={[{ label: t('nav.overview') }, { label: t('scan.title') }]} title={t('scan.title')} subtitle={t('scan.subtitle')} />
      <Panel>
        <Stack gap="sm">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void lookup(typed);
            }}
          >
            <Group align="end" wrap="nowrap">
              <TextInput
                ref={input}
                size="lg"
                label={t('scan.code')}
                placeholder={t('scan.placeholder')}
                leftSection={<IconBarcode size={22} stroke={1.5} />}
                value={typed}
                onChange={(e) => setTyped(e.currentTarget.value)}
                autoFocus
                autoComplete="off"
                style={{ flex: 1 }}
              />
              <Button type="submit" size="lg" loading={busy}>{common('actions.search')}</Button>
            </Group>
          </form>
          <Group gap="xs">
            {cameraScanSupported() && (
              <Button variant={camera ? 'filled' : 'default'} leftSection={<IconCamera size={18} />} onClick={() => setCamera((c) => !c)}>
                {camera ? common('actions.cancel') : common('codes.camera')}
              </Button>
            )}
            {nfcSupported() && (
              <Button variant={nfc ? 'filled' : 'default'} leftSection={<IconNfc size={18} />} onClick={readChip}>{nfc ? common('codes.nfcWaiting') : common('codes.nfc')}</Button>
            )}
          </Group>
          {camera && (
            <CodeCamera
              onCode={(code) => {
                setCamera(false);
                void latest.current(code);
              }}
            />
          )}
          <Text size="xs" c="dimmed">{t('scan.hint')}</Text>
        </Stack>
      </Panel>
      {failed && <Notice kind="error">{common('errors.generic')}</Notice>}
      {result && result.hits.length === 0 && <Notice kind="warning">{t('scan.notFound', { code: result.code })}</Notice>}
      {result && result.hits.length > 1 && (
        <Panel title={t('scan.several', { code: result.code })}>
          <Stack gap="md">
            {groups.map((group) => (
              <Stack key={group} gap={4}>
                <Text size="xs" fw={700} c="dimmed" tt="uppercase">{group}</Text>
                {result.hits
                  .filter((h) => localized(h.group) === group)
                  .map((h) => (
                    <UnstyledButton key={h.id} component={Link} to={h.to}>
                      <Text size="sm" fw={700}>{h.title}</Text>
                      {h.description && <Text size="xs" c="dimmed">{h.description}</Text>}
                    </UnstyledButton>
                  ))}
              </Stack>
            ))}
          </Stack>
        </Panel>
      )}
    </Stack>
  );
}
