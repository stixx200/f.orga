import { ActionIcon, Anchor, Button, Group, SimpleGrid, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { IconDownload, IconTrash } from '@tabler/icons-react';
import { type ReactNode, useState } from 'react';
import type { MeasureTone, ProcessingRegister, RegisterActivity, RegisterRecipient } from '@forga/core-contracts';
import { apiUrl, formatDate, formatDateTime, openAfterStepUp, send, useLocalized, useTranslation } from '@forga/web-sdk';
import { ConfirmDialog, DataTable, Notice, Panel, StatusBadge, type Tone, useAction } from '@forga/web-ui';
import { privacyKeys, useRegister } from './api';

const TONES: Record<MeasureTone, Tone> = { ok: 'done', warning: 'warning', info: 'neutral' };

/** A label with its value, as in the data lists of the mockups. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Group gap="md" wrap="nowrap" align="flex-start">
      <Text size="sm" c="dimmed" w={180} style={{ flexShrink: 0 }}>{label}</Text>
      <Text size="sm" component="div">{children}</Text>
    </Group>
  );
}

/**
 * "Verwaltung → Datenschutz → Verzeichnis" (mockup `datenschutz/verzeichnis.html`): the draft of the register of
 * processing activities, the municipality's part per activity, recipients for all activities, technical measures and
 * the exports.
 */
export function RegisterTab() {
  const { t, i18n } = useTranslation('shell');
  const { data: register } = useRegister();
  const [selected, setSelected] = useState<string | null>(null);
  if (!register) return null;
  const current = register.activities.find((a) => a.key === selected) ?? register.activities[0];
  const download = (format: 'pdf' | 'xlsx', scope?: 'dpia') => void openAfterStepUp(apiUrl(`core/privacy/register/export/${format}`, { language: i18n.language === 'en' ? 'en' : 'de', scope }));
  const health = register.activities.some((a) => a.health);
  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <Notice kind="info">{t('register.draftNotice')}</Notice>
        <Group gap="xs">
          <Button variant="default" leftSection={<IconDownload size={16} />} onClick={() => download('xlsx')}>{t('register.excel')}</Button>
          <Button leftSection={<IconDownload size={16} />} onClick={() => download('pdf')}>{t('register.pdf')}</Button>
        </Group>
      </Group>
      {health && (
        <Notice kind="warning" action={<Button size="xs" variant="outline" leftSection={<IconDownload size={14} />} onClick={() => download('pdf', 'dpia')}>{t('hardening.register.dpiaExport')}</Button>}>
          {t('hardening.register.dpiaNotice')}
        </Notice>
      )}
      <ActivitiesTable register={register} selected={current?.key ?? null} onSelect={setSelected} />
      {current && <ActivityCard key={`${current.key}:${current.record.version}:${current.record.reviewedAt ?? ''}`} activity={current} />}
      <GeneralRecipients key={JSON.stringify(register.general)} initial={register.general} />
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Panel title={t('register.processors')}>
          <Stack gap="xs">
            {register.processors.length ? register.processors.map((p) => <ProcessorLine key={p.id} name={p.name} />) : <Text size="sm">{t('register.processorsNone')}</Text>}
            <Text size="xs" c="dimmed">{t('register.processorsHint')}</Text>
          </Stack>
        </Panel>
        <MeasuresPanel register={register} />
      </SimpleGrid>
    </Stack>
  );
}

function ProcessorLine({ name }: { name: { de: string; en: string } }) {
  const localized = useLocalized();
  return <Text size="sm">{localized(name)}</Text>;
}

function Reviewed({ activity }: { activity: RegisterActivity }) {
  const { t, i18n } = useTranslation('shell');
  const { reviewedAt, reviewedBy } = activity.record;
  return reviewedAt ? (
    <StatusBadge tone="done">{t('register.reviewedValue', { date: formatDate(reviewedAt, i18n.language), name: reviewedBy ?? '–' })}</StatusBadge>
  ) : (
    <StatusBadge tone="warning">{t('register.draft')}</StatusBadge>
  );
}

function ActivitiesTable({ register, selected, onSelect }: { register: ProcessingRegister; selected: string | null; onSelect: (key: string) => void }) {
  const { t } = useTranslation('shell');
  const localized = useLocalized();
  return (
    <DataTable
      rows={register.activities}
      rowKey={(a) => a.key}
      selectedKey={selected}
      onRowClick={(a) => onSelect(a.key)}
      exportable={false}
      columns={[
        {
          key: 'activity',
          header: t('register.columns.activity'),
          render: (a) => (
            <Anchor component="button" type="button" onClick={() => onSelect(a.key)}>
              {localized(a.name)}
            </Anchor>
          ),
        },
        { key: 'module', header: t('register.columns.module'), render: (a) => localized(a.module.name) },
        { key: 'subjects', header: t('register.columns.subjects'), render: (a) => a.subjects.map(localized).join(', ') || '–' },
        { key: 'special', header: t('register.columns.special'), render: (a) => (a.health ? <StatusBadge tone="warning">{a.healthNote ? localized(a.healthNote) : t('register.health')}</StatusBadge> : '–') },
        { key: 'retention', header: t('register.columns.retention'), render: (a) => localized(a.retention) },
        { key: 'reviewed', header: t('register.columns.reviewed'), render: (a) => <Reviewed activity={a} /> },
      ]}
    />
  );
}

/** One activity: what f.orga knows about it, and the municipality's part (legal basis, recipients, remarks, review). */
function ActivityCard({ activity }: { activity: RegisterActivity }) {
  const { t, i18n } = useTranslation('shell');
  const { t: common } = useTranslation('common');
  const localized = useLocalized();
  const record = activity.record;
  const [value, setValue] = useState({ legalBasis: record.legalBasis, recipients: record.recipients, thirdCountry: record.thirdCountry, remarks: record.remarks });
  const [reviewing, setReviewing] = useState(false);
  const path = `core/privacy/register/activities/${encodeURIComponent(activity.key)}`;
  const save = useAction(() => send('PUT', path, { ...value, recipients: value.recipients.filter((r) => r.name.trim()), version: record.version }), { success: t('register.saved'), invalidate: [privacyKeys.register] });
  const review = useAction(() => send('POST', `${path}/review`, { version: record.version }), { success: t('register.saved'), invalidate: [privacyKeys.register], onSuccess: () => setReviewing(false) });
  const fromRegister = activity.recipients.filter((r) => r.source !== 'municipality');
  return (
    <Panel title={localized(activity.name)} aside={<Reviewed activity={activity} />}>
      <Stack gap="md">
        <Stack gap={6}>
          <Field label={t('register.fields.purpose')}>{localized(activity.purpose)}</Field>
          <Field label={t('register.fields.subjects')}>{activity.subjects.map(localized).join('; ') || '–'}</Field>
          <Field label={t('register.fields.categories')}>{activity.categories.map(localized).join('; ') || '–'}</Field>
          <Field label={t('register.fields.special')}>{activity.health ? <StatusBadge tone="warning">{activity.healthNote ? localized(activity.healthNote) : t('register.health')}</StatusBadge> : '–'}</Field>
          {activity.health && <Field label={t('hardening.register.dpia')}>{t('hardening.register.dpiaHint')}</Field>}
          <Field label={t('register.fields.recipients')}>
            {fromRegister.length ? fromRegister.map((r) => `${localized(r.name)} (${t(`register.sources.${r.source}`)})`).join('; ') : '–'}
          </Field>
          <Field label={t('register.fields.retention')}>{localized(activity.retention)}</Field>
          {activity.legalBasisHint && <Field label={t('register.fields.legalBasisHint')}>{localized(activity.legalBasisHint)}</Field>}
        </Stack>
        <SimpleGrid cols={{ base: 1, md: 2 }}>
          <Textarea label={t('register.legalBasis')} placeholder={t('register.legalBasisPlaceholder')} autosize minRows={2} value={value.legalBasis} onChange={(e) => setValue({ ...value, legalBasis: e.currentTarget.value })} />
          <Textarea label={t('register.thirdCountry')} placeholder={t('register.thirdCountryPlaceholder')} autosize minRows={2} value={value.thirdCountry} onChange={(e) => setValue({ ...value, thirdCountry: e.currentTarget.value })} />
        </SimpleGrid>
        <RecipientsEditor label={t('register.furtherRecipients')} hint={t('register.furtherRecipientsHint')} recipients={value.recipients} onChange={(recipients) => setValue({ ...value, recipients })} />
        <Textarea label={t('register.remarks')} autosize minRows={2} value={value.remarks} onChange={(e) => setValue({ ...value, remarks: e.currentTarget.value })} />
        <Group justify="space-between" wrap="wrap">
          <Text size="xs" c="dimmed">{record.changedAt ? t('register.changed', { date: formatDateTime(record.changedAt, i18n.language), name: record.changedBy ?? '–' }) : ''}</Text>
          <Group gap="xs">
            <Button variant="default" disabled={Boolean(record.reviewedAt)} onClick={() => setReviewing(true)}>{t('register.markReviewed')}</Button>
            <Button loading={save.isPending} onClick={() => save.mutate(undefined)}>{common('actions.save')}</Button>
          </Group>
        </Group>
      </Stack>
      <ConfirmDialog
        opened={reviewing}
        onClose={() => setReviewing(false)}
        title={t('register.reviewTitle')}
        description={t('register.reviewText', { name: localized(activity.name) })}
        confirmLabel={t('register.confirmReviewed')}
        loading={review.isPending}
        onConfirm={() => review.mutate(undefined)}
      />
    </Panel>
  );
}

/** A list of recipients with name and note, e.g. the further recipients of an activity. */
export function RecipientsEditor({ label, hint, recipients, onChange }: { label: string; hint: string; recipients: RegisterRecipient[]; onChange: (recipients: RegisterRecipient[]) => void }) {
  const { t } = useTranslation('shell');
  const change = (index: number, field: 'name' | 'note', v: string) => onChange(recipients.map((r, i) => (i === index ? { ...r, [field]: v } : r)));
  return (
    <Stack gap="xs">
      {label && <Text size="sm" fw={500}>{label}</Text>}
      {recipients.map((r, index) => (
        <Group key={r.id} align="flex-end" wrap="nowrap">
          <TextInput flex={1} label={t('register.recipientName')} value={r.name} onChange={(e) => change(index, 'name', e.currentTarget.value)} />
          <TextInput flex={2} label={t('register.recipientNote')} value={r.note} onChange={(e) => change(index, 'note', e.currentTarget.value)} />
          <ActionIcon variant="subtle" size="lg" aria-label={t('register.remove')} onClick={() => onChange(recipients.filter((_, i) => i !== index))}>
            <IconTrash size={18} />
          </ActionIcon>
        </Group>
      ))}
      <Group>
        <Button variant="default" size="xs" onClick={() => onChange([...recipients, { id: crypto.randomUUID(), name: '', note: '' }])}>{t('register.addRecipient')}</Button>
      </Group>
      <Text size="xs" c="dimmed">{hint}</Text>
    </Stack>
  );
}

/** Recipients for all activities (formerly the list „Empfänger (Art. 19)“ of the settings). */
function GeneralRecipients({ initial }: { initial: RegisterRecipient[] }) {
  const { t } = useTranslation('shell');
  const { t: common } = useTranslation('common');
  const [recipients, setRecipients] = useState(initial);
  const save = useAction(() => send('PUT', 'core/privacy/register/recipients', { recipients: recipients.filter((r) => r.name.trim()) }), { success: t('register.saved'), invalidate: [privacyKeys.register] });
  return (
    <Panel title={t('register.general')}>
      <Stack gap="sm">
        <RecipientsEditor label="" hint={t('register.generalHint')} recipients={recipients} onChange={setRecipients} />
        <Group justify="flex-end">
          <Button loading={save.isPending} onClick={() => save.mutate(undefined)}>{common('actions.save')}</Button>
        </Group>
      </Stack>
    </Panel>
  );
}

function MeasuresPanel({ register }: { register: ProcessingRegister }) {
  const { t } = useTranslation('shell');
  const localized = useLocalized();
  return (
    <Panel title={t('register.measures')}>
      <Stack gap="xs">
        <DataTable
          rows={register.measures}
          rowKey={(m) => m.key}
          exportable={false}
          columns={[
            { key: 'measure', header: t('register.measureColumns.measure'), render: (m) => localized(m.title) },
            {
              key: 'state',
              header: t('register.measureColumns.state'),
              render: (m) => (
                <Group gap={6} wrap="nowrap" align="flex-start">
                  {m.tone !== 'info' && <StatusBadge tone={TONES[m.tone]}>{t(`register.tones.${m.tone}`)}</StatusBadge>}
                  <Text size="sm">{localized(m.value)}</Text>
                </Group>
              ),
            },
          ]}
        />
        <Text size="xs" c="dimmed">{t('register.measuresHint')}</Text>
      </Stack>
    </Panel>
  );
}
