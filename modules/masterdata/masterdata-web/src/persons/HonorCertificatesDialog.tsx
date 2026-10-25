import { Button, Group, Select, Stack, Textarea, TextInput } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { CertificateSettings } from '@forga/masterdata-contracts';
import { api, apiUrl, can, send, useLocalized, useSession, translateCode, useTranslation, withQuery } from '@forga/web-sdk';
import { Notice, ResponsiveDialog, useAction } from '@forga/web-ui';
import { useCatalog } from '../api';

const SETTINGS_KEY = ['core', 'settings', 'masterdata.certificates'] as const;

function Texts({ value }: { value: CertificateSettings }) {
  const { t } = useTranslation('masterdata');
  const [form, setForm] = useState(value);
  const save = useAction(() => send('PUT', 'core/settings/masterdata.certificates', form), { success: t('certificates.saved'), invalidate: [SETTINGS_KEY] });
  return (
    <Stack gap="xs">
      <Textarea label={t('certificates.text')} description={t('certificates.textHint')} value={form.honorText} onChange={(e) => setForm({ ...form, honorText: e.currentTarget.value })} autosize minRows={2} />
      <Group grow>
        <TextInput label={t('certificates.place')} value={form.place} onChange={(e) => setForm({ ...form, place: e.currentTarget.value })} />
        <TextInput label={t('certificates.signer')} value={form.signer} onChange={(e) => setForm({ ...form, signer: e.currentTarget.value })} />
      </Group>
      <Group justify="flex-end"><Button size="xs" variant="default" loading={save.isPending} onClick={() => save.mutate(undefined)}>{t('certificates.saveTexts')}</Button></Group>
    </Stack>
  );
}

/** Honor certificates of a period as serial PDF; administrators also edit the texts. */
export function HonorCertificatesDialog({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation('masterdata');
  const { t: common } = useTranslation('common');
  const localized = useLocalized();
  const session = useSession().data;
  const { data: honors = [] } = useCatalog('honor');
  const [year] = useState(() => new Date().getFullYear());
  const [from, setFrom] = useState<string | null>(`${year}-01-01`);
  const [to, setTo] = useState<string | null>(`${year}-12-31`);
  const [honor, setHonor] = useState<string | null>(null);
  const admin = can(session, 'core.settings.manage');
  // Counted beforehand, so an empty period shows a message instead of opening an error in a new tab.
  const query = { from: from ?? undefined, to: to ?? undefined, honor: honor ?? undefined };
  const { data: count } = useQuery({
    queryKey: ['masterdata', 'honor-certificates', query],
    queryFn: () => api<{ count: number }>(withQuery('masterdata/persons/honors/certificates', query)).then((r) => r.count),
    enabled: Boolean(from && to),
  });
  const { data: settings } = useQuery({ queryKey: SETTINGS_KEY, queryFn: () => api<CertificateSettings | null>('core/settings/masterdata.certificates'), enabled: admin });
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={t('certificates.title')}
      actions={
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{common('actions.close')}</Button>
          <Button component="a" href={apiUrl('masterdata/persons/honors/certificates.pdf', { from: from ?? undefined, to: to ?? undefined, honor: honor ?? undefined, lang: i18n.language })} target="_blank" disabled={!from || !to || !count}>{t('certificates.print', { count: count ?? 0 })}</Button>
        </Group>
      }
    >
      <Group grow>
        <DateInput label={t('certificates.from')} value={from} onChange={setFrom} valueFormat="DD.MM.YYYY" />
        <DateInput label={t('certificates.to')} value={to} onChange={setTo} valueFormat="DD.MM.YYYY" />
      </Group>
      {count === 0 && <Notice kind="info">{translateCode('masterdata.noHonors')}</Notice>}
      <Select label={t('entries.honor.name')} placeholder={t('certificates.allHonors')} data={honors.map((h) => ({ value: h.key, label: localized(h.name) }))} value={honor} onChange={setHonor} clearable />
      {admin && settings !== undefined && <Texts value={CertificateSettings.parse(settings ?? {})} />}
    </ResponsiveDialog>
  );
}
