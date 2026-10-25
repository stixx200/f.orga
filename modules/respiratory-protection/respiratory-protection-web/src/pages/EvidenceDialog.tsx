import { Button, Checkbox, Group, NumberInput, Select, SimpleGrid, Text, TextInput } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useState } from 'react';
import type { BreathingDevice, Evidence, EvidenceInput, EvidenceKind, ExaminationGroup, ExaminationResult } from '@forga/respiratory-protection-contracts';
import { localDate, send, useTranslation } from '@forga/web-sdk';
import { Notice, ResponsiveDialog, useAction } from '@forga/web-ui';
import { keys } from '../api';

export const KINDS: EvidenceKind[] = ['examination', 'stress-exercise', 'training-track', 'briefing', 'exercise', 'incident', 'chemical-suit'];

const RESULTS: ExaminationResult[] = ['no-concerns', 'no-concerns-limited', 'no-concerns-conditional', 'concerns'];

/** The day after an ISO date. */
const dayAfter = (date: string) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/**
 * Records or corrects one piece of evidence of a person. Examinations need a result; a stress exercise below the
 * minimum work (`minimumKilojoules`, by age) cannot be marked as passed.
 */
export function EvidenceDialog({ personId, evidence, kinds, minimumKilojoules, onClose }: { personId: string; evidence?: Evidence; kinds: EvidenceKind[]; minimumKilojoules: number; onClose: () => void }) {
  const { t } = useTranslation('respiratory-protection');
  const { t: common } = useTranslation('common');
  const [form, setForm] = useState<Required<EvidenceInput>>(() => ({
    personId,
    kind: evidence?.kind ?? kinds[0],
    date: evidence?.date ?? localDate(),
    validUntil: evidence?.validUntil ?? null,
    result: evidence?.result ?? null,
    examiner: evidence?.examiner ?? '',
    restrictions: evidence?.restrictions ?? '',
    examinationGroup: evidence?.examinationGroup ?? null,
    device: evidence?.device ?? null,
    facility: evidence?.facility ?? '',
    kilojoules: evidence?.kilojoules ?? null,
    // No default: passing is ticked explicitly.
    passed: evidence?.passed ?? (evidence ? null : false),
    minutes: evidence?.minutes ?? null,
    note: evidence?.note ?? '',
  }));
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));
  const below = form.kind === 'stress-exercise' && form.kilojoules !== null && form.kilojoules < minimumKilojoules;
  const body = { ...form, passed: below ? false : form.passed };
  // A stress exercise without kJ counts only with a reason in the note (e.g. "ohne Messung: Anlage defekt").
  const unmeasured = form.kind === 'stress-exercise' && form.passed !== false && form.kilojoules === null && !form.note.trim();
  const save = useAction(() => (evidence ? send('PUT', `respiratory-protection/evidence/${evidence.id}`, body) : send('POST', 'respiratory-protection/evidence', body)), {
    success: t('evidence.saved'),
    invalidate: [keys.all],
    onSuccess: onClose,
  });
  const examination = form.kind === 'examination';
  const stress = form.kind === 'stress-exercise';
  // Atemschutzstrecke: work and duration come from the rule, only passing is recorded.
  const track = form.kind === 'training-track';
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={evidence ? t('evidence.edit') : t('evidence.add')}
      size="lg"
      actions={
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button loading={save.isPending} disabled={!form.date || unmeasured || (examination && (!form.result || (form.result === 'no-concerns-limited' && !form.validUntil)))} onClick={() => save.mutate(undefined)}>{common('actions.save')}</Button>
        </Group>
      }
    >
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <Select label={t('evidence.kind')} data={kinds.map((k) => ({ value: k, label: t(`kind.${k}`) }))} value={form.kind} onChange={(v) => v && set('kind', v as EvidenceKind)} allowDeselect={false} disabled={Boolean(evidence)} />
        <DateInput label={t('evidence.date')} value={form.date} onChange={(v) => v && set('date', v)} valueFormat="DD.MM.YYYY" maxDate={localDate()} required />
        {examination && (
          <>
            <Select label={t('evidence.result')} data={RESULTS.map((r) => ({ value: r, label: t(`result.${r}`) }))} value={form.result} onChange={(v) => set('result', v as ExaminationResult | null)} required allowDeselect={false} />
            <DateInput label={t('evidence.validUntil')} description={t('evidence.validUntilHint')} value={form.validUntil} onChange={(v) => set('validUntil', v)} valueFormat="DD.MM.YYYY" minDate={dayAfter(form.date)} required={form.result === 'no-concerns-limited'} clearable />
            <TextInput label={t('evidence.examiner')} value={form.examiner} onChange={(e) => set('examiner', e.currentTarget.value)} />
            <TextInput label={t('evidence.restrictions')} description={t('evidence.restrictionsHint')} value={form.restrictions} onChange={(e) => set('restrictions', e.currentTarget.value)} />
            <Select
              label={t('evidence.examinationGroup')}
              description={t('evidence.examinationGroupHint')}
              data={(['over-5kg', 'up-to-5kg'] as const).map((g) => ({ value: g, label: t(`examinationGroup.${g}`) }))}
              value={form.examinationGroup}
              onChange={(v) => set('examinationGroup', v as ExaminationGroup | null)}
              clearable
            />
          </>
        )}
        {!examination && form.kind !== 'briefing' && (
          <Select label={t('evidence.device')} data={(['compressed-air', 'rebreather', 'filter'] as const).map((d) => ({ value: d, label: t(`device.${d}`) }))} value={form.device} onChange={(v) => set('device', v as BreathingDevice | null)} clearable />
        )}
        {stress && (
          <>
            <TextInput label={t('evidence.facility')} value={form.facility} onChange={(e) => set('facility', e.currentTarget.value)} />
            <NumberInput label={t('evidence.kilojoules')} description={t('evidence.minimum', { kilojoules: minimumKilojoules })} value={form.kilojoules ?? ''} onChange={(v) => set('kilojoules', v === '' ? null : Number(v))} min={0} error={below ? t('evidence.belowMinimum', { kilojoules: minimumKilojoules }) : unmeasured ? t('evidence.kilojoulesRequired') : undefined} />
            <Checkbox label={t('evidence.passed')} checked={below ? false : (form.passed ?? false)} disabled={below} onChange={(e) => set('passed', e.currentTarget.checked)} mt="xl" />
          </>
        )}
        {track && (
          <>
            <TextInput label={t('evidence.facility')} value={form.facility} onChange={(e) => set('facility', e.currentTarget.value)} />
            <Checkbox label={t('evidence.passed')} description={t('evidence.trackHint')} checked={form.passed ?? false} onChange={(e) => set('passed', e.currentTarget.checked)} mt="xl" />
          </>
        )}
        {!examination && !track && <NumberInput label={t('evidence.minutes')} value={form.minutes ?? ''} onChange={(v) => set('minutes', v === '' ? null : Number(v))} min={0} />}
        <TextInput label={t('evidence.note')} value={form.note} onChange={(e) => set('note', e.currentTarget.value)} />
      </SimpleGrid>
      {examination && form.result === 'concerns' && <Notice kind="warning"><Text size="sm" span>{t('evidence.resultConcerns')}</Text></Notice>}
    </ResponsiveDialog>
  );
}
