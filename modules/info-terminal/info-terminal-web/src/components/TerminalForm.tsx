import { Button, Checkbox, Group, Select, Stack, Text, TextInput } from '@mantine/core';
import { useState } from 'react';
import type { Language } from '@forga/core-contracts';
import type { Terminal, TerminalInput } from '@forga/info-terminal-contracts';
import type { Department, Station } from '@forga/masterdata-contracts';
import { can, useSession, useTranslation } from '@forga/web-sdk';
import { MANAGE } from '../api';

export type TerminalDraft = Required<Omit<TerminalInput, 'stationId'>> & { stationId: string | null };

export const emptyDraft = (): TerminalDraft => ({ stationId: null, name: '', departmentIds: [], allowNewIncident: true, allowTraining: true, language: 'de' });

export const draftOf = (terminal: Terminal): TerminalDraft => ({
  stationId: terminal.stationId,
  name: terminal.name,
  departmentIds: terminal.departmentIds.slice(1),
  allowNewIncident: terminal.allowNewIncident,
  allowTraining: terminal.allowTraining,
  language: terminal.language,
});

/**
 * Station, device name, departments (the station's department fixed, its sub-departments such as youth and veterans
 * offered first, any other department the user manages through "Weitere Abteilung"), allowed actions and language.
 */
export function TerminalForm({
  draft,
  onChange,
  stations,
  departments,
  stationFixed,
  training,
  submitLabel,
  loading,
  onSubmit,
}: {
  draft: TerminalDraft;
  onChange: (draft: TerminalDraft) => void;
  stations: Station[];
  departments: Department[];
  stationFixed: boolean;
  training: boolean;
  submitLabel: string;
  loading: boolean;
  onSubmit: () => void;
}) {
  const { t } = useTranslation('info-terminal');
  const session = useSession().data;
  const [another, setAnother] = useState<string | null>(null);
  const station = stations.find((s) => s.id === draft.stationId);
  const stationDepartment = departments.find((d) => d.id === station?.departmentId);
  const manageable = (d: Department) => can(session, MANAGE, d.id);
  const children = departments.filter((d) => d.parentId === station?.departmentId && d.id !== station?.departmentId);
  const others = departments.filter((d) => d.id !== station?.departmentId && !children.includes(d) && manageable(d));
  const shown = [...children, ...others.filter((d) => draft.departmentIds.includes(d.id))];
  const toggle = (id: string, on: boolean) => onChange({ ...draft, departmentIds: on ? [...draft.departmentIds, id] : draft.departmentIds.filter((x) => x !== id) });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <Stack gap="md">
        <Group grow align="start">
          <Select
            label={t('form.station')}
            required
            disabled={stationFixed}
            data={stations
              .filter((s) => stationFixed || can(session, MANAGE, s.departmentId))
              .map((s) => ({ value: s.id, label: `${s.name} (${departments.find((d) => d.id === s.departmentId)?.shortName ?? ''})` }))}
            value={draft.stationId}
            onChange={(stationId) => onChange({ ...draft, stationId, departmentIds: [] })}
            searchable
          />
          <TextInput label={t('form.name')} placeholder={t('form.namePlaceholder')} required value={draft.name} onChange={(e) => onChange({ ...draft, name: e.currentTarget.value })} maxLength={100} />
        </Group>
        {station && (
          <Stack gap={6}>
            <Text fw={700} size="sm">{t('form.departments')}</Text>
            <Checkbox checked disabled label={t('form.stationDepartment', { name: stationDepartment?.name ?? '' })} />
            {shown.map((d) => (
              <Checkbox key={d.id} label={d.name} checked={draft.departmentIds.includes(d.id)} disabled={!manageable(d)} onChange={(e) => toggle(d.id, e.currentTarget.checked)} />
            ))}
            {others.some((d) => !draft.departmentIds.includes(d.id)) && (
              <Group align="end" gap="sm">
                <Select
                  label={t('form.anotherDepartment')}
                  data={others.filter((d) => !draft.departmentIds.includes(d.id)).map((d) => ({ value: d.id, label: d.name }))}
                  value={another}
                  onChange={setAnother}
                  clearable
                  maw={360}
                />
                <Button
                  variant="default"
                  disabled={!another}
                  onClick={() => {
                    if (another) toggle(another, true);
                    setAnother(null);
                  }}
                >
                  {t('form.add')}
                </Button>
              </Group>
            )}
            <Text size="xs" c="dimmed">{t('form.departmentsHint')}</Text>
          </Stack>
        )}
        <Stack gap={6}>
          <Text fw={700} size="sm">{t('form.allowed')}</Text>
          <Checkbox checked disabled label={t('form.allowIncidents')} />
          <Checkbox label={t('form.allowNewIncident')} checked={draft.allowNewIncident} onChange={(e) => onChange({ ...draft, allowNewIncident: e.currentTarget.checked })} />
          {training && <Checkbox label={t('form.allowTraining')} checked={draft.allowTraining} onChange={(e) => onChange({ ...draft, allowTraining: e.currentTarget.checked })} />}
        </Stack>
        <Select
          label={t('form.language')}
          data={[{ value: 'de', label: 'Deutsch' }, { value: 'en', label: 'English' }]}
          value={draft.language}
          onChange={(language) => language && onChange({ ...draft, language: language as Language })}
          allowDeselect={false}
          maw={260}
        />
        <Group justify="flex-end">
          <Button type="submit" loading={loading} disabled={!draft.stationId || !draft.name.trim()}>{submitLabel}</Button>
        </Group>
      </Stack>
    </form>
  );
}
