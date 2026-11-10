import { ActionIcon, Button, Checkbox, Group, NumberInput, Select, Stack, TagsInput, Text, Textarea, TextInput } from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import type { FormAnswer, FormField, InspectionForm, InspectionFieldType, RecordedForm } from '@forga/equipment-contracts';
import { formatDate, useLocalized, useTranslation } from '@forga/web-sdk';
import { Attachments, ResponsiveDialog } from '@forga/web-ui';
import { useInspectionCatalog } from './api';

export type FormValue = string | number | boolean | null;
export type FormValues = Record<string, FormValue>;

/** Starting values of a form: the recorded values for a correction, otherwise empty (a checkbox off). */
export function initialValues(fields: FormField[], recorded?: RecordedForm | null): FormValues {
  const recordedFields = recorded?.kind === 'fillable' ? recorded.fields : [];
  return Object.fromEntries(fields.map((field) => [field.id, recordedFields.find((r) => r.id === field.id)?.value ?? (field.type === 'checkbox' ? false : null)]));
}

/** Answers as the server takes them (one per field of the form). */
export const toAnswers = (fields: FormField[], values: FormValues): FormAnswer[] => fields.map((field) => ({ id: field.id, value: values[field.id] ?? (field.type === 'checkbox' ? false : null) }));

/** A required field is empty (a required checkbox must be ticked). */
export const missingRequired = (fields: FormField[], values: FormValues): boolean =>
  fields.some((field) => field.required && (field.type === 'checkbox' ? values[field.id] !== true : values[field.id] === null || values[field.id] === undefined || values[field.id] === ''));

/** Inputs of a fillable form, in the order of the form. */
export function FormInputs({ fields, values, onChange }: { fields: FormField[]; values: FormValues; onChange: (values: FormValues) => void }) {
  const localized = useLocalized();
  return (
    <Stack gap="sm">
      {fields.map((field) => {
        const value = values[field.id] ?? null;
        const set = (next: FormValue) => onChange({ ...values, [field.id]: next });
        const label = localized(field.label);
        if (field.type === 'checkbox') return <Checkbox key={field.id} label={label} checked={value === true} onChange={(e) => set(e.currentTarget.checked)} />;
        if (field.type === 'number') {
          return (
            <NumberInput
              key={field.id}
              label={field.unit ? `${label} (${field.unit})` : label}
              value={typeof value === 'number' ? value : ''}
              onChange={(next) => set(typeof next === 'number' ? next : null)}
              required={field.required}
              aria-label={label}
            />
          );
        }
        if (field.type === 'choice') {
          return <Select key={field.id} label={label} data={field.choices} value={typeof value === 'string' ? value : null} onChange={(next) => set(next)} required={field.required} clearable />;
        }
        return <TextInput key={field.id} label={label} value={typeof value === 'string' ? value : ''} onChange={(e) => set(e.currentTarget.value)} required={field.required} />;
      })}
    </Stack>
  );
}

/** The recorded form of an inspection (values as recorded, or the approval), for the item page and the history. */
export function RecordedFormText({ form }: { form: RecordedForm | null }) {
  const localized = useLocalized();
  const { t, i18n } = useTranslation('equipment');
  if (!form) return null;
  if (form.kind === 'approval') return <Text size="xs" c="dimmed">{t('form.approvedBy', { name: form.approvedBy, date: formatDate(form.approvedAt.slice(0, 10), i18n.language) })}</Text>;
  const shown = (field: (typeof form.fields)[number]) => {
    if (field.type === 'checkbox') return field.value ? t('form.yes') : t('form.no');
    if (field.value === null || field.value === '') return '–';
    return `${field.value}${field.unit ? ` ${field.unit}` : ''}`;
  };
  return <Text size="xs" c="dimmed">{form.fields.map((field) => `${localized(field.label)}: ${shown(field)}`).join(' · ')}</Text>;
}

/** Opens the document (test instructions, PDF) attached to an inspection type of the catalog. */
export function RoutineDocumentButton({ inspectionKey }: { inspectionKey: string }) {
  const { t } = useTranslation('equipment');
  const { t: common } = useTranslation('common');
  const { data: catalog = [] } = useInspectionCatalog();
  const [open, setOpen] = useState(false);
  const entry = catalog.find((x) => x.key === inspectionKey);
  if (!entry || entry.form.kind !== 'document') return null;
  return (
    <>
      <Button size="compact-xs" variant="subtle" onClick={() => setOpen(true)}>{t('form.document')}</Button>
      {open && (
        <ResponsiveDialog opened onClose={() => setOpen(false)} title={t('form.document')} actions={<Group justify="flex-end"><Button variant="default" onClick={() => setOpen(false)}>{common('actions.close')}</Button></Group>}>
          <Attachments type="equipment.inspection-type" id={entry.id} />
        </ResponsiveDialog>
      )}
    </>
  );
}

const FIELD_TYPES: InspectionFieldType[] = ['text', 'number', 'checkbox', 'choice'];

/** Editor of the form of an inspection type in the settings: none, document, fillable fields or an approval text. */
export function FormEditor({ form, onChange, documentHint }: { form: InspectionForm; onChange: (form: InspectionForm) => void; documentHint?: string }) {
  const { t } = useTranslation('equipment');
  const kind = form.kind;
  const setKind = (next: InspectionForm['kind']) => {
    onChange(
      next === 'none' || next === 'document'
        ? { kind: next }
        : next === 'approval'
          ? { kind: 'approval', text: { de: '', en: '' } }
          : { kind: 'fillable', fields: form.kind === 'fillable' && form.fields.length ? form.fields : [newField()] },
    );
  };
  return (
    <Stack gap="sm">
      <Select
        label={t('catalog.formKind')}
        data={[
          { value: 'none', label: t('catalog.kindNone') },
          { value: 'document', label: t('catalog.kindDocument') },
          { value: 'fillable', label: t('catalog.kindFillable') },
          { value: 'approval', label: t('catalog.kindApproval') },
        ]}
        value={kind}
        onChange={(v) => v && setKind(v as InspectionForm['kind'])}
        allowDeselect={false}
      />
      {kind === 'document' && <Text size="sm" c="dimmed">{documentHint ?? t('catalog.documentHint')}</Text>}
      {form.kind === 'approval' && <ApprovalText form={form} onChange={onChange} />}
      {form.kind === 'fillable' && <FieldsEditor fields={form.fields} onChange={(fields) => onChange({ kind: 'fillable', fields })} />}
    </Stack>
  );
}

/** Empty field with a new ID (the ID stays with the field: recorded values refer to it). */
function newField(): FormField {
  return { id: `field-${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`, label: { de: '', en: '' }, type: 'text', unit: '', choices: [], required: false };
}

function ApprovalText({ form, onChange }: { form: Extract<InspectionForm, { kind: 'approval' }>; onChange: (form: InspectionForm) => void }) {
  const { t } = useTranslation('equipment');
  return (
    <Stack gap="xs">
      <Textarea label={t('catalog.approvalText')} value={form.text.de} onChange={(e) => onChange({ kind: 'approval', text: { de: e.currentTarget.value, en: form.text.en } })} autosize minRows={3} />
      <Textarea label={t('catalog.approvalTextEn')} value={form.text.en} onChange={(e) => onChange({ kind: 'approval', text: { de: form.text.de, en: e.currentTarget.value } })} autosize minRows={2} />
    </Stack>
  );
}

function FieldsEditor({ fields, onChange }: { fields: FormField[]; onChange: (fields: FormField[]) => void }) {
  const { t } = useTranslation('equipment');
  const update = (index: number, change: Partial<FormField>) => onChange(fields.map((f, i) => (i === index ? { ...f, ...change } : f)));
  const move = (index: number, by: number) => {
    const target = index + by;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  return (
    <Stack gap="sm">
      <Text size="sm" fw={700}>{t('catalog.fields')}</Text>
      <Text size="xs" c="dimmed">{t('catalog.fieldsHint')}</Text>
      {!fields.length && <Text size="sm" c="dimmed">{t('catalog.noFields')}</Text>}
      {fields.map((field, index) => (
        <Stack key={field.id} gap={6} p="sm" style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 6 }}>
          <Group grow align="end" wrap="wrap">
            <TextInput label={t('catalog.fieldLabelDe')} value={field.label.de} onChange={(e) => update(index, { label: { ...field.label, de: e.currentTarget.value } })} />
            <TextInput label={t('catalog.fieldLabelEn')} value={field.label.en} onChange={(e) => update(index, { label: { ...field.label, en: e.currentTarget.value } })} />
          </Group>
          <Group grow align="end" wrap="wrap">
            <Select label={t('catalog.fieldType')} data={FIELD_TYPES.map((x) => ({ value: x, label: t(`fieldType.${x}`) }))} value={field.type} onChange={(v) => v && update(index, { type: v as InspectionFieldType })} allowDeselect={false} />
            {field.type === 'number' && <TextInput label={t('catalog.fieldUnit')} value={field.unit} onChange={(e) => update(index, { unit: e.currentTarget.value })} />}
            {field.type === 'choice' && <TagsInput label={t('catalog.fieldChoices')} description={t('catalog.fieldChoicesHint')} value={field.choices} onChange={(choices) => update(index, { choices })} />}
            <Checkbox label={t('catalog.fieldRequired')} checked={field.required} onChange={(e) => update(index, { required: e.currentTarget.checked })} />
          </Group>
          <Group gap={4} justify="flex-end">
            <ActionIcon variant="subtle" aria-label={t('catalog.moveUp')} disabled={index === 0} onClick={() => move(index, -1)}><IconArrowUp size={16} /></ActionIcon>
            <ActionIcon variant="subtle" aria-label={t('catalog.moveDown')} disabled={index === fields.length - 1} onClick={() => move(index, 1)}><IconArrowDown size={16} /></ActionIcon>
            <ActionIcon variant="subtle" color="red" aria-label={t('catalog.removeField')} onClick={() => onChange(fields.filter((_, i) => i !== index))}><IconTrash size={16} /></ActionIcon>
          </Group>
        </Stack>
      ))}
      <Group>
        <Button size="xs" variant="default" onClick={() => onChange([...fields, newField()])}>{t('catalog.addField')}</Button>
      </Group>
    </Stack>
  );
}

/** Whether the form can be saved: labels, approval text and choices filled in. */
export function formComplete(form: InspectionForm): boolean {
  if (form.kind === 'approval') return Boolean(form.text.de.trim());
  if (form.kind === 'fillable') return form.fields.every((f) => f.label.de.trim() && (f.type !== 'choice' || f.choices.length > 0));
  return true;
}
