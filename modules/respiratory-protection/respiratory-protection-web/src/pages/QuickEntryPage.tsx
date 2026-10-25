import { Button, Checkbox, Group, NumberInput, Select, Stack, Text, TextInput } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useState } from 'react';
import type { EvidenceKind, FitnessStatus, QuickEntryInput } from '@forga/respiratory-protection-contracts';
import { can, localDate, send, useSession, useTranslation } from '@forga/web-sdk';
import { ActionBar, DataTable, PageHeader, Panel, useAction } from '@forga/web-ui';
import { EVIDENCE, keys, useDepartments, useStatus } from '../api';
import { FitnessBadge } from '../parts';

type Entry = { selected: boolean; kilojoules: number | null; passed: boolean; minutes: number | null };
const QUICK_KINDS: Exclude<EvidenceKind, 'examination'>[] = ['stress-exercise', 'training-track', 'briefing', 'exercise', 'chemical-suit'];

/** Several wearers at once, e.g. after the training track with kJ per person. */
export function QuickEntryPage() {
  const { t } = useTranslation('respiratory-protection');
  const session = useSession().data;
  const { data: departments = [] } = useDepartments();
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [kind, setKind] = useState<(typeof QUICK_KINDS)[number]>('stress-exercise');
  const [date, setDate] = useState<string | null>(() => localDate());
  const [facility, setFacility] = useState('');
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const { data: wearers = [] } = useStatus({ departmentId: departmentId ?? undefined });
  const writable = wearers.filter((w) => w.departmentIds.some((d) => can(session, EVIDENCE, d)));
  const entry = (id: string): Entry => entries[id] ?? { selected: false, kilojoules: null, passed: true, minutes: null };
  const set = (id: string, change: Partial<Entry>) => setEntries((e) => ({ ...e, [id]: { ...entry(id), ...change } }));
  const selected = writable.filter((w) => entry(w.personId).selected);
  const stress = kind === 'stress-exercise';
  // Atemschutzstrecke: work and duration are fixed by the rule, only passing is recorded.
  const track = kind === 'training-track';

  const save = useAction(
    () => {
      const body: QuickEntryInput = {
        kind,
        date: date!,
        facility,
        entries: selected.map((w) => {
          const e = entry(w.personId);
          return { personId: w.personId, kilojoules: stress ? e.kilojoules : null, passed: stress || track ? e.passed : null, minutes: track ? null : e.minutes };
        }),
      };
      return send('POST', 'respiratory-protection/evidence/quick', body);
    },
    { success: t('quick.saved', { count: selected.length }), invalidate: [keys.all], onSuccess: () => setEntries({}) },
  );

  return (
    <Stack gap="lg" pb={80}>
      <PageHeader breadcrumbs={[{ label: t('module') }, { label: t('quick.title') }]} title={t('quick.title')} subtitle={t('quick.subtitle')} />
      <Panel>
        <Group align="end">
          <Select label={t('evidence.kind')} data={QUICK_KINDS.map((k) => ({ value: k, label: t(`kind.${k}`) }))} value={kind} onChange={(v) => v && setKind(v as typeof kind)} allowDeselect={false} />
          <DateInput label={t('evidence.date')} value={date} onChange={setDate} valueFormat="DD.MM.YYYY" required />
          {(stress || track) && <TextInput label={t('evidence.facility')} value={facility} onChange={(e) => setFacility(e.currentTarget.value)} />}
          <Select label={t('overview.department')} placeholder={t('overview.allDepartments')} data={departments.map((d) => ({ value: d.id, label: d.name }))} value={departmentId} onChange={setDepartmentId} clearable />
        </Group>
      </Panel>
      <DataTable<FitnessStatus>
        exportable={false}
        rows={writable}
        rowKey={(w) => w.personId}
        empty={t('overview.empty')}
        columns={[
          { key: 'select', header: '', width: 40, render: (w) => <Checkbox aria-label={`${w.firstName} ${w.lastName}`} checked={entry(w.personId).selected} onChange={(e) => set(w.personId, { selected: e.currentTarget.checked })} /> },
          { key: 'name', header: t('overview.name'), render: (w) => <Text fw={700} size="sm">{w.lastName}, {w.firstName}</Text> },
          { key: 'color', header: t('overview.color'), render: (w) => <FitnessBadge color={w.color} /> },
          ...(stress
            ? [{ key: 'kj', header: t('evidence.kilojoules'), render: (w: FitnessStatus) => <NumberInput size="xs" w={90} min={0} aria-label={t('evidence.kilojoules')} disabled={!entry(w.personId).selected} value={entry(w.personId).kilojoules ?? ''} onChange={(v) => set(w.personId, { kilojoules: v === '' ? null : Number(v) })} /> }]
            : []),
          ...(stress || track
            ? [
                { key: 'passed', header: t('evidence.passed'), render: (w: FitnessStatus) => <Checkbox aria-label={t('evidence.passed')} disabled={!entry(w.personId).selected} checked={entry(w.personId).passed} onChange={(e) => set(w.personId, { passed: e.currentTarget.checked })} /> },
              ]
            : []),
          ...(track ? [] : [{ key: 'minutes', header: t('evidence.minutes'), render: (w: FitnessStatus) => <NumberInput size="xs" w={90} min={0} aria-label={t('evidence.minutes')} disabled={!entry(w.personId).selected} value={entry(w.personId).minutes ?? ''} onChange={(v) => set(w.personId, { minutes: v === '' ? null : Number(v) })} /> }]),
        ]}
      />
      <ActionBar info={t('quick.selected', { count: selected.length })}>
        <Button loading={save.isPending} disabled={!selected.length || !date} onClick={() => save.mutate(undefined)}>{t('quick.save')}</Button>
      </ActionBar>
    </Stack>
  );
}
