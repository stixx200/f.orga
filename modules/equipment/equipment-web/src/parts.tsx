import { ActionIcon, Button, FileButton, FileInput, Group, Image, Input, SegmentedControl, Select, Stack, Text, Tooltip } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconNfc } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { type CSSProperties, type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { Attachment } from '@forga/core-contracts';
import type { Defect, InspectionResult, ItemStatus } from '@forga/equipment-contracts';
import { api, apiUrl, formatDate, send, upload, useLocalized, useTranslation } from '@forga/web-sdk';
import { attachmentsKey, Attachments, CodeInput, nfcSupported, readNfc, ResponsiveDialog, StatusBadge, type Tone, useAction } from '@forga/web-ui';
import { useDueSoon, useEquipmentSettings } from './api';

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

/**
 * Station or a configured bookable place (`equipment.settings.locations`). No free text —
 * only values from the dropdown (Mantine Select, never Autocomplete).
 * Choosing a station clears the named place; choosing a named place clears the station.
 * An unknown current `location` (legacy) stays selectable until the user picks something else.
 */
export function LocationField({
  stationId,
  location,
  stations,
  onChange,
  clearable = true,
}: {
  stationId: string | null;
  location: string;
  stations: { id: string; label: string }[];
  onChange: (next: { stationId: string | null; location: string }) => void;
  clearable?: boolean;
}) {
  const { t } = useTranslation('equipment');
  const { data: settings } = useEquipmentSettings();
  const configured = settings?.locations;
  const data = useMemo(() => {
    const names = new Set(configured ?? []);
    if (location && !names.has(location)) names.add(location);
    const places = [...names].toSorted((a, b) => a.localeCompare(b)).map((name) => ({ value: `l:${name}`, label: name }));
    const stationItems = stations.map((s) => ({ value: `s:${s.id}`, label: s.label }));
    // Mantine Select groups are `{ group, items }`, not a `group` field on each option.
    return [
      ...(places.length ? [{ group: t('fields.locationGroup'), items: places }] : []),
      ...(stationItems.length ? [{ group: t('fields.stationGroup'), items: stationItems }] : []),
    ];
  }, [configured, location, stations, t]);
  const options = data.flatMap((g) => g.items);
  const value = stationId ? `s:${stationId}` : location ? `l:${location}` : null;
  return (
    <Select
      label={t('fields.location')}
      description={t('fields.locationHint')}
      data={data}
      value={value && options.some((d) => d.value === value) ? value : null}
      onChange={(next) => {
        if (!next) {
          onChange({ stationId: null, location: '' });
          return;
        }
        // Ignore anything that is not an option value (search text must never become the place).
        if (!options.some((d) => d.value === next)) return;
        if (next.startsWith('s:')) {
          onChange({ stationId: next.slice(2), location: '' });
          return;
        }
        if (next.startsWith('l:')) {
          onChange({ stationId: null, location: next.slice(2) });
        }
      }}
      searchable
      clearable={clearable}
      nothingFoundMessage={t('fields.locationEmpty')}
    />
  );
}

/** Result of an inspection: a labelled select on a phone, a segmented control on a wider screen. */
export function InspectionResultField({ value, onChange }: { value: InspectionResult; onChange: (value: InspectionResult) => void }) {
  const { t } = useTranslation('equipment');
  const phone = useMediaQuery('(max-width: 48em)');
  const data = (['passed', 'passed-with-defects', 'failed'] as const).map((result) => ({ value: result, label: t(`result.${result}`) }));
  return (
    <Input.Wrapper label={t('inspection.result')}>
      {phone ? (
        <Select mt={4} data={data} value={value} onChange={(next) => next && onChange(next as InspectionResult)} allowDeselect={false} />
      ) : (
        <SegmentedControl mt={4} fullWidth value={value} onChange={(next) => onChange(next as InspectionResult)} data={data} />
      )}
    </Input.Wrapper>
  );
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
        repeat
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
