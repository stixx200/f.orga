import { Button, Group, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { Person, SelfContactInput } from '@forga/masterdata-contracts';
import { api, formatDate, send, useTranslation } from '@forga/web-sdk';
import { Panel, useAction } from '@forga/web-ui';
import { today as todayDate, useCatalogNames, useDepartments } from '../api';

const KEY = ['masterdata', 'me'] as const;

function ContactForm({ person }: { person: Person }) {
  const { t } = useTranslation('masterdata');
  const { t: common } = useTranslation('common');
  const [form, setForm] = useState<SelfContactInput>({
    version: person.version,
    street: person.street,
    postalCode: person.postalCode,
    city: person.city,
    phonePrivate: person.phonePrivate,
    phoneMobile: person.phoneMobile,
    phoneWork: person.phoneWork,
    email: person.email,
    bank: person.bank ?? { iban: '', accountHolder: '' },
  });
  const field = (key: 'street' | 'postalCode' | 'city' | 'phonePrivate' | 'phoneMobile' | 'phoneWork' | 'email', label: string) => (
    <TextInput label={label} value={form[key] ?? ''} onChange={(e) => setForm({ ...form, [key]: e.currentTarget.value })} />
  );
  const save = useAction(() => send<Person>('PUT', 'masterdata/me', form), { success: t('me.saved'), invalidate: [KEY], onSuccess: (p) => setForm((f) => ({ ...f, version: p.version })) });
  return (
    <Stack gap="sm">
      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        {field('street', t('person.street'))}
        {field('postalCode', t('person.postalCode'))}
        {field('city', t('person.city'))}
        {field('phonePrivate', t('person.phonePrivate'))}
        {field('phoneMobile', t('person.phoneMobile'))}
        {field('phoneWork', t('person.phoneWork'))}
        {field('email', t('person.email'))}
        <TextInput label={t('person.iban')} value={form.bank?.iban ?? ''} onChange={(e) => setForm({ ...form, bank: { iban: e.currentTarget.value, accountHolder: form.bank?.accountHolder ?? '' } })} />
        <TextInput label={t('person.accountHolder')} value={form.bank?.accountHolder ?? ''} onChange={(e) => setForm({ ...form, bank: { iban: form.bank?.iban ?? '', accountHolder: e.currentTarget.value } })} />
      </SimpleGrid>
      <Group justify="space-between">
        <Text size="xs" c="dimmed">{t('me.contactHint')}</Text>
        <Button loading={save.isPending} onClick={() => save.mutate(undefined)}>{common('actions.save')}</Button>
      </Group>
    </Stack>
  );
}

/** "My area": the own file (read) and contact details (editable). */
export function MyData() {
  const { t, i18n } = useTranslation('masterdata');
  const { data: person } = useQuery({ queryKey: KEY, queryFn: () => api<Person>('masterdata/me') });
  const { data: departments = [] } = useDepartments();
  const rank = useCatalogNames('rank');
  const qualification = useCatalogNames('qualification');
  const honor = useCatalogNames('honor');
  const [today] = useState(todayDate);
  if (!person) return null;
  const memberships = person.memberships.filter((m) => !m.to || m.to >= today);
  const lines: [string, string][] = [
    [t('me.departments'), memberships.map((m) => departments.find((d) => d.id === m.departmentId)?.name ?? '').filter(Boolean).join(', ')],
    [t('me.rank'), person.rank ? `${rank(person.rank, i18n.language)} (${formatDate(person.ranks.at(-1)?.since, i18n.language)})` : '–'],
    [t('me.joined'), formatDate(person.joinedOn, i18n.language)],
    [t('me.qualifications'), person.qualifications.map((q) => qualification(q.qualification, i18n.language)).join(', ') || '–'],
    [t('me.honors'), person.honors.map((h) => `${honor(h.honor, i18n.language)} (${formatDate(h.awardedOn, i18n.language)})`).join(', ') || '–'],
  ];
  return (
    <Stack gap="md">
      <Panel title={t('me.file', { name: `${person.firstName} ${person.lastName}` })}>
        <Stack gap={4}>
          {lines.map(([label, value]) => (
            <Group key={label} gap="xs" wrap="nowrap" align="flex-start">
              <Text size="sm" c="dimmed" w={160}>{label}</Text>
              <Text size="sm">{value}</Text>
            </Group>
          ))}
        </Stack>
      </Panel>
      <Panel title={t('me.contact')}>
        <ContactForm key={person.id} person={person} />
      </Panel>
    </Stack>
  );
}
