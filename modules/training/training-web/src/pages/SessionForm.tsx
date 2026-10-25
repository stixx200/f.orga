import { Button, Group, Menu, MultiSelect, Select, SimpleGrid, Stack, Textarea, TextInput } from '@mantine/core';
import type { Session, SessionInput } from '@forga/training-contracts';
import { can, toLocalInput, useLocalized, useSession as useLogin, useTranslation } from '@forga/web-sdk';
import { PLAN, personName, useDepartments, usePersons, useStations, useTrainingSettings, useTypes } from '../api';

export type SessionDraft = Required<Omit<SessionInput, 'startsAt' | 'endsAt' | 'version'>> & { startsAt: string; endsAt: string };

export const emptyDraft = (): SessionDraft => {
  const start = new Date();
  start.setDate(start.getDate() + 7);
  start.setHours(19, 0, 0, 0);
  const end = new Date(start.getTime() + 2 * 3_600_000);
  return {
    type: 'exercise', title: '', startsAt: toLocalInput(start.toISOString()), endsAt: toLocalInput(end.toISOString()),
    stationId: null, departmentIds: [], responsiblePersonId: null, instructorIds: [], topic: '', goals: '', procedure: '', material: '',
  };
};

/** Fields of a session; `startsAt`/`endsAt` are local `datetime-local` values. */
export const draftOf = (s: Session): SessionDraft => ({
  type: s.type, title: s.title, startsAt: toLocalInput(s.startsAt), endsAt: toLocalInput(s.endsAt), stationId: s.stationId, departmentIds: s.departmentIds,
  responsiblePersonId: s.responsiblePersonId, instructorIds: s.instructorIds, topic: s.topic, goals: s.goals, procedure: s.procedure, material: s.material,
});

/** Same local time one week later (also across a daylight saving change). */
const nextWeek = (iso: string) => {
  const date = new Date(iso);
  date.setDate(date.getDate() + 7);
  return date.toISOString();
};

/** Draft of a copy one week later, to be adjusted before planning. */
export const copyOf = (s: Session): SessionDraft => draftOf({ ...s, startsAt: nextWeek(s.startsAt), endsAt: nextWeek(s.endsAt) });

export function SessionForm({ draft, setDraft, disabled = false, contentOnly = false }: { draft: SessionDraft; setDraft: (d: SessionDraft) => void; disabled?: boolean; contentOnly?: boolean }) {
  const { t } = useTranslation('training');
  const localized = useLocalized();
  const session = useLogin().data;
  const { data: types = [] } = useTypes();
  const { data: departments = [] } = useDepartments();
  const { data: stations = [] } = useStations();
  const { data: persons = [] } = usePersons();
  const set = <K extends keyof SessionDraft>(key: K, value: SessionDraft[K]) => setDraft({ ...draft, [key]: value });
  const { data: settings } = useTrainingSettings();
  const snippets = settings?.snippets ?? [];
  // Appends a snippet to the field, separated by a blank line.
  const snippetMenu = (key: 'goals' | 'procedure') =>
    !disabled &&
    snippets.length > 0 && (
      <Menu position="bottom-end">
        <Menu.Target><Button size="compact-xs" variant="subtle">{t('fields.insertSnippet')}</Button></Menu.Target>
        <Menu.Dropdown>
          {snippets.map((s, i) => (
            <Menu.Item key={i} onClick={() => set(key, draft[key].trim() ? `${draft[key].trimEnd()}\n\n${s.text}` : s.text)}>{s.title}</Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
    );
  const members = persons.filter((p) => p.status !== 'left' && (!draft.departmentIds.length || p.departmentIds.some((d) => draft.departmentIds.includes(d))));
  const people = members.map((p) => ({ value: p.id, label: personName(p) }));

  const content = (
    <Stack gap="sm">
      <TextInput label={t('fields.topic')} value={draft.topic} onChange={(e) => set('topic', e.currentTarget.value)} disabled={disabled} />
      <Textarea label={<Group gap="xs" component="span">{t('fields.goals')}{snippetMenu('goals')}</Group>} value={draft.goals} onChange={(e) => set('goals', e.currentTarget.value)} autosize minRows={2} disabled={disabled} />
      <Textarea label={<Group gap="xs" component="span">{t('fields.procedure')}{snippetMenu('procedure')}</Group>} value={draft.procedure} onChange={(e) => set('procedure', e.currentTarget.value)} autosize minRows={3} disabled={disabled} />
      <Textarea label={t('fields.material')} value={draft.material} onChange={(e) => set('material', e.currentTarget.value)} autosize minRows={2} disabled={disabled} />
    </Stack>
  );
  if (contentOnly) return content;

  return (
    <Stack gap="sm">
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <Select label={t('fields.type')} data={types.filter((x) => x.active).map((x) => ({ value: x.key, label: localized(x.name) }))} value={draft.type} onChange={(v) => v && set('type', v)} allowDeselect={false} disabled={disabled} />
        <TextInput label={t('fields.title')} value={draft.title} onChange={(e) => set('title', e.currentTarget.value)} required disabled={disabled} />
        <TextInput label={t('fields.startsAt')} type="datetime-local" value={draft.startsAt} onChange={(e) => set('startsAt', e.currentTarget.value)} required disabled={disabled} />
        <TextInput label={t('fields.endsAt')} type="datetime-local" value={draft.endsAt} onChange={(e) => set('endsAt', e.currentTarget.value)} required disabled={disabled} />
        <MultiSelect
          label={t('fields.departments')}
          data={departments.filter((d) => can(session, PLAN, d.id) || draft.departmentIds.includes(d.id)).map((d) => ({ value: d.id, label: d.name }))}
          value={draft.departmentIds}
          onChange={(v) => set('departmentIds', v)}
          required
          disabled={disabled}
        />
        <Select label={t('fields.station')} data={stations.filter((s) => !draft.departmentIds.length || draft.departmentIds.includes(s.departmentId)).map((s) => ({ value: s.id, label: s.name }))} value={draft.stationId} onChange={(v) => set('stationId', v)} clearable disabled={disabled} />
        <Select label={t('fields.responsible')} data={people} value={draft.responsiblePersonId} onChange={(v) => set('responsiblePersonId', v)} searchable clearable disabled={disabled} />
        <MultiSelect label={t('fields.instructors')} data={people} value={draft.instructorIds} onChange={(v) => set('instructorIds', v)} searchable disabled={disabled} />
      </SimpleGrid>
      {content}
    </Stack>
  );
}
