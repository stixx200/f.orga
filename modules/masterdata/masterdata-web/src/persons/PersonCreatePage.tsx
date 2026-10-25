import { Button, Group, Radio, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { type CreatePersonInput, type Person, type PersonSummary, STATUSES_BY_DEPARTMENT_TYPE } from '@forga/masterdata-contracts';
import { api, can, send, useSession, useTranslation, withQuery } from '@forga/web-sdk';
import { ActionBar, Notice, PageHeader, Panel, useAction } from '@forga/web-ui';
import { ageOn, keys, probationEnd, SENSITIVE, today, useDepartments, useMembershipRules, WRITE } from '../api';

/** New person with primary department and admission; further data follows in the person file. */
export function PersonCreatePage() {
  const { t } = useTranslation('masterdata');
  const { t: common } = useTranslation('common');
  const navigate = useNavigate();
  const session = useSession().data;
  const { data: departments = [] } = useDepartments();
  const { data: rules } = useMembershipRules();
  const writable = departments.filter((d) => can(session, WRITE, d.id));
  const [form, setForm] = useState(() => ({
    firstName: '',
    lastName: '',
    gender: 'unspecified' as Person['gender'],
    birthDate: null as string | null,
    phoneMobile: '',
    email: '',
    street: '',
    postalCode: '',
    city: '',
    departmentId: null as string | null,
    from: today(),
    status: 'probation' as 'probation' | 'active' | 'youth' | 'veterans',
    probationEndsOn: null as string | null,
    probationReason: '',
  }));
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));
  const departmentId = form.departmentId ?? (writable.length === 1 ? writable[0].id : null);
  const standardEnd = probationEnd(form.from, rules?.probationMonths ?? 12);
  // Minors cannot join an operational department (minimum age of the statute); the server refuses it as well.
  const ageAtStart = form.birthDate ? ageOn(form.birthDate, form.from) : null;
  const departmentType = departments.find((d) => d.id === departmentId)?.type;
  const operational = departmentType === 'operational';
  const tooYoung = operational && ageAtStart !== null && ageAtStart < (rules?.minimumAgeOperational ?? 17);
  const tooYoungYouth = departmentType === 'youth' && ageAtStart !== null && ageAtStart < (rules?.minimumAgeYouth ?? 10);
  // The status follows the type of the primary department (youth department: youth members only), as on the server.
  const statuses = (['probation', 'active', 'youth', 'veterans'] as const).filter((s) => !departmentType || STATUSES_BY_DEPARTMENT_TYPE[departmentType].includes(s));
  const status = statuses.includes(form.status) ? form.status : (statuses[0] ?? form.status);
  const probationChanged = status === 'probation' && form.probationEndsOn !== null && form.probationEndsOn !== standardEnd;
  const futureBirth = Boolean(form.birthDate && form.birthDate > today());

  // Same name (also former members): offer to open the existing person instead of creating a duplicate.
  const lastName = form.lastName.trim().toLowerCase();
  const { data: similar = [] } = useQuery({
    queryKey: ['masterdata', 'persons', 'similar', lastName],
    queryFn: () => api<PersonSummary[]>(withQuery('masterdata/persons', { q: form.lastName.trim(), includeLeft: 'true' })),
    enabled: lastName.length >= 2,
  });
  const matches = similar.filter((p) => p.lastName.toLowerCase() === lastName && p.firstName.toLowerCase() === form.firstName.trim().toLowerCase());

  const create = useAction(
    async () => {
      const body: CreatePersonInput = {
        firstName: form.firstName,
        lastName: form.lastName,
        gender: form.gender,
        phoneMobile: form.phoneMobile,
        email: form.email,
        street: form.street,
        postalCode: form.postalCode,
        city: form.city,
        joinedOn: form.from,
        status,
        memberships: [{ departmentId: departmentId!, from: form.from, primary: true }],
        ...(can(session, SENSITIVE, departmentId ?? undefined) ? { birthDate: form.birthDate } : {}),
      };
      const person = await send<Person>('POST', 'masterdata/persons', body);
      if (probationChanged) {
        await send('PUT', `masterdata/persons/${person.id}/probation`, { probationEndsOn: form.probationEndsOn, reason: form.probationReason });
      }
      return person;
    },
    { success: t('persons.created'), invalidate: [keys.persons], onSuccess: (person) => navigate(`/masterdata/persons/${person.id}`) },
  );
  const valid = Boolean(form.firstName.trim() && form.lastName.trim() && departmentId && (!probationChanged || form.probationReason.trim())) && !tooYoung && !tooYoungYouth && !futureBirth;

  return (
    <Stack gap="lg" pb={80}>
      <PageHeader breadcrumbs={[{ label: t('module') }, { label: t('persons.title'), to: '/masterdata/persons' }, { label: t('persons.new') }]} title={t('persons.createTitle')} />
      {matches.map((p) => (
        <Notice key={p.id} kind="warning" action={<Button component={Link} to={`/masterdata/persons/${p.id}`} size="xs" variant="outline">{t('persons.openExisting')}</Button>}>
          {t('persons.similar', { name: `${p.firstName} ${p.lastName}`, status: t(`status.${p.status}`) })}
        </Notice>
      ))}
      <form
        id="create-person"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) create.mutate(undefined);
        }}
      >
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
          <Panel title={t('person.sections.person')}>
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <TextInput label={t('person.firstName')} value={form.firstName} onChange={(e) => set('firstName', e.currentTarget.value)} required />
              <TextInput label={t('person.lastName')} value={form.lastName} onChange={(e) => set('lastName', e.currentTarget.value)} required />
              <Select
                label={t('person.gender')}
                data={(['male', 'female', 'diverse', 'unspecified'] as const).map((g) => ({ value: g, label: t(`gender.${g}`) }))}
                value={form.gender}
                onChange={(v) => v && set('gender', v as Person['gender'])}
                allowDeselect={false}
              />
              {can(session, SENSITIVE) && <DateInput label={t('person.birthDate')} value={form.birthDate} onChange={(v) => set('birthDate', v)} valueFormat="DD.MM.YYYY" maxDate={today()} clearable error={futureBirth ? t('persons.birthDateInFuture') : undefined} />}
              <TextInput label={t('person.phoneMobile')} type="tel" value={form.phoneMobile} onChange={(e) => set('phoneMobile', e.currentTarget.value)} />
              <TextInput label={t('person.email')} type="email" value={form.email} onChange={(e) => set('email', e.currentTarget.value)} />
              <TextInput label={t('person.street')} value={form.street} onChange={(e) => set('street', e.currentTarget.value)} />
              <Group grow>
                <TextInput label={t('person.postalCode')} value={form.postalCode} onChange={(e) => set('postalCode', e.currentTarget.value)} />
                <TextInput label={t('person.city')} value={form.city} onChange={(e) => set('city', e.currentTarget.value)} />
              </Group>
            </SimpleGrid>
          </Panel>
          <Panel title={t('persons.admission')}>
            <Stack gap="sm">
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <Select label={t('persons.primaryDepartment')} data={writable.map((d) => ({ value: d.id, label: d.name }))} value={departmentId} onChange={(v) => set('departmentId', v)} required />
                <DateInput label={t('persons.admittedFrom')} value={form.from} onChange={(v) => v && set('from', v)} valueFormat="DD.MM.YYYY" required />
              </SimpleGrid>
              <Radio.Group label={t('persons.status')} value={status} onChange={(v) => set('status', v as typeof form.status)}>
                <Stack gap={6} mt={4}>
                  {statuses.includes('probation') && <Radio value="probation" label={t('status.probation')} description={t('persons.statusProbationHint')} />}
                  {statuses.includes('active') && <Radio value="active" label={t('status.active')} description={t('persons.statusActiveHint')} />}
                  {statuses.includes('youth') && <Radio value="youth" label={t('status.youth')} />}
                  {statuses.includes('veterans') && <Radio value="veterans" label={t('status.veterans')} />}
                </Stack>
              </Radio.Group>
              {status === 'probation' && (
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                  <DateInput
                    label={t('persons.probationEnds')}
                    description={t('persons.probationHint', { months: rules?.probationMonths ?? 12 })}
                    value={form.probationEndsOn ?? standardEnd}
                    onChange={(v) => set('probationEndsOn', v)}
                    valueFormat="DD.MM.YYYY"
                  />
                  <TextInput
                    label={t('persons.probationReason')}
                    placeholder={t('persons.probationReasonPlaceholder')}
                    value={form.probationReason}
                    onChange={(e) => set('probationReason', e.currentTarget.value)}
                    required={probationChanged}
                  />
                </SimpleGrid>
              )}
              {tooYoung && <Notice kind="warning">{t('persons.tooYoung', { age: rules?.minimumAgeOperational ?? 17 })}</Notice>}
              {tooYoungYouth && <Notice kind="warning">{t('persons.tooYoungYouth', { age: rules?.minimumAgeYouth ?? 10 })}</Notice>}
              <Text size="xs" c="dimmed">{t('persons.reminderHint')}</Text>
            </Stack>
          </Panel>
        </SimpleGrid>
      </form>
      <ActionBar info={t('persons.requiredHint')}>
        <Button component={Link} to="/masterdata/persons" variant="default">{common('actions.cancel')}</Button>
        <Button type="submit" form="create-person" loading={create.isPending} disabled={!valid}>{t('persons.createButton')}</Button>
      </ActionBar>
    </Stack>
  );
}
