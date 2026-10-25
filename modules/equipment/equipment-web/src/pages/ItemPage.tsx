import { Button, Group, Menu, SimpleGrid, Stack, Tabs, Text, Textarea, TextInput } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { Defect, Inspection, Item, ItemIncident } from '@forga/equipment-contracts';
import { apiUrl, can, formatDate, formatMoney, localDate, send, useLocalized, useSession, useTranslation } from '@forga/web-sdk';
import { DataTable, EmptyState, HistoryTimeline, Notice, PageHeader, Panel, ResponsiveDialog, StatusBadge, useAction } from '@forga/web-ui';
import { INSPECT, keys, READ, useCategoryName, useDefects, useDepartments, useInspections, useItem, useItemIncidents, usePersons, usePlace, WRITE } from '../api';
import { AttachmentsDialog, DefectPhotoInput, DueDate, ItemStatusBadge, uploadDefectPhoto } from '../parts';
import { InspectionDialog } from './InspectionDialog';
import { ItemDialog } from './ItemDialog';

export function DefectDialog({ item, onClose }: { item: Item; onClose: () => void }) {
  const { t } = useTranslation('equipment');
  const { t: common } = useTranslation('common');
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const save = useAction(
    async () => {
      const defect = await send<Defect>('POST', `equipment/items/${item.id}/defects`, { description });
      await uploadDefectPhoto(defect.id, photo);
    },
    { success: t('defect.reported'), invalidate: [keys.all], onSuccess: onClose },
  );
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={t('defect.report')}
      actions={
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button loading={save.isPending} disabled={description.trim().length < 3} onClick={() => save.mutate(undefined)}>{t('defect.send')}</Button>
        </Group>
      }
    >
      <Text size="sm">{item.inventoryNumber} · {item.name}</Text>
      <Textarea label={t('defect.description')} value={description} onChange={(e) => setDescription(e.currentTarget.value)} autosize minRows={3} data-autofocus />
      <DefectPhotoInput value={photo} onChange={setPhoto} />
    </ResponsiveDialog>
  );
}

function RetireDialog({ item, onClose }: { item: Item; onClose: () => void }) {
  const { t } = useTranslation('equipment');
  const { t: common } = useTranslation('common');
  const [form, setForm] = useState(() => ({ date: localDate(), reason: '', disposition: '' }));
  const save = useAction(() => send('POST', `equipment/items/${item.id}/retire`, form), { success: t('item.retired'), invalidate: [keys.all], onSuccess: onClose });
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={t('item.retire')}
      actions={
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button color="red" loading={save.isPending} disabled={!form.reason.trim()} onClick={() => save.mutate(undefined)}>{t('item.retire')}</Button>
        </Group>
      }
    >
      <Text size="sm" c="dimmed">{t('item.retireHint')}</Text>
      <DateInput label={t('item.retireDate')} value={form.date} onChange={(v) => v && setForm({ ...form, date: v })} valueFormat="DD.MM.YYYY" />
      <TextInput label={t('item.retireReason')} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.currentTarget.value })} required />
      <TextInput label={t('item.disposition')} value={form.disposition} onChange={(e) => setForm({ ...form, disposition: e.currentTarget.value })} />
    </ResponsiveDialog>
  );
}

function InspectionsTab({ item, canInspect }: { item: Item; canInspect: boolean }) {
  const { t, i18n } = useTranslation('equipment');
  const localized = useLocalized();
  const { data = [] } = useInspections(item.id);
  const { data: persons = [] } = usePersons();
  const [recording, setRecording] = useState<string | null>(null);
  const [files, setFiles] = useState<Inspection | null>(null);
  const trigger = useAction((inspectionKey: string) => send('POST', `equipment/items/${item.id}/trigger`, { inspectionKey }), { invalidate: [keys.all] });
  const name = (key: string) => {
    const type = item.inspections.find((x) => x.key === key);
    return type ? localized(type.name) : key;
  };
  const inspector = (i: Inspection) => i.inspectorCompany || persons.find((p) => p.id === i.inspectorPersonId)?.lastName || i.recordedBy;
  return (
    <Stack gap="md">
      <Panel title={t('inspection.dues')}>
        <DataTable
          rows={item.dues}
          rowKey={(d) => d.key}
          empty={t('inspection.none')}
          columns={[
            { key: 'name', header: t('inspection.type'), render: (d) => <Text size="sm" fw={700}>{localized(d.name)}</Text> },
            { key: 'trigger', header: t('inspection.trigger'), render: (d) => t(`trigger.${item.inspections.find((x) => x.key === d.key)?.trigger ?? 'periodic'}`) },
            { key: 'last', header: t('inspection.last'), render: (d) => formatDate(d.lastDate, i18n.language) },
            { key: 'due', header: t('inspection.due'), render: (d) => <DueDate dueOn={d.dueOn} /> },
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (d) =>
                canInspect && (
                  <Group gap={4} justify="flex-end" wrap="nowrap">
                    {item.inspections.find((x) => x.key === d.key)?.trigger !== 'periodic' && !d.dueOn && (
                      <Button size="compact-xs" variant="default" onClick={() => trigger.mutate(d.key)}>{t('inspection.makeDue')}</Button>
                    )}
                    <Button size="compact-xs" onClick={() => setRecording(d.key)}>{t('inspection.inspect')}</Button>
                  </Group>
                ),
            },
          ]}
        />
      </Panel>
      <Panel title={t('inspection.history')}>
        <DataTable<Inspection>
          rows={data}
          rowKey={(i) => i.id}
          empty={t('inspection.noHistory')}
          columns={[
            { key: 'date', header: t('inspection.date'), render: (i) => formatDate(i.date, i18n.language) },
            { key: 'type', header: t('inspection.type'), render: (i) => name(i.inspectionKey) },
            { key: 'result', header: t('inspection.result'), render: (i) => <StatusBadge tone={i.result === 'passed' ? 'done' : i.result === 'failed' ? 'error' : 'warning'}>{t(`result.${i.result}`)}</StatusBadge> },
            { key: 'by', header: t('inspection.inspector'), render: (i) => <>{inspector(i)}{i.qualificationWarning && <Text size="xs" c="orange.8">{t('inspection.qualificationWarning')}</Text>}</> },
            { key: 'notes', header: t('inspection.notes'), render: (i) => [i.measurements, i.notes].filter(Boolean).join(' · ') },
            { key: 'next', header: t('inspection.nextDue'), render: (i) => formatDate(i.nextDueOn, i18n.language) },
            {
              key: 'report',
              header: '',
              align: 'right',
              render: (i) => (
                <Group gap={4} justify="flex-end" wrap="nowrap">
                  <Button size="compact-xs" variant="subtle" onClick={() => setFiles(i)}>{t('attachmentsButton')}</Button>
                  <Button size="compact-xs" variant="subtle" component="a" href={apiUrl('core/lists/equipment.inspection-report/export/pdf', { inspectionId: i.id, lang: i18n.language })} target="_blank">{t('protocol.single')}</Button>
                </Group>
              ),
            },
          ]}
        />
      </Panel>
      {recording && <InspectionDialog item={item} inspectionKey={recording} onClose={() => setRecording(null)} />}
      {files && <AttachmentsDialog title={`${name(files.inspectionKey)} · ${formatDate(files.date, i18n.language)}`} type="equipment.inspection" id={files.id} editable={canInspect} onClose={() => setFiles(null)} />}
    </Stack>
  );
}

function DefectsTab({ item, canWrite }: { item: Item; canWrite: boolean }) {
  const { t, i18n } = useTranslation('equipment');
  const { data = [] } = useDefects({ itemId: item.id });
  const [files, setFiles] = useState<Defect | null>(null);
  return (
    <>
    <DataTable<Defect>
      rows={data}
      rowKey={(d) => d.id}
      empty={t('defect.none')}
      columns={[
        { key: 'date', header: t('defect.reportedAt'), render: (d) => formatDate(d.reportedAt, i18n.language) },
        { key: 'description', header: t('defect.description'), render: (d) => <><Text size="sm">{d.description}</Text>{d.resolution && <Text size="xs" c="dimmed">{d.resolution}</Text>}</> },
        { key: 'by', header: t('defect.by'), render: (d) => d.reportedBy },
        { key: 'status', header: t('fields.status'), render: (d) => <StatusBadge tone={d.status === 'fixed' ? 'done' : d.status === 'retired' ? 'neutral' : 'error'}>{t(`defectStatus.${d.status}`)}</StatusBadge> },
        { key: 'files', header: '', align: 'right', render: (d) => <Button size="compact-xs" variant="subtle" onClick={() => setFiles(d)}>{t('attachmentsButton')}</Button> },
      ]}
    />
    {files && <AttachmentsDialog title={files.description} type="equipment.defect" id={files.id} editable={canWrite} onClose={() => setFiles(null)} />}
    </>
  );
}

/** Incident reports the item was used in; a click opens the report. */
function IncidentsTab({ item }: { item: Item }) {
  const { t, i18n } = useTranslation('equipment');
  const navigate = useNavigate();
  const { data = [], isLoading } = useItemIncidents(item.id);
  return (
    <DataTable<ItemIncident>
      rows={data}
      rowKey={(u) => u.reportId}
      onRowClick={(u) => navigate(`/incidents/reports/${u.reportId}`)}
      empty={isLoading ? t('loading') : t('incident.none')}
      columns={[
        { key: 'date', header: t('incident.date'), render: (u) => formatDate(u.alarmedAt, i18n.language) },
        { key: 'keyword', header: t('incident.keyword'), render: (u) => <><Text size="sm" fw={700}>{u.alarmKeyword}</Text><Text size="xs" c="dimmed">{u.dispatchNumber} · {u.reportNumber}</Text></> },
        { key: 'location', header: t('incident.location'), render: (u) => u.location },
        { key: 'quantity', header: t('incident.quantity'), align: 'right', render: (u) => u.quantity },
        { key: 'inspect', header: '', render: (u) => u.inspectAfter && <StatusBadge tone="warning">{t('incident.inspectAfter')}</StatusBadge> },
      ]}
    />
  );
}

/** Equipment file: master data, inspections, defects, history; QR code for mobile use. */
export function ItemPage() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation('equipment');
  const session = useSession().data;
  const category = useCategoryName();
  const place = usePlace();
  const { data: departments = [] } = useDepartments();
  const { data: item, isLoading } = useItem(id);
  const [dialog, setDialog] = useState<'edit' | 'inspect' | 'defect' | 'retire' | null>(null);
  const status = useAction((next: string) => send('PUT', `equipment/items/${id}/status`, { status: next }), { invalidate: [keys.all] });
  if (!item) return isLoading ? null : <EmptyState title={t('item.notFound')} />;

  const may = (permission: string) => can(session, permission, item.departmentId);
  const retired = item.status === 'retired';
  const link = `${window.location.origin}/equipment/items/${item.id}`;
  const fields: [string, string][] = [
    [t('fields.category'), category(item.categoryKey)],
    [t('fields.department'), departments.find((d) => d.id === item.departmentId)?.name ?? ''],
    [t('fields.place'), place(item)],
    [t('fields.serialNumber'), item.serialNumber],
    [t('fields.manufacturer'), item.manufacturer],
    [t('fields.yearBuilt'), item.yearBuilt ? String(item.yearBuilt) : ''],
    [t('fields.purchasedOn'), formatDate(item.purchasedOn, i18n.language)],
    [t('fields.price'), item.price !== null ? formatMoney(item.price, i18n.language) : ''],
    [t('fields.quantity'), item.quantity > 1 ? String(item.quantity) : ''],
    [t('fields.expiresOn'), formatDate(item.expiresOn, i18n.language)],
    ...Object.entries(item.properties),
    [t('fields.notes'), item.notes],
  ];

  return (
    <Stack gap="lg">
      <PageHeader
        breadcrumbs={[{ label: t('module') }, { label: t('items.title'), to: '/equipment/items' }, { label: item.inventoryNumber }]}
        title={item.name}
        badges={<Group gap={4}><ItemStatusBadge status={item.status} /><StatusBadge>{item.inventoryNumber}</StatusBadge></Group>}
        subtitle={place(item)}
        actions={
          !retired && (
            <Group gap="sm">
              <Button variant="default" onClick={() => setDialog('defect')}>{t('defect.report')}</Button>
              {may(INSPECT) && item.inspections.length > 0 && <Button onClick={() => setDialog('inspect')}>{t('inspection.inspect')}</Button>}
              {may(WRITE) && (
                <Menu position="bottom-end">
                  <Menu.Target><Button variant="default">{t('item.more')}</Button></Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item onClick={() => setDialog('edit')}>{t('item.edit')}</Menu.Item>
                    {(['ready', 'in-inspection', 'defective', 'in-repair'] as const).filter((s) => s !== item.status).map((s) => (
                      <Menu.Item key={s} onClick={() => status.mutate(s)}>{t('item.setStatus', { status: t(`status.${s}`) })}</Menu.Item>
                    ))}
                    <Menu.Item color="red" onClick={() => setDialog('retire')}>{t('item.retire')}</Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              )}
            </Group>
          )
        }
      />
      {retired && item.retirement && <Notice kind="info">{t('item.retiredOn', { date: formatDate(item.retirement.date, i18n.language), reason: item.retirement.reason })}</Notice>}
      {item.openDefects > 0 && <Notice kind="error">{t('item.openDefects', { count: item.openDefects })}</Notice>}
      {may(READ) ? (
        <Tabs defaultValue="data" keepMounted={false}>
          <Tabs.List mb="md">
            <Tabs.Tab value="data">{t('item.tabs.data')}</Tabs.Tab>
            <Tabs.Tab value="inspections">{t('item.tabs.inspections')}</Tabs.Tab>
            <Tabs.Tab value="defects">{t('item.tabs.defects')}</Tabs.Tab>
            <Tabs.Tab value="incidents">{t('item.tabs.incidents')}</Tabs.Tab>
            <Tabs.Tab value="history">{t('item.tabs.history')}</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="data">
            <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg">
              <Panel style={{ gridColumn: 'span 2' }}>
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
                  {fields.filter(([, v]) => v).map(([label, value]) => (
                    <div key={label}><Text size="xs" c="dimmed">{label}</Text><Text size="sm">{value}</Text></div>
                  ))}
                </SimpleGrid>
              </Panel>
              <Panel title={t('item.qr')}>
                <Stack align="center" gap={4}>
                  <QRCodeSVG value={link} size={140} />
                  <Text size="xs" fw={700}>{item.inventoryNumber}</Text>
                  <Text size="xs" c="dimmed" ta="center">{t('item.qrHint')}</Text>
                </Stack>
              </Panel>
            </SimpleGrid>
          </Tabs.Panel>
          <Tabs.Panel value="inspections"><InspectionsTab item={item} canInspect={may(INSPECT) && !retired} /></Tabs.Panel>
          <Tabs.Panel value="defects"><DefectsTab item={item} canWrite={may(WRITE)} /></Tabs.Panel>
          <Tabs.Panel value="incidents"><IncidentsTab item={item} /></Tabs.Panel>
          <Tabs.Panel value="history"><HistoryTimeline entity="equipment.item" id={item.id} /></Tabs.Panel>
        </Tabs>
      ) : (
        <Notice kind="info">{t('item.reportOnly')}</Notice>
      )}
      {dialog === 'edit' && <ItemDialog item={item} onClose={() => setDialog(null)} />}
      {dialog === 'inspect' && <InspectionDialog item={item} onClose={() => setDialog(null)} />}
      {dialog === 'defect' && <DefectDialog item={item} onClose={() => setDialog(null)} />}
      {dialog === 'retire' && <RetireDialog item={item} onClose={() => setDialog(null)} />}
    </Stack>
  );
}
