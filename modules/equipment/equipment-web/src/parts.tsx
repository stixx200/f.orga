import { Button, FileInput, Group, Text } from '@mantine/core';
import type { Defect, ItemStatus } from '@forga/equipment-contracts';
import { formatDate, upload, useLocalized, useTranslation } from '@forga/web-sdk';
import { Attachments, ResponsiveDialog, StatusBadge, type Tone } from '@forga/web-ui';
import { useDueSoon } from './api';

const TONES: Record<ItemStatus, Tone> = { ready: 'done', 'in-inspection': 'primary', defective: 'error', 'in-repair': 'warning', retired: 'neutral' };

/** Status of the item; "blocked" (overdue inspection in a locking category) wins over "ready". */
export function ItemStatusBadge({ status, blocked = false }: { status: ItemStatus; blocked?: boolean }) {
  const { t } = useTranslation('equipment');
  if (blocked && status !== 'retired') return <StatusBadge tone="error">{t('status.blocked')}</StatusBadge>;
  return <StatusBadge tone={TONES[status]}>{t(`status.${status}`)}</StatusBadge>;
}

/** Next due date with traffic light: red when due, yellow within the configured days; "not recorded yet" without dates. */
export function DueDate({ dueOn, notRecorded = false }: { dueOn: string | null; notRecorded?: boolean }) {
  const { t, i18n } = useTranslation('equipment');
  const { today, soon } = useDueSoon();
  if (!dueOn) return <Text size="sm" c="dimmed">{notRecorded ? t('due.notRecorded') : '–'}</Text>;
  const color = dueOn <= today ? 'red.8' : dueOn <= soon ? 'orange.8' : undefined;
  return <Text size="sm" c={color} fw={color ? 700 : undefined}>{dueOn <= today ? t('due.overdue', { date: formatDate(dueOn, i18n.language) }) : formatDate(dueOn, i18n.language)}</Text>;
}

/** Text of a defect: as reported, or for a finding of an inspection "<inspection type>: <notes or result>". */
export function useDefectText(): (defect: Pick<Defect, 'description' | 'finding'>) => string {
  const { t } = useTranslation('equipment');
  const localized = useLocalized();
  return (d) => (d.finding ? `${localized(d.finding.name)}: ${d.description || t(`result.${d.finding.result}`)}` : d.description);
}

/** Attachments of an inspection or a defect in a dialog. */
export function AttachmentsDialog({ title, type, id, editable, onClose }: { title: string; type: 'equipment.inspection' | 'equipment.defect'; id: string; editable: boolean; onClose: () => void }) {
  const { t: common } = useTranslation('common');
  return (
    <ResponsiveDialog opened onClose={onClose} title={title} actions={<Group justify="flex-end"><Button variant="default" onClick={onClose}>{common('actions.close')}</Button></Group>}>
      <Attachments type={type} id={id} editable={editable} />
    </ResponsiveDialog>
  );
}

/** Optional photo for a new defect; uploaded after the defect has been created. */
export function DefectPhotoInput({ value, onChange }: { value: File | null; onChange: (file: File | null) => void }) {
  const { t } = useTranslation('equipment');
  return <FileInput label={t('defect.photo')} placeholder={t('defect.photoPlaceholder')} accept="image/png,image/jpeg,image/webp" value={value} onChange={onChange} clearable />;
}

export const uploadDefectPhoto = (defectId: string, photo: File | null) => (photo ? upload(`core/attachments?type=equipment.defect&id=${defectId}`, photo) : Promise.resolve(null));
