import { Button, Group, List, Stack, Switch, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { type OptionalPersonField, PERSON_FIELD_NAMES, PERSON_FIELD_PURPOSES, type PersonFieldsCleared, type PersonFieldState } from '@forga/masterdata-contracts';
import { api, send, useLocalized, useTranslation } from '@forga/web-sdk';
import { DataTable, Notice, PageHeader, Panel, ResponsiveDialog, useAction } from '@forga/web-ui';
import { PERSON_FIELDS_KEY } from '../api';

const STATES_KEY = ['masterdata', 'person-fields'] as const;

/** Removing stored values of switched-off fields: a critical action, so the dialog lists fields and numbers. */
function ClearDialog({ fields, onClose }: { fields: PersonFieldState[]; onClose: () => void }) {
  const { t } = useTranslation('masterdata');
  const { t: common } = useTranslation('common');
  const localized = useLocalized();
  const clear = useAction(() => send<PersonFieldsCleared>('POST', 'masterdata/person-fields/clear', { fields: fields.map((f) => f.field) }), {
    success: t('personFields.cleared'),
    invalidate: [STATES_KEY, ['masterdata', 'persons']],
    onSuccess: onClose,
  });
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={t('personFields.clearTitle')}
      actions={
        <>
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button color="red" loading={clear.isPending} onClick={() => clear.mutate(undefined)}>{t('personFields.clearSubmit')}</Button>
        </>
      }
    >
      <Stack gap="sm">
        <Text size="sm">{t('personFields.clearText')}</Text>
        <List size="sm">
          {fields.map((f) => <List.Item key={f.field}>{t('personFields.clearItem', { field: localized(PERSON_FIELD_NAMES[f.field]), count: f.stored })}</List.Item>)}
        </List>
      </Stack>
    </ResponsiveDialog>
  );
}

function FieldsForm({ states }: { states: PersonFieldState[] }) {
  const { t } = useTranslation('masterdata');
  const { t: common } = useTranslation('common');
  const localized = useLocalized();
  const [disabled, setDisabled] = useState<Set<OptionalPersonField>>(() => new Set(states.filter((s) => !s.enabled).map((s) => s.field)));
  const [clearing, setClearing] = useState(false);
  const save = useAction(() => send('PUT', 'core/settings/masterdata.personFields', { disabled: [...disabled] }), {
    success: t('personFields.saved'),
    invalidate: [STATES_KEY, PERSON_FIELDS_KEY],
  });
  const toggle = (field: OptionalPersonField, on: boolean) =>
    setDisabled((current) => {
      const next = new Set(current);
      if (on) next.delete(field);
      else next.add(field);
      return next;
    });
  // Values can only be removed for fields switched off and saved.
  const stored = states.filter((s) => !s.enabled && s.stored > 0);
  return (
    <Stack gap="md">
      <Panel title={t('personFields.fields')}>
        <DataTable
          exportable={false}
          rows={states}
          rowKey={(s) => s.field}
          columns={[
            { key: 'field', header: t('personFields.columns.field'), render: (s) => localized(PERSON_FIELD_NAMES[s.field]) },
            { key: 'purpose', header: t('personFields.columns.purpose'), render: (s) => <Text size="sm" c="dimmed">{localized(PERSON_FIELD_PURPOSES[s.field])}</Text> },
            { key: 'stored', header: t('personFields.columns.stored'), render: (s) => t('personFields.persons', { count: s.stored }) },
            {
              key: 'active',
              header: t('personFields.columns.active'),
              render: (s) => (
                <Switch
                  aria-label={t('personFields.toggle', { field: localized(PERSON_FIELD_NAMES[s.field]) })}
                  checked={!disabled.has(s.field)}
                  onChange={(e) => toggle(s.field, e.currentTarget.checked)}
                />
              ),
            },
          ]}
        />
        <Group justify="flex-end" mt="md">
          <Button loading={save.isPending} onClick={() => save.mutate(undefined)}>{common('actions.save')}</Button>
        </Group>
      </Panel>
      {stored.length > 0 && (
        <Notice kind="warning">
          <Group justify="space-between" align="center">
            <Text size="sm">{t('personFields.storedHint', { count: stored.reduce((max, s) => Math.max(max, s.stored), 0) })}</Text>
            <Button size="xs" color="red" variant="light" onClick={() => setClearing(true)}>{t('personFields.clear')}</Button>
          </Group>
        </Notice>
      )}
      {clearing && <ClearDialog fields={stored} onClose={() => setClearing(false)} />}
    </Stack>
  );
}

/**
 * Settings „Felder der Personalakte“ (L10 of the data protection concept): optional fields can be switched off; switched-off
 * fields are not shown, not stored and not imported, stored values are removed after a confirmation.
 */
export function PersonFieldsPage() {
  const { t } = useTranslation('masterdata');
  const { data: states } = useQuery({ queryKey: STATES_KEY, queryFn: () => api<PersonFieldState[]>('masterdata/person-fields') });
  return (
    <Stack gap="lg">
      <PageHeader breadcrumbs={[{ label: t('module') }, { label: t('personFields.title') }]} title={t('personFields.title')} subtitle={t('personFields.subtitle')} />
      <Notice kind="info">{t('personFields.intro')}</Notice>
      {states && <FieldsForm key={states.map((s) => `${s.field}:${s.enabled}`).join()} states={states} />}
    </Stack>
  );
}
