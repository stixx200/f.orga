import { ActionIcon, Button, FileButton, FileInput, Group, Image, Stack, Text, Tooltip } from '@mantine/core';
import { IconNfc } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { type CSSProperties, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import type { Attachment } from '@forga/core-contracts';
import type { Defect, ItemStatus } from '@forga/equipment-contracts';
import { api, apiUrl, formatDate, send, upload, useLocalized, useTranslation } from '@forga/web-sdk';
import { attachmentsKey, Attachments, CodeInput, nfcSupported, readNfc, ResponsiveDialog, StatusBadge, type Tone, useAction } from '@forga/web-ui';
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

/** One photo of the item. A new file replaces the previous one. */
export function ItemPhoto({ id, editable }: { id: string; editable: boolean }) {
  const { t } = useTranslation('equipment');
  const key = attachmentsKey('equipment.item', id);
  const { data = [] } = useQuery({ queryKey: key, queryFn: () => api<Attachment[]>(`core/attachments?type=equipment.item&id=${encodeURIComponent(id)}`) });
  const photo = data.find((a) => a.contentType.startsWith('image/'));
  const add = useAction((file: File) => upload<Attachment>(`core/attachments?type=equipment.item&id=${encodeURIComponent(id)}`, file), { invalidate: [key] });
  const remove = useAction((attachment: string) => send('DELETE', `core/attachments/${attachment}`), { invalidate: [key] });
  const url = photo ? apiUrl(`core/attachments/${photo.id}/file`) : undefined;
  return (
    <Stack align="center" gap="xs">
      {url ? <Image src={url} alt="" w={160} h={160} fit="contain" radius="sm" /> : <Text size="sm" c="dimmed">{t('item.noPhoto')}</Text>}
      {editable && (
        <FileButton accept="image/png,image/jpeg,image/webp" onChange={(file) => file && add.mutate(file)}>
          {(props) => <Button size="xs" variant="default" loading={add.isPending} {...props}>{photo ? t('item.replacePhoto') : t('item.addPhoto')}</Button>}
        </FileButton>
      )}
      {editable && photo && (
        <Button size="xs" variant="subtle" color="red" loading={remove.isPending} onClick={() => remove.mutate(photo.id)}>{t('item.removePhoto')}</Button>
      )}
    </Stack>
  );
}

/** Protocol of an inspection (PDF or photo); uploaded after the inspection has been created. */
export function ProtocolInput({ value, onChange }: { value: File | null; onChange: (file: File | null) => void }) {
  const { t } = useTranslation('equipment');
  return <FileInput label={t('inspection.protocol')} placeholder={t('inspection.protocolPlaceholder')} accept="application/pdf,image/png,image/jpeg,image/webp" value={value} onChange={onChange} clearable />;
}

export const uploadInspectionProtocol = (inspectionId: string, file: File | null) =>
  file ? upload(`core/attachments?type=equipment.inspection&id=${inspectionId}`, file) : Promise.resolve(null);

/**
 * Field for scanning items: hand scanners and RFID readers type into it and end with Enter, the phone camera and
 * NFC fill it at once. Each code is passed on and the field is cleared.
 */
export function ScanField({ onCode, ...props }: { onCode: (code: string) => void; label?: string; style?: CSSProperties }) {
  const { t } = useTranslation('equipment');
  const { t: common } = useTranslation('common');
  const [value, setValue] = useState('');
  const [reading, setReading] = useState<AbortController | null>(null);
  const report = useRef(onCode);
  useEffect(() => {
    report.current = onCode;
  });
  useEffect(() => () => reading?.abort(), [reading]);
  const submit = (code: string) => {
    if (code.trim()) report.current(code.trim());
    setValue('');
  };
  const change = (next: string) => {
    if (next.length - value.length > 1) submit(next);
    else setValue(next);
  };
  const nfc = () => {
    if (reading) {
      reading.abort();
      setReading(null);
      return;
    }
    const controller = new AbortController();
    setReading(controller);
    readNfc(controller.signal)
      .then(submit)
      .catch(() => undefined)
      .finally(() => {
        controller.abort();
        setReading(null);
      });
  };
  return (
    <Group gap="xs" align="end" wrap="nowrap" style={props.style}>
      <CodeInput
        label={props.label ?? t('scan.label')}
        placeholder={t('scan.placeholder')}
        value={value}
        onChange={change}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit(value);
          }
        }}
        source="camera"
        style={{ flex: 1 }}
      />
      {nfcSupported() && (
        <Tooltip label={reading ? common('codes.nfcWaiting') : common('codes.nfc')}>
          <ActionIcon size="lg" mb={2} variant={reading ? 'filled' : 'default'} onClick={nfc} aria-label={common('codes.nfc')}>
            <IconNfc size={18} />
          </ActionIcon>
        </Tooltip>
      )}
    </Group>
  );
}
