import { Button, Group, Menu, SimpleGrid, Stack, Tabs, Text, Textarea, TextInput } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import type { Defect, Inspection, Item, ItemIncident, ItemSummary } from '@forga/equipment-contracts';
import { apiUrl, can, formatDate, formatMoney, localDate, send, useLocalized, useSession, useTranslation } from '@forga/web-sdk';
import { Attachments, DataTable, EmptyState, HistoryTimeline, Notice, PageHeader, Panel, ResponsiveDialog, StatusBadge, useAction } from '@forga/web-ui';
import { keys, READ, useCategoryName, useDefects, useDepartments, useInspections, useItem, useItemAccess, useItemIncidents, useLabelBase, usePersons, usePlace } from '../api';
import { AttachmentsDialog, DefectPhotoInput, DueDate, ItemPhoto, ItemStatusBadge, uploadDefectPhoto, useDefectText } from '../parts';
import { InspectionDialog } from './InspectionDialog';
import { ItemDialog } from './ItemDialog';

const TABS = ['data', 'inspections', 'defects', 'incidents', 'history'] as const;

export function DefectDialog({ item, onClose }: { item: Pick<Item, 'id' | 'inventoryNumber' | 'name'>; onClose: () => void }) {
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
      <DateInput label={t('item.retireDate')} value={form.date} onChange={(v) => v && setForm({ ...form, date: v })} valueFormat="DD.MM.YYYY" maxDate={localDate()} />
      <TextInput label={t('item.retireReason')} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.currentTarget.value })} required />
      <TextInput label={t('item.disposition')} value={form.disposition} onChange={(e) => setForm({ ...form, disposition: e.currentTarget.value })} />
    </ResponsiveDialog>
  );
}

/** Cancels an inspection recorded by mistake; it stays in the history with the reason. */
function CancelInspectionDialog({ inspection, title, onClose }: { inspection: Inspection; title: string; onClose: () => void }) {
  const { t } = useTranslation('equipment');
  const { t: common } = useTranslation('common');
  const [reason, setReason] = useState('');
  const save = useAction(() => send('POST', `equipment/inspections/${inspection.id}/cancel`, { reason }), { success: t('inspection.cancelled'), invalidate: [keys.all], onSuccess: onClose });
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={t('inspection.cancel')}
      actions={
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button color="red" loading={save.isPending} disabled={reason.trim().length < 3} onClick={() => save.mutate(undefined)}>{t('inspection.cancel')}</Button>
        </Group>
      }
    >
      <Text size="sm">{title}</Text>
      <Text size="sm" c="dimmed">{t('inspection.cancelHint')}</Text>
      <TextInput label={t('inspection.reason')} value={reason} onChange={(e) => setReason(e.currentTarget.value)} required data-autofocus />
    </ResponsiveDialog>
  );
}

function InspectionsTab({ item, canInspect }: { item: Item; canInspect: boolean }) {
  const { t, i18n } = useTranslation('equipment');
  const localized = useLocalized();
  const { data = [] } = useInspections(item.id);
  const { data: persons = [] } = usePersons();
  const [recording, setRecording] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState<Inspection | null>(null);
  const [cancelling, setCancelling] = useState<Inspection | null>(null);
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
            {
              key: 'interval',
              header: t('inspection.interval'),
              render: (d) => {
                const months = item.inspections.find((x) => x.key === d.key)?.intervalMonths;
                return months ? `${t('inspection.months', { count: months })}${item.intervalOverrides[d.key] ? ` (${t('inspection.overridden')})` : ''}` : '–';
              },
            },
            { key: 'last', header: t('inspection.last'), render: (d) => formatDate(d.lastDate, i18n.language) },
            { key: 'due', header: t('inspection.due'), render: (d) => <DueDate dueOn={d.dueOn} notRecorded={d.notRecorded} /> },
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
            { key: 'date', header: t('inspection.date'), render: (i) => <Text size="sm" td={i.cancelled ? 'line-through' : undefined}>{formatDate(i.date, i18n.language)}</Text> },
            { key: 'type', header: t('inspection.type'), render: (i) => name(i.inspectionKey) },
            {
              key: 'result',
              header: t('inspection.result'),
              render: (i) =>
                i.cancelled ? <StatusBadge tone="neutral">{t('inspection.cancelledBadge')}</StatusBadge> : <StatusBadge tone={i.result === 'passed' ? 'done' : i.result === 'failed' ? 'error' : 'warning'}>{t(`result.${i.result}`)}</StatusBadge>,
            },
            { key: 'by', header: t('inspection.inspector'), render: (i) => <>{inspector(i)}{i.qualificationWarning && <Text size="xs" c="orange.8">{t('inspection.qualificationWarning')}</Text>}</> },
            {
              key: 'notes',
              header: t('inspection.notes'),
              render: (i) => (
                <>
                  {[i.measurements, i.notes].filter(Boolean).join(' · ')}
                  {i.changeReason && <Text size="xs" c="dimmed">{t(i.cancelled ? 'inspection.cancelReason' : 'inspection.correctionReason', { reason: i.changeReason })}</Text>}
                </>
              ),
            },
            { key: 'next', header: t('inspection.nextDue'), render: (i) => formatDate(i.nextDueOn, i18n.language) },
            {
              key: 'report',
              header: '',
              align: 'right',
              render: (i) => (
                <Group gap={4} justify="flex-end" wrap="nowrap">
                  <Button size="compact-xs" variant="subtle" onClick={() => setFiles(i)}>{t('attachmentsButton')}</Button>
                  <Button size="compact-xs" variant="subtle" component="a" href={apiUrl('core/lists/equipment.inspection-report/export/pdf', { inspectionId: i.id, lang: i18n.language })} target="_blank">{t('protocol.single')}</Button>
                  {canInspect && !i.cancelled && (
                    <Menu position="bottom-end">
                      <Menu.Target><Button size="compact-xs" variant="subtle">{t('item.more')}</Button></Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item onClick={() => setCorrecting(i)}>{t('inspection.correct')}</Menu.Item>
                        <Menu.Item color="red" onClick={() => setCancelling(i)}>{t('inspection.cancel')}</Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  )}
                </Group>
              ),
            },
          ]}
        />
      </Panel>
      {recording && <InspectionDialog item={item} inspectionKey={recording} onClose={() => setRecording(null)} />}
      {correcting && <InspectionDialog item={item} inspection={correcting} onClose={() => setCorrecting(null)} />}
      {cancelling && <CancelInspectionDialog inspection={cancelling} title={`${name(cancelling.inspectionKey)} · ${formatDate(cancelling.date, i18n.language)}`} onClose={() => setCancelling(null)} />}
      {files && <AttachmentsDialog title={`${name(files.inspectionKey)} · ${formatDate(files.date, i18n.language)}`} type="equipment.inspection" id={files.id} editable={canInspect} onClose={() => setFiles(null)} />}
    </Stack>
  );
}

function DefectsTab({ item, canWrite }: { item: Item; canWrite: boolean }) {
  const { t, i18n } = useTranslation('equipment');
  const { data = [] } = useDefects({ itemId: item.id });
  const text = useDefectText();
  const [files, setFiles] = useState<Defect | null>(null);
  return (
    <>
      <DataTable<Defect>
        rows={data}
        rowKey={(d) => d.id}
        empty={t('defect.none')}
        columns={[
          { key: 'date', header: t('defect.reportedAt'), render: (d) => formatDate(d.reportedAt, i18n.language) },
          { key: 'description', header: t('defect.description'), render: (d) => <><Text size="sm">{text(d)}</Text>{d.resolution && <Text size="xs" c="dimmed">{d.resolution}</Text>}</> },
          { key: 'by', header: t('defect.by'), render: (d) => d.reportedBy },
          { key: 'status', header: t('fields.status'), render: (d) => <StatusBadge tone={d.status === 'fixed' ? 'done' : d.status === 'retired' || d.status === 'withdrawn' ? 'neutral' : 'error'}>{t(`defectStatus.${d.status}`)}</StatusBadge> },
          { key: 'files', header: '', align: 'right', render: (d) => <Button size="compact-xs" variant="subtle" onClick={() => setFiles(d)}>{t('attachmentsButton')}</Button> },
        ]}
      />
      {files && <AttachmentsDialog title={text(files)} type="equipment.defect" id={files.id} editable={canWrite} onClose={() => setFiles(null)} />}
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

/** Members who may only report defects: name, number, status (also "blocked") and "report a defect" (from a scanned label). */
function ReportOnlyPage({ item, reporting, setReporting }: { item: ItemSummary; reporting: boolean; setReporting: (on: boolean) => void }) {
  const { t } = useTranslation('equipment');
  return (
    <Stack gap="lg">
      <PageHeader
        breadcrumbs={[{ label: t('module') }, { label: item.inventoryNumber }]}
        title={item.name}
        badges={<Group gap={4}><ItemStatusBadge status={item.status} blocked={item.blocked} /><StatusBadge>{item.inventoryNumber}</StatusBadge></Group>}
        actions={item.status !== 'retired' && <Button onClick={() => setReporting(true)}>{t('defect.report')}</Button>}
      />
      {(item.blocked || item.status === 'defective' || item.status === 'in-repair') && item.status !== 'retired' && <Notice kind="error">{t('item.notReady')}</Notice>}
      <Panel title={t('item.photo')}><ItemPhoto id={item.id} editable={false} /></Panel>
      <Notice kind="info">{t('item.reportOnly')}</Notice>
      {reporting && <DefectDialog item={item} onClose={() => setReporting(false)} />}
    </Stack>
  );
}

/** Equipment file: master data, inspections, defects, history; QR code for mobile use. `?tab=` opens a tab, `?report=defect` the defect dialog. */
export function ItemPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const { t, i18n } = useTranslation('equipment');
  const { t: common } = useTranslation('common');
  const navigate = useNavigate();
  const session = useSession().data;
  const category = useCategoryName();
  const place = usePlace();
  const access = useItemAccess();
  const { base } = useLabelBase();
  const { data: departments = [] } = useDepartments();
  const { data: item, isLoading } = useItem(id);
  const [dialog, setDialog] = useState<'edit' | 'inspect' | 'defect' | 'retire' | null>(() => (params.get('report') === 'defect' ? 'defect' : null));
  const status = useAction((next: string) => send('PUT', `equipment/items/${id}/status`, { status: next }), { invalidate: [keys.all] });
  const tab = TABS.find((x) => x === params.get('tab')) ?? 'data';
  if (!item) return isLoading ? null : <EmptyState title={t('item.notFound')} />;
  if ('reportOnly' in item) return <ReportOnlyPage item={item} reporting={dialog === 'defect'} setReporting={(on) => setDialog(on ? 'defect' : null)} />;

  const may = (permission: string) => can(session, permission, item.departmentId);
  const canWrite = access.canWrite(item);
  const canInspect = access.canInspect(item);
  const retired = item.status === 'retired';
  const link = `${base}/equipment/items/${item.id}`;
  const fields: [string, string][] = [
    [t('fields.category'), category(item.categoryKey)],
    [t('fields.department'), departments.find((d) => d.id === item.departmentId)?.name ?? ''],
    [t('fields.place'), place(item)],
    [t('fields.serialNumber'), item.serialNumber],
    [common('codes.barcode'), item.barcode ?? ''],
    [common('codes.rfid'), item.rfid ?? ''],
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
        badges={<Group gap={4}><ItemStatusBadge status={item.status} blocked={item.blocked} /><StatusBadge>{item.inventoryNumber}</StatusBadge></Group>}
        subtitle={place(item)}
        actions={
          !retired && (
            <Group gap="sm">
              <Button variant="default" onClick={() => setDialog('defect')}>{t('defect.report')}</Button>
              {canInspect && item.inspections.length > 0 && <Button onClick={() => setDialog('inspect')}>{t('inspection.inspect')}</Button>}
              {canWrite && <Button variant="default" onClick={() => setDialog('edit')}>{t('item.edit')}</Button>}
              {canWrite && (
                <Menu position="bottom-end">
                  <Menu.Target><Button variant="default">{t('item.more')}</Button></Menu.Target>
                  <Menu.Dropdown>
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
      {item.blocked && !retired && <Notice kind="error">{t('item.blocked')}</Notice>}
      {item.status === 'in-inspection' && <Notice kind="warning">{t('item.awaitingInspection')}</Notice>}
      {item.openDefects > 0 && <Notice kind="error">{t('item.openDefects', { count: item.openDefects })}</Notice>}
      {may(READ) ? (
        <Tabs value={tab} onChange={(v) => setParams((p) => { p.set('tab', v ?? 'data'); p.delete('report'); return p; }, { replace: true })} keepMounted={false}>
          <Tabs.List mb="md">
            {TABS.map((x) => <Tabs.Tab key={x} value={x}>{t(`item.tabs.${x}`)}</Tabs.Tab>)}
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
              <Stack gap="lg">
                <Panel title={t('item.photo')}>
                  <ItemPhoto id={item.id} editable={canWrite && !retired} />
                  <Text size="xs" c="dimmed" ta="center">{t('item.sharedFiles')}</Text>
                </Panel>
                <Panel title={t('item.documents')}>
                  <Attachments type="equipment.item-document" id={item.id} editable={canWrite && !retired} hint={t('item.sharedFiles')} />
                </Panel>
                <Panel title={t('item.qr')}>
                <Stack align="center" gap={4}>
                  <QRCodeSVG value={link} size={140} />
                  <Text size="xs" fw={700}>{item.inventoryNumber}</Text>
                  <Text size="xs" c="dimmed" ta="center">{t('item.qrHint')}</Text>
                  {item.labelPrintedAt && <Text size="xs" c="dimmed">{t('labels.printedOn', { date: formatDate(item.labelPrintedAt, i18n.language) })}</Text>}
                  <Button size="xs" variant="default" onClick={() => navigate(`/equipment/labels?ids=${item.id}`)}>{t('labels.single')}</Button>
                </Stack>
              </Panel>
              </Stack>
            </SimpleGrid>
          </Tabs.Panel>
          <Tabs.Panel value="inspections"><InspectionsTab item={item} canInspect={canInspect && !retired} /></Tabs.Panel>
          <Tabs.Panel value="defects"><DefectsTab item={item} canWrite={canWrite} /></Tabs.Panel>
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
