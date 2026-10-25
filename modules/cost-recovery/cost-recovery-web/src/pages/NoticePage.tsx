import { ActionIcon, Button, Group, Menu, NumberInput, Select, SimpleGrid, Stack, Table, Text, Textarea, TextInput } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { type Debtor, type Notice, type Position, round2, totalOf, vehicleRateOn } from '@forga/cost-recovery-contracts';
import { apiUrl, can, formatDate, formatDateTime, formatMoney, localDate, send, useLocalized, useSession, useTranslation } from '@forga/web-sdk';
import { ActionBar, ConfirmDialog, EmptyState, Notice as Hint, PageHeader, Panel, ResponsiveDialog, useAction } from '@forga/web-ui';
import { ISSUE, keys, useAddressBook, useCostSettings, useNotice, WRITE } from '../api';
import { NoticeStatusBadge } from '../parts';

type Form = Pick<Notice, 'offenseKey' | 'debtors' | 'positions' | 'reasoning' | 'remedy' | 'cashReference'>;
const emptyDebtor = (): Debtor => ({ name: '', street: '', postalCode: '', city: '', role: '' });
const missingReason = (p: Position) => p.computedAmount !== null && round2(p.amount) !== round2(p.computedAmount) && !p.reason.trim();

function Editor({ notice, editable }: { notice: Notice; editable: boolean }) {
  const { t, i18n } = useTranslation('cost-recovery');
  const localized = useLocalized();
  const { data: settings } = useCostSettings();
  const { data: book = [] } = useAddressBook();
  const [form, setForm] = useState<Form>(() => ({ offenseKey: notice.offenseKey, debtors: notice.debtors, positions: notice.positions, reasoning: notice.reasoning, remedy: notice.remedy, cashReference: notice.cashReference }));
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setPosition = (index: number, change: Partial<Position>) => set('positions', form.positions.map((p, i) => (i === index ? { ...p, ...change } : p)));
  const setDebtor = (index: number, change: Partial<Debtor>) => set('debtors', form.debtors.map((d, i) => (i === index ? { ...d, ...change } : d)));
  const save = useAction(() => send('PUT', `cost-recovery/notices/${notice.id}`, { ...form, version: notice.version }), { success: t('notice.saved'), invalidate: [keys.all] });
  const asMtw = (index: number) => {
    const p = form.positions[index];
    const rate = vehicleRateOn(settings?.vehicleRates ?? [], 'mtw', notice.alarmedAt.slice(0, 10)) ?? p.rate;
    setPosition(index, { category: 'mtw', rate, amount: round2(p.quantity * rate), reason: p.reason || t('notice.mtwReason') });
  };

  return (
    <Stack gap="md" pb={editable ? 80 : 0}>
      <Panel title={t('notice.basis')}>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Select label={t('fields.offense')} data={(settings?.offenses ?? []).map((o) => ({ value: o.key, label: `${localized(o.name)} (${o.legalBasis})` }))} value={form.offenseKey} onChange={(v) => v && set('offenseKey', v)} allowDeselect={false} disabled={!editable} />
          <TextInput label={t('fields.cashReference')} value={form.cashReference} onChange={(e) => set('cashReference', e.currentTarget.value)} disabled={!editable} />
        </SimpleGrid>
      </Panel>
      <Panel
        title={t('fields.debtors')}
        aside={
          editable && (
            <Group gap="xs">
              <Select size="xs" placeholder={t('notice.fromBook')} data={book.map((b) => ({ value: b.id, label: b.name }))} value={null} onChange={(v) => { const b = book.find((x) => x.id === v); if (b) set('debtors', [...form.debtors, { name: b.name, street: b.street, postalCode: b.postalCode, city: b.city, role: b.role }]); }} searchable />
              <Button size="xs" variant="default" onClick={() => set('debtors', [...form.debtors, emptyDebtor()])}>{t('notice.addDebtor')}</Button>
            </Group>
          )
        }
      >
        <Stack gap="xs">
          {form.debtors.length === 0 && <Text size="sm" c="red.8">{t('notice.noDebtor')}</Text>}
          {form.debtors.length > 1 && <Text size="xs" c="dimmed">{t('notice.jointly')}</Text>}
          {form.debtors.map((d, index) => (
            <Group key={index} wrap="nowrap" align="end">
              <TextInput label={t('debtor.name')} value={d.name} onChange={(e) => setDebtor(index, { name: e.currentTarget.value })} disabled={!editable} style={{ flex: 2 }} />
              <TextInput label={t('debtor.street')} value={d.street} onChange={(e) => setDebtor(index, { street: e.currentTarget.value })} disabled={!editable} style={{ flex: 2 }} />
              <TextInput label={t('debtor.postalCode')} value={d.postalCode} onChange={(e) => setDebtor(index, { postalCode: e.currentTarget.value })} disabled={!editable} w={90} />
              <TextInput label={t('debtor.city')} value={d.city} onChange={(e) => setDebtor(index, { city: e.currentTarget.value })} disabled={!editable} style={{ flex: 1 }} />
              {editable && <ActionIcon variant="subtle" color="red" mb={6} aria-label={t('notice.remove')} onClick={() => set('debtors', form.debtors.filter((_, i) => i !== index))}><IconTrash size={16} /></ActionIcon>}
            </Group>
          ))}
        </Stack>
      </Panel>
      <Panel title={t('notice.positions')} aside={<Text fw={700}>{t('notice.total', { total: formatMoney(totalOf(form.positions), i18n.language) })}</Text>}>
        <Table>
          <Table.Thead>
            <Table.Tr><Table.Th>{t('position.label')}</Table.Th><Table.Th>{t('position.quantity')}</Table.Th><Table.Th>{t('position.rate')}</Table.Th><Table.Th>{t('position.amount')}</Table.Th><Table.Th>{t('position.reason')}</Table.Th><Table.Th /></Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {form.positions.map((p, index) => (
              <Table.Tr key={index}>
                <Table.Td><TextInput aria-label={t('position.label')} value={p.label} onChange={(e) => setPosition(index, { label: e.currentTarget.value })} disabled={!editable} /></Table.Td>
                <Table.Td><NumberInput aria-label={t('position.quantity')} w={80} value={p.quantity} decimalScale={2} onChange={(v) => setPosition(index, { quantity: Number(v) || 0, amount: round2((Number(v) || 0) * p.rate) })} disabled={!editable} /></Table.Td>
                <Table.Td><NumberInput aria-label={t('position.rate')} w={100} value={p.rate} decimalScale={2} suffix=" €" onChange={(v) => setPosition(index, { rate: Number(v) || 0, amount: round2(p.quantity * (Number(v) || 0)) })} disabled={!editable} /></Table.Td>
                <Table.Td><NumberInput aria-label={t('position.amount')} w={110} value={p.amount} decimalScale={2} suffix=" €" onChange={(v) => setPosition(index, { amount: Number(v) || 0 })} disabled={!editable} error={missingReason(p) || undefined} /></Table.Td>
                <Table.Td><TextInput aria-label={t('position.reason')} placeholder={p.computedAmount !== null && round2(p.amount) !== round2(p.computedAmount) ? t('position.reasonNeeded') : ''} value={p.reason} onChange={(e) => setPosition(index, { reason: e.currentTarget.value })} disabled={!editable} error={missingReason(p) || undefined} /></Table.Td>
                <Table.Td>
                  {editable && (
                    <Group gap={4} wrap="nowrap">
                      {p.kind === 'vehicle' && p.category !== 'mtw' && <Button size="compact-xs" variant="default" onClick={() => asMtw(index)}>{t('notice.asMtw')}</Button>}
                      <ActionIcon variant="subtle" color="red" aria-label={t('notice.remove')} onClick={() => set('positions', form.positions.filter((_, i) => i !== index))}><IconTrash size={16} /></ActionIcon>
                    </Group>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        {editable && (
          <Group mt="sm">
            <Select
              size="xs"
              placeholder={t('notice.addPosition')}
              data={[
                ...(settings?.flatRates ?? []).map((f) => ({ value: `flat:${f.key}`, label: `${f.name} (${formatMoney(f.amount, i18n.language)})` })),
                ...(settings?.materials ?? []).map((m) => ({ value: `material:${m.key}`, label: `${m.name} (${formatMoney(m.price, i18n.language)}/${m.unit})` })),
                ...(['third-party', 'other-brigade', 'flat-rate', 'other'] as const).map((k) => ({ value: k, label: t(`positionKind.${k}`) })),
              ]}
              value={null}
              onChange={(v) => {
                if (!v) return;
                const material = v.startsWith('material:') ? settings?.materials.find((m) => `material:${m.key}` === v) : undefined;
                const flat = v.startsWith('flat:') ? settings?.flatRates.find((f) => `flat:${f.key}` === v) : undefined;
                const position: Position = material
                  ? { kind: 'material', label: material.name, quantity: 1, unit: material.unit, rate: material.price, amount: material.price, computedAmount: null, reason: '', category: null, vehicleId: null }
                  : flat
                    ? { kind: 'flat-rate', label: [flat.name, flat.basis].filter(Boolean).join(' – '), quantity: 1, unit: t('position.flat'), rate: flat.amount, amount: flat.amount, computedAmount: null, reason: '', category: null, vehicleId: null }
                    : { kind: v as Position['kind'], label: t(`positionKind.${v}`), quantity: 1, unit: t('position.flat'), rate: 0, amount: 0, computedAmount: null, reason: '', category: null, vehicleId: null };
                set('positions', [...form.positions, position]);
              }}
            />
          </Group>
        )}
      </Panel>
      <Panel title={t('notice.texts')}>
        <Stack gap="sm">
          <Textarea label={t('notice.reasoning')} value={form.reasoning} onChange={(e) => set('reasoning', e.currentTarget.value)} autosize minRows={3} disabled={!editable} />
          <Textarea label={t('notice.remedy')} value={form.remedy} onChange={(e) => set('remedy', e.currentTarget.value)} autosize minRows={2} disabled={!editable} />
        </Stack>
      </Panel>
      {editable && (
        <ActionBar info={t('notice.editHint')}>
          <Button loading={save.isPending} disabled={form.positions.some(missingReason)} onClick={() => save.mutate(undefined)}>{t('notice.save')}</Button>
        </ActionBar>
      )}
    </Stack>
  );
}

function ObjectionDialog({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  const { t } = useTranslation('cost-recovery');
  const { t: common } = useTranslation('common');
  const [form, setForm] = useState(() => ({ date: notice.objection?.date ?? localDate(), result: notice.objection?.result ?? 'pending', note: notice.objection?.note ?? '' }));
  const save = useAction(() => send('POST', `cost-recovery/notices/${notice.id}/objection`, form), { invalidate: [keys.all], onSuccess: onClose });
  return (
    <ResponsiveDialog opened onClose={onClose} title={t('objection.title')} actions={<Group justify="flex-end"><Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button><Button loading={save.isPending} onClick={() => save.mutate(undefined)}>{common('actions.save')}</Button></Group>}>
      <DateInput label={t('objection.date')} value={form.date} onChange={(v) => v && setForm({ ...form, date: v })} valueFormat="DD.MM.YYYY" />
      <Select label={t('objection.result')} data={(['pending', 'upheld', 'rejected'] as const).map((r) => ({ value: r, label: t(`objection.results.${r}`) }))} value={form.result} onChange={(v) => v && setForm({ ...form, result: v as typeof form.result })} allowDeselect={false} />
      <TextInput label={t('objection.note')} value={form.note} onChange={(e) => setForm({ ...form, note: e.currentTarget.value })} />
    </ResponsiveDialog>
  );
}

type Action = 'submit' | 'return' | 'issue' | 'hand-over' | 'recalculate';

/** One notice: calculation, debtors, texts and the steps up to payment. */
export function NoticePage() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation('cost-recovery');
  const session = useSession().data;
  const { data: notice, isLoading } = useNotice(id);
  const [confirm, setConfirm] = useState<Action | null>(null);
  const [dialog, setDialog] = useState<'objection' | 'cancel' | 'paid' | null>(null);
  const [paidOn, setPaidOn] = useState<string | null>(() => localDate());
  const step = useAction((action: Action) => send('POST', `cost-recovery/notices/${id}/${action}`), { invalidate: [keys.all], onSuccess: () => setConfirm(null) });
  const cancel = useAction((reason: string) => send('POST', `cost-recovery/notices/${id}/cancel`, { reason }), { invalidate: [keys.all], onSuccess: () => setDialog(null) });
  const paid = useAction(() => send('POST', `cost-recovery/notices/${id}/paid`, { paidOn }), { invalidate: [keys.all], onSuccess: () => setDialog(null) });
  const navigate = useNavigate();
  const amend = useAction(() => send<Notice>('POST', `cost-recovery/notices/${id}/amend`), { invalidate: [keys.all], success: t('notice.amendCreated'), onSuccess: (created) => navigate(`/cost-recovery/notices/${created.id}`) });
  if (!notice) return isLoading ? null : <EmptyState title={t('notice.notFound')} />;
  const editable = (notice.status === 'draft' || notice.status === 'review') && can(session, WRITE);
  const open = ['issued', 'handed-over', 'objection'].includes(notice.status);

  return (
    <Stack gap="lg">
      <PageHeader
        breadcrumbs={[{ label: t('module') }, { label: t('notices.title'), to: '/cost-recovery/notices' }, { label: notice.number }]}
        title={t('notice.title', { number: notice.number })}
        badges={<NoticeStatusBadge status={notice.status} />}
        subtitle={`${notice.alarmKeyword} · ${notice.dispatchNumber} · ${formatDateTime(notice.alarmedAt, i18n.language)}${notice.location ? ` · ${notice.location}` : ''}`}
        actions={
          <Group gap="sm">
            <Button component="a" href={apiUrl(`cost-recovery/notices/${id}/pdf`)} target="_blank" variant="default">{notice.hasPdf ? t('notice.pdf') : t('notice.preview')}</Button>
            {notice.status === 'draft' && can(session, WRITE) && <Button variant="default" onClick={() => setConfirm('recalculate')}>{t('notice.recalculate')}</Button>}
            {notice.status === 'draft' && can(session, WRITE) && <Button onClick={() => setConfirm('submit')}>{t('notice.submit')}</Button>}
            {notice.status === 'review' && can(session, ISSUE) && <Button variant="default" onClick={() => setConfirm('return')}>{t('notice.return')}</Button>}
            {notice.status === 'review' && can(session, ISSUE) && <Button onClick={() => setConfirm('issue')}>{t('notice.issue')}</Button>}
            {notice.status === 'issued' && can(session, WRITE) && <Button onClick={() => setConfirm('hand-over')}>{t('notice.handOver')}</Button>}
            {open && can(session, WRITE) && (
              <Menu position="bottom-end">
                <Menu.Target><Button variant="default">{t('notice.more')}</Button></Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item onClick={() => setDialog('paid')}>{t('notice.markPaid')}</Menu.Item>
                  <Menu.Item onClick={() => setDialog('objection')}>{t('objection.title')}</Menu.Item>
                  <Menu.Item onClick={() => amend.mutate(undefined)}>{t('notice.amend')}</Menu.Item>
                </Menu.Dropdown>
              </Menu>
            )}
            {notice.status !== 'paid' && notice.status !== 'cancelled' && notice.status !== 'amended' && can(session, ISSUE) && <Button variant="default" color="red" onClick={() => setDialog('cancel')}>{t('notice.cancel')}</Button>}
          </Group>
        }
      />
      {notice.issuedAt && <Hint kind="done">{t('notice.issuedBy', { name: notice.issuedBy, at: formatDateTime(notice.issuedAt, i18n.language), due: formatDate(notice.dueOn, i18n.language) })}</Hint>}
      {notice.objection && <Hint kind={notice.objection.result === 'pending' ? 'warning' : 'info'}>{t('objection.state', { date: formatDate(notice.objection.date, i18n.language), result: t(`objection.results.${notice.objection.result}`), note: notice.objection.note })}</Hint>}
      {notice.cancellation && <Hint kind="info">{t('notice.cancelledOn', { date: formatDate(notice.cancellation.date, i18n.language), reason: notice.cancellation.reason })}</Hint>}
      {notice.amends && <Hint kind="info">{t('notice.amends')} <Link to={`/cost-recovery/notices/${notice.amends.id}`}>{notice.amends.number}</Link></Hint>}
      {notice.amendedBy && <Hint kind="info">{t('notice.amendedBy')} <Link to={`/cost-recovery/notices/${notice.amendedBy.id}`}>{notice.amendedBy.number}</Link></Hint>}
      {notice.paidOn && <Hint kind="done">{t('notice.paidOn', { date: formatDate(notice.paidOn, i18n.language) })}</Hint>}
      <Editor key={`${notice.id}:${notice.version}`} notice={notice} editable={editable} />
      {confirm && (
        <ConfirmDialog opened onClose={() => setConfirm(null)} title={t(`confirm.${confirm}.title`)} description={t(`confirm.${confirm}.text`)} confirmLabel={t(`confirm.${confirm}.button`)} loading={step.isPending} onConfirm={() => step.mutate(confirm)} />
      )}
      {dialog === 'cancel' && <ConfirmDialog opened onClose={() => setDialog(null)} title={t('confirm.cancel.title')} description={t('confirm.cancel.text')} reason={t('confirm.cancel.reason')} confirmLabel={t('confirm.cancel.button')} loading={cancel.isPending} onConfirm={(reason) => cancel.mutate(reason)} />}
      {dialog === 'objection' && <ObjectionDialog notice={notice} onClose={() => setDialog(null)} />}
      {dialog === 'paid' && (
        <ConfirmDialog opened onClose={() => setDialog(null)} title={t('notice.markPaid')} confirmLabel={t('notice.markPaid')} loading={paid.isPending} onConfirm={() => paid.mutate(undefined)}>
          <DateInput label={t('notice.paidDate')} value={paidOn} onChange={setPaidOn} valueFormat="DD.MM.YYYY" />
        </ConfirmDialog>
      )}
    </Stack>
  );
}
