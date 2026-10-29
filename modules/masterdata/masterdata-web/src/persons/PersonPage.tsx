import { Avatar, Button, Group, Stack, Tabs, Text } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { classNames, isValidIban, type Person, type PersonInput } from '@forga/masterdata-contracts';
import { ApiError, can, extensionsOf, send, useLocalized, useSession, useTranslation } from '@forga/web-sdk';
import { ActionBar, EmptyState, HistoryTimeline, Notice, PageHeader, Panel, StatusBadge, StepUpButton, useAction } from '@forga/web-ui';
import { keys, today as todayDate, useCatalogNames, useDepartments, usePerson, WRITE } from '../api';
import { BrigadeTab } from './BrigadeTab';
import { CoursesTab, PLAN } from './CoursesTab';
import { EntriesTab } from './EntriesTab';
import { OfficesTab } from './OfficesTab';
import { RestPeriodsPanel } from './RestPeriodsPanel';
import { MasterDataTab } from './MasterDataTab';
import { STATUS_TONES } from './PersonsPage';

export type PersonForm = Required<Omit<PersonInput, 'birthDate' | 'birthPlace' | 'employer' | 'bank' | 'version'>> & Pick<PersonInput, 'birthDate' | 'birthPlace' | 'employer' | 'bank'>;

export function toForm(person: Person): PersonForm {
  return {
    personnelNumber: person.personnelNumber,
    salutation: person.salutation,
    title: person.title,
    firstName: person.firstName,
    lastName: person.lastName,
    nickname: person.nickname,
    street: person.street,
    postalCode: person.postalCode,
    city: person.city,
    phonePrivate: person.phonePrivate,
    phoneMobile: person.phoneMobile,
    phoneWork: person.phoneWork,
    email: person.email,
    gender: person.gender,
    employment: person.employment,
    joinedOn: person.joinedOn,
    musician: person.musician,
    notes: person.notes,
    ...(person.sensitiveHidden ? {} : { birthDate: person.birthDate ?? null, birthPlace: person.birthPlace ?? '', employer: person.employer, bank: person.bank }),
  };
}

/** Tabs of the person file; extension tabs of other modules (and the shell's `privacy`) are addressed by their ID (`?tab=clothing`). */
const TABS = ['master', 'brigade', 'courses', 'qualifications', 'honors', 'offices', 'history'] as const;

const initials = (p: Pick<Person, 'firstName' | 'lastName'>) => `${p.firstName[0] ?? ''}${p.lastName[0] ?? ''}`.toUpperCase();

function PersonFile({ person }: { person: Person }) {
  const { t, i18n } = useTranslation('masterdata');
  const { t: common } = useTranslation('common');
  const localized = useLocalized();
  const queryClient = useQueryClient();
  const session = useSession().data;
  const { data: departments = [] } = useDepartments();
  const rankName = useCatalogNames('rank');
  const qualificationName = useCatalogNames('qualification');
  const [form, setForm] = useState<PersonForm>(() => toForm(person));
  const [search, setSearch] = useSearchParams();
  const editable = person.memberships.some((m) => can(session, WRITE, m.departmentId)) || session?.permissions[WRITE] === 'brigade';
  // Course coordinators record course attendances without editing the person (`masterdata.courses.plan`).
  const planner = person.memberships.some((m) => can(session, PLAN, m.departmentId)) || session?.permissions[PLAN] === 'brigade';
  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(person));
  const ibanInvalid = [form.bank?.iban, form.employer?.iban].some((iban) => iban?.trim() && !isValidIban(iban));
  const updated = (saved: Person) => {
    queryClient.setQueryData([...keys.persons, person.id], saved);
    void queryClient.invalidateQueries({ queryKey: [...keys.persons, 'summaries'] });
  };
  const save = useAction((input: PersonForm) => send<Person>('PUT', `masterdata/persons/${person.id}`, { ...input, version: person.version }), {
    success: t('person.saved'),
    onSuccess: (saved) => {
      updated(saved);
      setForm(toForm(saved));
    },
  });

  const [today] = useState(todayDate);
  const current = person.memberships.filter((m) => m.from <= today && (!m.to || m.to >= today));
  const department = (id: string) => departments.find((d) => d.id === id)?.shortName ?? '';
  const subtitle = [
    rankName(person.rank, i18n.language),
    ...current.toSorted((a, b) => Number(b.primary) - Number(a.primary)).map((m) => `${department(m.departmentId)}${m.primary ? ` (${t('person.primary')})` : ''}`),
    person.personnelNumber ? t('persons.number', { number: person.personnelNumber }) : '',
  ].filter(Boolean).join(' · ');
  const extensions = extensionsOf('masterdata.person.tab').filter((e) => (!e.permission || can(session, e.permission)) && (!e.anyPermission || e.anyPermission.some((p) => can(session, p))));
  // Actions of other parts in the header, e.g. „Auskunft erstellen“ of the core.
  const actions = extensionsOf('masterdata.person.actions').filter((e) => !e.permission || can(session, e.permission));
  // Deep link `?tab=<tab>`: own tabs by name, extension tabs by module ID.
  const requested = search.get('tab');
  const tab = requested && (TABS as readonly string[]).includes(requested) ? requested : requested && extensions.some((e) => e.module === requested) ? `ext:${requested}` : 'master';
  const setTab = (value: string | null) => {
    const next = new URLSearchParams(search);
    if (!value || value === 'master') next.delete('tab');
    else next.set('tab', value.replace(/^ext:/, ''));
    setSearch(next, { replace: true });
  };

  return (
    <Stack gap="lg" pb={80}>
      <PageHeader
        breadcrumbs={[{ label: t('module') }, { label: t('persons.title'), to: '/masterdata/persons' }, { label: `${person.firstName} ${person.lastName}` }]}
        title={`${person.firstName} ${person.lastName}`}
        actions={
          actions.length > 0 && (
            <Group gap="xs">
              {actions.map((e) => <e.component key={e.module} personId={person.id} />)}
            </Group>
          )
        }
      />
      {person.anonymizedAt && <Notice kind="info">{t('person.anonymized')}</Notice>}
      {person.processingRestricted && <Notice kind="warning">{t('person.restricted')}</Notice>}
      {person.stepUpAvailable && <Notice kind="info" action={<StepUpButton>{t('person.showSensitive')}</StepUpButton>}>{t('person.stepUpHidden')}</Notice>}
      <Panel>
        <Group wrap="nowrap" align="center">
          <Avatar size={64} color="brand" radius="xl">{initials(person)}</Avatar>
          <Stack gap={6}>
            <Text c="dimmed">{subtitle}</Text>
            <Group gap={4}>
              <StatusBadge tone={STATUS_TONES[person.status]}>{t(`status.${person.status}`)}</StatusBadge>
              {person.processingRestricted && <StatusBadge tone="error">{t('person.restrictedBadge')}</StatusBadge>}
              {person.qualifications.map((q) => <StatusBadge key={q.id}>{qualificationName(q.qualification, i18n.language)}</StatusBadge>)}
              {person.driverLicense.classes.length > 0 && <StatusBadge>{t('person.licenseBadge', { classes: classNames(person.driverLicense.classes) })}</StatusBadge>}
            </Group>
          </Stack>
        </Group>
      </Panel>
      <Tabs value={tab} onChange={setTab} keepMounted={false}>
        <Tabs.List mb="lg">
          <Tabs.Tab value="master">{t('person.tabs.master')}</Tabs.Tab>
          <Tabs.Tab value="brigade">{t('person.tabs.brigade')}</Tabs.Tab>
          <Tabs.Tab value="courses">{t('person.tabs.courses')}</Tabs.Tab>
          <Tabs.Tab value="qualifications">{t('person.tabs.qualifications')}</Tabs.Tab>
          <Tabs.Tab value="honors">{t('person.tabs.honors')}</Tabs.Tab>
          <Tabs.Tab value="offices">{t('person.tabs.offices')}</Tabs.Tab>
          {extensions.map((e) => <Tabs.Tab key={e.module} value={`ext:${e.module}`}>{localized(e.label)}</Tabs.Tab>)}
          <Tabs.Tab value="history">{t('person.tabs.history')}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="master"><MasterDataTab person={person} form={form} setForm={setForm} disabled={!editable} /></Tabs.Panel>
        <Tabs.Panel value="brigade">
          <Stack gap="md">
            <BrigadeTab person={person} form={form} setForm={setForm} disabled={!editable} onChanged={updated} />
            {!person.sensitiveHidden && <RestPeriodsPanel person={person} disabled={!editable} onChanged={updated} />}
          </Stack>
        </Tabs.Panel>
        <Tabs.Panel value="courses"><CoursesTab person={person} disabled={!editable && !planner} onChanged={updated} /></Tabs.Panel>
        <Tabs.Panel value="qualifications"><EntriesTab kind="qualification" person={person} disabled={!editable} onChanged={updated} /></Tabs.Panel>
        <Tabs.Panel value="honors"><EntriesTab kind="honor" person={person} disabled={!editable} onChanged={updated} /></Tabs.Panel>
        <Tabs.Panel value="offices"><OfficesTab person={person} disabled={!editable} onChanged={updated} /></Tabs.Panel>
        {extensions.map((e) => (
          <Tabs.Panel key={e.module} value={`ext:${e.module}`}><e.component personId={person.id} /></Tabs.Panel>
        ))}
        <Tabs.Panel value="history">
          <Panel title={t('person.tabs.history')}>
            <HistoryTimeline entity="masterdata.person" id={person.id} fieldLabels={t('person', { returnObjects: true }) as Record<string, string>} />
          </Panel>
        </Tabs.Panel>
      </Tabs>
      {editable && (
        <ActionBar info={t(dirty ? 'person.unsaved' : 'person.allSaved')}>
          <Button variant="default" disabled={!dirty} onClick={() => setForm(toForm(person))}>{common('actions.cancel')}</Button>
          <Button disabled={!dirty || ibanInvalid} loading={save.isPending} onClick={() => save.mutate(form)}>{common('actions.save')}</Button>
        </ActionBar>
      )}
    </Stack>
  );
}

/** Person file with master data, brigade career, courses, qualifications, honors, extensions and history. */
export function PersonPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation('masterdata');
  const { data: person, error } = usePerson(id);
  if (error instanceof ApiError && error.code === 'privacy.processingRestricted') return <EmptyState title={t('person.restrictedBadge')} text={t('person.restrictedPage')} />;
  if (error) return <EmptyState title={t('person.notFound')} />;
  if (!person) return null;
  return <PersonFile key={person.id} person={person} />;
}
