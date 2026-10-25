import { ActionIcon, Button, Group, NumberInput, Select, SimpleGrid, Stack, Switch, Text, Textarea, TextInput } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { PartyRole } from '@forga/incidents-contracts';
import { useTranslation } from '@forga/web-sdk';
import { DataTable, Panel } from '@forga/web-ui';
import type { Content } from './editor';

type Party = Content['involvedParties'][number];
type Agency = Content['otherAgencies'][number];

const AGENCIES = ['ambulance', 'emergency-doctor', 'police', 'thw', 'neighbouring-brigade', 'utility'] as const;

export function OtherSection({ content, update, disabled }: { content: Content; update: (change: (c: Content) => Content) => void; disabled: boolean }) {
  const { t } = useTranslation('incidents');
  const [party, setParty] = useState<Party>({ role: 'injured-party', name: '', street: '', postalCode: '', city: '', phone: '' });
  const [agency, setAgency] = useState<Agency>({ organization: '', forces: null, vehicles: null });
  const set = <K extends keyof Content>(key: K, value: Content[K]) => update((c) => ({ ...c, [key]: value }));
  const agencyLabel = (organization: string) => t(`other.agencies.${organization}`, { defaultValue: organization });

  return (
    <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
      <Panel title={t('other.parties')}>
        <Stack gap="sm">
          <DataTable
            exportable={false}
            rows={content.involvedParties.map((p, index) => ({ ...p, index }))}
            rowKey={(p) => String(p.index)}
            empty={t('other.noParties')}
            columns={[
              { key: 'name', header: t('other.name'), render: (p) => p.name },
              { key: 'role', header: t('other.role'), render: (p) => t(`other.roles.${p.role}`) },
              { key: 'address', header: t('other.address'), render: (p) => [p.street, [p.postalCode, p.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') },
              { key: 'phone', header: t('other.phone'), render: (p) => p.phone },
              {
                key: 'remove',
                header: '',
                align: 'right',
                render: (p) => !disabled && (
                  <ActionIcon aria-label={t('other.remove')} onClick={() => set('involvedParties', content.involvedParties.filter((_, i) => i !== p.index))}><IconTrash size={16} /></ActionIcon>
                ),
              },
            ]}
          />
          {!disabled && (
            <>
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <TextInput label={t('other.name')} value={party.name} onChange={(e) => setParty({ ...party, name: e.currentTarget.value })} />
                <Select label={t('other.role')} data={PartyRole.options.map((r) => ({ value: r, label: t(`other.roles.${r}`) }))} value={party.role} onChange={(v) => v && setParty({ ...party, role: v as Party['role'] })} allowDeselect={false} />
                <TextInput label={t('fields.street')} value={party.street} onChange={(e) => setParty({ ...party, street: e.currentTarget.value })} />
                <Group grow>
                  <TextInput label={t('other.postalCode')} value={party.postalCode} onChange={(e) => setParty({ ...party, postalCode: e.currentTarget.value })} />
                  <TextInput label={t('fields.city')} value={party.city} onChange={(e) => setParty({ ...party, city: e.currentTarget.value })} />
                </Group>
                <TextInput label={t('other.phone')} value={party.phone} onChange={(e) => setParty({ ...party, phone: e.currentTarget.value })} />
              </SimpleGrid>
              <Button
                variant="outline"
                disabled={!party.name.trim()}
                onClick={() => {
                  set('involvedParties', [...content.involvedParties, party]);
                  setParty({ role: 'injured-party', name: '', street: '', postalCode: '', city: '', phone: '' });
                }}
                style={{ alignSelf: 'flex-start' }}
              >
                {t('other.addParty')}
              </Button>
            </>
          )}
        </Stack>
      </Panel>
      <Panel title={t('other.agenciesTitle')}>
        <Stack gap="sm">
          <DataTable
            exportable={false}
            rows={content.otherAgencies.map((a, index) => ({ ...a, index }))}
            rowKey={(a) => String(a.index)}
            empty={t('other.noAgencies')}
            columns={[
              { key: 'organization', header: t('other.organization'), render: (a) => agencyLabel(a.organization) },
              { key: 'forces', header: t('other.forces'), align: 'right', render: (a) => a.forces ?? '' },
              { key: 'vehicles', header: t('other.vehicles'), align: 'right', render: (a) => a.vehicles ?? '' },
              {
                key: 'remove',
                header: '',
                align: 'right',
                render: (a) => !disabled && (
                  <ActionIcon aria-label={t('other.remove')} onClick={() => set('otherAgencies', content.otherAgencies.filter((_, i) => i !== a.index))}><IconTrash size={16} /></ActionIcon>
                ),
              },
            ]}
          />
          {!disabled && (
            <Group align="end" gap="sm">
              <Select
                label={t('other.organization')}
                data={AGENCIES.map((a) => ({ value: a, label: agencyLabel(a) }))}
                value={agency.organization || null}
                onChange={(v) => setAgency({ ...agency, organization: v ?? '' })}
                searchable
                style={{ flex: 2, minWidth: 180 }}
              />
              <NumberInput label={t('other.forces')} value={agency.forces ?? ''} onChange={(v) => setAgency({ ...agency, forces: v === '' ? null : Number(v) })} min={0} w={100} />
              <NumberInput label={t('other.vehicles')} value={agency.vehicles ?? ''} onChange={(v) => setAgency({ ...agency, vehicles: v === '' ? null : Number(v) })} min={0} w={100} />
              <Button
                variant="outline"
                disabled={!agency.organization}
                onClick={() => {
                  set('otherAgencies', [...content.otherAgencies, agency]);
                  setAgency({ organization: '', forces: null, vehicles: null });
                }}
              >
                {t('other.addAgency')}
              </Button>
            </Group>
          )}
        </Stack>
      </Panel>
      <Panel title={t('other.equipment')}>
        <Textarea placeholder={t('other.equipmentPlaceholder')} value={content.equipment} onChange={(e) => set('equipment', e.currentTarget.value)} autosize minRows={3} disabled={disabled} aria-label={t('other.equipment')} />
      </Panel>
      <Panel title={t('other.costs')}>
        <Stack gap="sm">
          <Switch label={t('other.chargeable')} checked={content.chargeable} onChange={(e) => set('chargeable', e.currentTarget.checked)} disabled={disabled} />
          {content.chargeable && <TextInput label={t('other.chargeableReason')} value={content.chargeableReason} onChange={(e) => set('chargeableReason', e.currentTarget.value)} disabled={disabled} />}
          <Textarea label={t('other.notes')} value={content.notes} onChange={(e) => set('notes', e.currentTarget.value)} autosize minRows={2} disabled={disabled} />
          <Text size="xs" c="dimmed">{t('other.attachmentsLater')}</Text>
        </Stack>
      </Panel>
    </SimpleGrid>
  );
}
