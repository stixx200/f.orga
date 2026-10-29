import { Select, SimpleGrid, Text, Textarea, TextInput } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import type { Dispatch, SetStateAction } from 'react';
import { isValidIban, type Person } from '@forga/masterdata-contracts';
import { useTranslation } from '@forga/web-sdk';
import { Notice, Panel, StatusBadge } from '@forga/web-ui';
import { today } from '../api';
import type { PersonForm } from './PersonPage';

/** Field error for an IBAN with wrong check digits; empty is allowed. */
export const ibanError = (iban: string | undefined, message: string) => (iban?.trim() && !isValidIban(iban) ? message : undefined);

const age = (birthDate: string) => {
  const birth = new Date(`${birthDate}T12:00:00Z`);
  const now = new Date();
  return now.getUTCFullYear() - birth.getUTCFullYear() - (now < new Date(Date.UTC(now.getUTCFullYear(), birth.getUTCMonth(), birth.getUTCDate())) ? 1 : 0);
};

export function MasterDataTab({ person, form, setForm, disabled }: { person: Person; form: PersonForm; setForm: Dispatch<SetStateAction<PersonForm>>; disabled: boolean }) {
  const { t } = useTranslation('masterdata');
  const set = <K extends keyof PersonForm>(key: K, value: PersonForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const text = (key: 'salutation' | 'title' | 'firstName' | 'lastName' | 'nickname' | 'street' | 'postalCode' | 'city' | 'phonePrivate' | 'phoneMobile' | 'phoneWork' | 'email', type = 'text', required = false) => (
    <TextInput label={t(`person.${key}`)} type={type} value={form[key]} onChange={(e) => set(key, e.currentTarget.value)} disabled={disabled} required={required} />
  );
  const sensitiveBadge = <StatusBadge>{t('person.sensitive')}</StatusBadge>;
  const hidden = <Notice kind="info">{t(person.stepUpAvailable ? 'person.sensitiveStepUp' : 'person.sensitiveHidden')}</Notice>;
  const employer = { name: '', street: '', postalCode: '', city: '', phone: '', contact: '', iban: '', lossOfEarningsAssignedFrom: null, ...form.employer };
  const bank = form.bank ?? { iban: '', accountHolder: '' };

  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
      <Panel title={t('person.sections.person')}>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Select
            label={t('person.salutation')}
            data={[{ value: 'Herr', label: t('person.salutations.mr') }, { value: 'Frau', label: t('person.salutations.ms') }, { value: '', label: t('person.salutations.none') }]}
            value={form.salutation}
            onChange={(v) => set('salutation', v ?? '')}
            allowDeselect={false}
            disabled={disabled}
          />
          {text('title')}
          {text('firstName', 'text', true)}
          {text('lastName', 'text', true)}
          {text('nickname')}
          <Select
            label={t('person.gender')}
            description={t('person.genderHint')}
            data={(['male', 'female', 'diverse', 'unspecified'] as const).map((g) => ({ value: g, label: t(`gender.${g}`) }))}
            value={form.gender}
            onChange={(v) => v && set('gender', v as Person['gender'])}
            allowDeselect={false}
            disabled={disabled}
          />
        </SimpleGrid>
      </Panel>
      <Panel title={t('person.sections.contact')}>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          {text('street')}
          {text('postalCode')}
          {text('city')}
          {text('phoneMobile', 'tel')}
          {text('phonePrivate', 'tel')}
          {text('phoneWork', 'tel')}
          {text('email', 'email')}
        </SimpleGrid>
      </Panel>
      <Panel title={t('person.sections.personal')} aside={sensitiveBadge}>
        {person.sensitiveHidden ? hidden : (
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <DateInput
              label={t('person.birthDate')}
              description={form.birthDate ? t('person.age', { age: age(form.birthDate) }) : undefined}
              value={form.birthDate ?? null}
              onChange={(v) => set('birthDate', v)}
              valueFormat="DD.MM.YYYY"
              maxDate={today()}
              clearable
              disabled={disabled}
            />
            <TextInput label={t('person.birthPlace')} value={form.birthPlace ?? ''} onChange={(e) => set('birthPlace', e.currentTarget.value)} disabled={disabled} />
          </SimpleGrid>
        )}
      </Panel>
      <Panel title={t('person.sections.employer')} aside={sensitiveBadge}>
        {person.sensitiveHidden ? hidden : (
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <TextInput label={t('person.employerName')} value={employer.name} onChange={(e) => set('employer', { ...employer, name: e.currentTarget.value })} disabled={disabled} />
            <TextInput label={t('person.employerPhone')} value={employer.phone} onChange={(e) => set('employer', { ...employer, phone: e.currentTarget.value })} disabled={disabled} />
            <TextInput label={t('person.street')} value={employer.street} onChange={(e) => set('employer', { ...employer, street: e.currentTarget.value })} disabled={disabled} />
            <TextInput label={t('person.city')} value={employer.city} onChange={(e) => set('employer', { ...employer, city: e.currentTarget.value })} disabled={disabled} />
            <TextInput label={t('person.employerContact')} value={employer.contact} onChange={(e) => set('employer', { ...employer, contact: e.currentTarget.value })} disabled={disabled} />
            <TextInput label={t('person.employerIban')} value={employer.iban} onChange={(e) => set('employer', { ...employer, iban: e.currentTarget.value })} disabled={disabled} error={ibanError(employer.iban, t('person.invalidIban'))} />
            <DateInput
              label={t('person.lossOfEarningsAssignedFrom')}
              description={t('person.lossOfEarningsAssignedHint')}
              value={employer.lossOfEarningsAssignedFrom}
              onChange={(v) => set('employer', { ...employer, lossOfEarningsAssignedFrom: v })}
              valueFormat="DD.MM.YYYY"
              clearable
              disabled={disabled}
            />
          </SimpleGrid>
        )}
      </Panel>
      <Panel title={t('person.sections.bank')} aside={sensitiveBadge}>
        {person.sensitiveHidden ? hidden : (
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <TextInput label={t('person.iban')} value={bank.iban} onChange={(e) => set('bank', { ...bank, iban: e.currentTarget.value })} disabled={disabled} error={ibanError(bank.iban, t('person.invalidIban'))} />
            <TextInput label={t('person.accountHolder')} value={bank.accountHolder} onChange={(e) => set('bank', { ...bank, accountHolder: e.currentTarget.value })} disabled={disabled} />
          </SimpleGrid>
        )}
      </Panel>
      <Panel title={t('person.sections.notes')} aside={sensitiveBadge}>
        {person.sensitiveHidden ? hidden : (
          <>
            <Textarea label={t('person.notes')} value={form.notes} onChange={(e) => set('notes', e.currentTarget.value)} autosize minRows={3} disabled={disabled} />
            <Text size="xs" c="dimmed" mt="xs">{t('person.notesHint')}</Text>
          </>
        )}
      </Panel>
    </SimpleGrid>
  );
}
