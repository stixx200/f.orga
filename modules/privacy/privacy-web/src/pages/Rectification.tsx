import { Anchor, Button, FileInput, Group, Select, Stack, Text, Textarea } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import type { LocalizedText } from '@forga/core-contracts';
import type { Rectification, RectificationView } from '@forga/privacy-contracts';
import { api, extensionsOf, formatDate, formatDateTime, send, upload, useLocalized, useTranslation } from '@forga/web-sdk';
import { Attachments, EmptyState, Notice, notifyError, PageHeader, Panel, ResponsiveDialog, StatusBadge, useAction } from '@forga/web-ui';

const MY_PRIVACY_KEY = ['privacy', 'me'] as const;

/** Areas of "My area": the sections of the modules, the user account and "other". */
function useAreas(): { value: string; label: string }[] {
  const { t } = useTranslation('privacy');
  const localized = useLocalized();
  const sections = extensionsOf('core.me.sections').map((s) => ({ value: s.module, label: localized(s.label) }));
  return [...sections, { value: 'core', label: t('transparency.rectification.account') }, { value: 'other', label: t('transparency.rectification.other') }];
}

/**
 * „Berichtigung beantragen“ (L12): area, what is wrong, how it is right, optional proof (no copy of the driving
 * licence). Creates a request with deadline and a task for the persons responsible for the data of the department.
 */
export function RectificationDialog({ area: initialArea, onClose }: { area?: string; onClose: () => void }) {
  const { t } = useTranslation('privacy');
  const { t: common } = useTranslation('common');
  const areas = useAreas();
  const [area, setArea] = useState(initialArea ?? areas[0]?.value ?? 'other');
  const [wrong, setWrong] = useState('');
  const [correct, setCorrect] = useState('');
  const [proof, setProof] = useState<File | null>(null);
  const ask = useAction(
    async () => {
      const { id } = await send<{ id: string }>('POST', 'privacy/me/rectifications', { area, wrong, correct });
      if (proof) await upload(`core/attachments?type=privacy.request&id=${id}`, proof).catch(notifyError);
    },
    { success: t('transparency.rectification.sent'), invalidate: [MY_PRIVACY_KEY], onSuccess: onClose },
  );
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={t('transparency.rectification.title')}
      actions={
        <>
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button loading={ask.isPending} disabled={!wrong.trim() || !correct.trim()} onClick={() => ask.mutate(undefined)}>{t('transparency.rectification.submit')}</Button>
        </>
      }
    >
      <Text size="sm">{t('transparency.rectification.intro')}</Text>
      <Select label={t('transparency.rectification.area')} allowDeselect={false} data={areas} value={area} onChange={(a) => a && setArea(a)} />
      <Textarea label={t('transparency.rectification.wrong')} required autosize minRows={2} maxLength={2000} value={wrong} onChange={(e) => setWrong(e.currentTarget.value)} />
      <Textarea label={t('transparency.rectification.correct')} required autosize minRows={2} maxLength={2000} value={correct} onChange={(e) => setCorrect(e.currentTarget.value)} />
      <FileInput label={t('transparency.rectification.proof')} description={t('transparency.rectification.proofHint')} accept="application/pdf,image/png,image/jpeg,image/webp" clearable value={proof} onChange={setProof} />
    </ResponsiveDialog>
  );
}

/** „Berichtigung beantragen …“ below a section of "My area", with the section's area chosen. */
export function RectificationButton({ area }: { area?: string }) {
  const { t } = useTranslation('privacy');
  const [open, setOpen] = useState(false);
  return (
    <>
      <Group justify="flex-end" mt={-8}>
        <Button size="xs" variant="subtle" onClick={() => setOpen(true)}>{t('transparency.rectification.ask')}</Button>
      </Group>
      {open && <RectificationDialog area={area} onClose={() => setOpen(false)} />}
    </>
  );
}

/** What is wrong and right, the proof and whether the department corrected it. */
export function RectificationDetails({ requestId, rectification }: { requestId: string; rectification: Rectification }) {
  const { t, i18n } = useTranslation('privacy');
  const localized = useLocalized();
  return (
    <Stack gap={6}>
      <Group gap={6}>
        <Text size="sm" fw={700}>{localized(rectification.areaLabel as LocalizedText)}</Text>
        {rectification.correctedAt ? (
          <StatusBadge tone="done">{t('transparency.rectification.corrected', { date: formatDate(rectification.correctedAt, i18n.language), name: rectification.correctedByName ?? '–' })}</StatusBadge>
        ) : (
          <StatusBadge tone="warning">{t('transparency.rectification.notCorrected')}</StatusBadge>
        )}
      </Group>
      <Text size="sm">
        <strong>{t('transparency.rectification.wrongLabel')}:</strong> {rectification.wrong}
      </Text>
      <Text size="sm">
        <strong>{t('transparency.rectification.correctLabel')}:</strong> {rectification.correct}
      </Text>
      <Text size="sm" fw={700} mt="xs">{t('transparency.rectification.proofs')}</Text>
      <Attachments type="privacy.request" id={requestId} />
    </Stack>
  );
}

/** Panel on the page of a request of kind rectification. */
export function RectificationPanel({ requestId, rectification }: { requestId: string; rectification: Rectification }) {
  const { t } = useTranslation('privacy');
  return (
    <Panel title={t('transparency.rectification.details')}>
      <Stack gap="sm">
        <RectificationDetails requestId={requestId} rectification={rectification} />
        <Text size="xs" c="dimmed">{t('transparency.rectification.recipientsHint')}</Text>
      </Stack>
    </Panel>
  );
}

/** `/privacy/rectifications/:id`: the task of the persons responsible for the person's data. */
export function RectificationPage() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation('privacy');
  const key = ['privacy', 'rectification', id] as const;
  const { data, error } = useQuery({ queryKey: key, queryFn: () => api<RectificationView>(`privacy/rectifications/${id}`) });
  const corrected = useAction(() => send('POST', `privacy/rectifications/${id}/corrected`), { success: t('transparency.rectification.markedCorrected'), invalidate: [key, ['core', 'tasks']] });
  if (error) return <EmptyState title={t('notFound')} />;
  if (!data) return null;
  return (
    <Stack gap="lg" maw={880}>
      <PageHeader breadcrumbs={[{ label: t('nav.overview') }, { label: t('transparency.rectification.pageTitle') }]} title={t('transparency.rectification.pageTitle')} subtitle={data.personName ?? undefined} />
      <Text size="sm">{t('transparency.rectification.pageIntro')}</Text>
      <Panel title={t('transparency.rectification.details')}>
        <Stack gap="sm">
          <Text size="sm">
            <strong>{t('transparency.rectification.person')}:</strong>{' '}
            <Anchor component={Link} to={`/masterdata/persons/${data.personId}`}>{data.personName ?? '–'}</Anchor>
            {' · '}
            <strong>{t('transparency.rectification.received')}:</strong> {formatDate(data.receivedOn, i18n.language)}
            {' · '}
            <strong>{t('transparency.rectification.deadline')}:</strong> {formatDate(data.deadline, i18n.language)}
          </Text>
          <RectificationDetails requestId={data.id} rectification={data.rectification} />
          {data.rectification.correctedAt ? (
            <Notice kind="info">{t('transparency.rectification.correctedHint')} {formatDateTime(data.rectification.correctedAt, i18n.language)}</Notice>
          ) : (
            <Group justify="flex-end">
              <Button loading={corrected.isPending} onClick={() => corrected.mutate(undefined)}>{t('transparency.rectification.markCorrected')}</Button>
            </Group>
          )}
        </Stack>
      </Panel>
    </Stack>
  );
}
