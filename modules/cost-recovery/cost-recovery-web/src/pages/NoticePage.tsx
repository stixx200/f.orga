import { ActionIcon, Anchor, Button, Group, Menu, NumberInput, Select, SimpleGrid, Stack, Table, Text, Textarea, TextInput } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { IconTrash } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { type Debtor, expectedAmount, IN_EFFECT_STATUSES, type Notice, type NoticeIncident, type Payment, type Position, round2, totalOf, vehicleRateOn } from '@forga/cost-recovery-contracts';
import { api, apiUrl, can, formatDate, formatDateTime, formatMoney, localDate, send, useLocalized, useSession, useTranslation } from '@forga/web-sdk';
import { ActionBar, ConfirmDialog, DataTable, EmptyState, Notice as Hint, PageHeader, Panel, ResponsiveDialog, useAction } from '@forga/web-ui';
import { ISSUE, keys, REFUND, useAddressBook, useCostSettings, useNotice, WRITE } from '../api';
import { NoticeStatusBadge } from '../parts';
import { IncidentDrawer } from './IncidentDrawer';

type Form = Pick<Notice, 'offenseKey' | 'debtors' | 'positions' | 'reasoning' | 'remedy' | 'cashReference'>;
const emptyDebtor = (): Debtor => ({ name: '', street: '', postalCode: '', city: '', role: '' });
const differs = (p: Position) => round2(p.amount) !== round2(expectedAmount(p));
const missingReason = (p: Position) => differs(p) && !p.reason.trim();
const formOf = (n: Notice): Form => ({ offenseKey: n.offenseKey, debtors: n.debtors, positions: n.positions, reasoning: n.reasoning, remedy: n.remedy, cashReference: n.cashReference });
const manual = (kind: Position['kind'], label: string, unit: string, rate: number): Position => ({ kind, label, quantity: 1, unit, rate, amount: rate, computedAmount: null, reason: '', category: null, vehicleId: null, persons: null, hoursEach: null });

function Editor({ form, setForm, notice, editable }: { form: Form; setForm: (change: (f: Form) => Form) => void; notice: Notice; editable: boolean }) {
  const { t, i18n } = useTranslation('cost-recovery');
  const localized = useLocalized();
  const { data: settings } = useCostSettings();
  const { data: book = [] } = useAddressBook();
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setPosition = (index: number, change: Partial<Position>) => set('positions', form.positions.map((p, i) => (i === index ? { ...p, ...change } : p)));
  const setDebtor = (index: number, change: Partial<Debtor>) => set('debtors', form.debtors.map((d, i) => (i === index ? { ...d, ...change } : d)));
  const asMtw = (index: number) => {
    const p = form.positions[index]!;
    const rate = vehicleRateOn(settings?.vehicleRates ?? [], 'mtw', notice.alarmedAt.slice(0, 10)) ?? p.rate;
    setPosition(index, { category: 'mtw', rate, amount: round2(p.quantity * rate), reason: p.reason || t('notice.mtwReason') });
  };

  return (
    <Stack gap="md" pb={editable ? 80 : 0}>
      <Panel title={t('notice.basis')}>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Select label={t('fields.offense')} data={(settings?.offenses ?? []).map((o) => ({ value: o.key, label: `${localized(o.name)} (${o.legalBasis})` }))} value={form.offenseKey} onChange={(v) => v && set('offenseKey', v)} allowDeselect={false} disabled={!editable} />
          <TextInput label={t('fields.cashReference')} description={settings?.cashReferenceRequired ? t('notice.cashReferenceRequired') : undefined} value={form.cashReference} onChange={(e) => set('cashReference', e.currentTarget.value)} disabled={!editable} />
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
              <TextInput label={t('debtor.name')} value={d.name} onChange={(e) => setDebtor(index, { name: e.currentTarget.value })} disabled={!editable} style={{ flex: 2 }} error={editable && !d.name.trim() ? t('notice.nameMissing') : undefined} />
              <TextInput label={t('debtor.street')} value={d.street} onChange={(e) => setDebtor(index, { street: e.currentTarget.value })} disabled={!editable} style={{ flex: 2 }} />
              <TextInput label={t('debtor.postalCode')} value={d.postalCode} onChange={(e) => setDebtor(index, { postalCode: e.currentTarget.value })} disabled={!editable} w={90} />
              <TextInput label={t('debtor.city')} value={d.city} onChange={(e) => setDebtor(index, { city: e.currentTarget.value })} disabled={!editable} style={{ flex: 1 }} />
              {editable && <ActionIcon variant="subtle" color="red" mb={6} aria-label={t('notice.remove')} onClick={() => set('debtors', form.debtors.filter((_, i) => i !== index))}><IconTrash size={16} /></ActionIcon>}
            </Group>
          ))}
        </Stack>
      </Panel>
      <Panel title={t('notice.positions')} aside={<Text fw={700}>{t('notice.total', { total: formatMoney(totalOf(form.positions), i18n.language) })}</Text>}>
        {notice.guestsNotCharged > 0 && <Hint kind="info">{t('notice.guestsNotCharged', { count: notice.guestsNotCharged })}</Hint>}
        <Table>
          <Table.Thead>
            <Table.Tr><Table.Th>{t('position.label')}</Table.Th><Table.Th>{t('position.quantity')}</Table.Th><Table.Th>{t('position.rate')}</Table.Th><Table.Th>{t('position.amount')}</Table.Th><Table.Th>{t('position.reason')}</Table.Th><Table.Th /></Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {form.positions.map((p, index) => (
              <Table.Tr key={index}>
                <Table.Td><TextInput aria-label={t('position.label')} value={p.label} onChange={(e) => setPosition(index, { label: e.currentTarget.value })} disabled={!editable} /></Table.Td>
                <Table.Td><NumberInput aria-label={t('position.quantity')} w={80} value={p.quantity} min={0} decimalScale={2} onChange={(v) => setPosition(index, { quantity: Number(v) || 0, amount: round2((Number(v) || 0) * p.rate) })} disabled={!editable} /></Table.Td>
                <Table.Td><NumberInput aria-label={t('position.rate')} w={100} value={p.rate} min={0} decimalScale={2} suffix=" €" onChange={(v) => setPosition(index, { rate: Number(v) || 0, amount: round2(p.quantity * (Number(v) || 0)) })} disabled={!editable} /></Table.Td>
                <Table.Td><NumberInput aria-label={t('position.amount')} w={110} value={p.amount} min={0} allowNegative={false} decimalScale={2} suffix=" €" onChange={(v) => setPosition(index, { amount: Math.max(0, Number(v) || 0) })} disabled={!editable} error={missingReason(p) || undefined} /></Table.Td>
                <Table.Td><TextInput aria-label={t('position.reason')} placeholder={differs(p) ? t('position.reasonNeeded') : ''} value={p.reason} onChange={(e) => setPosition(index, { reason: e.currentTarget.value })} disabled={!editable} error={missingReason(p) || undefined} /></Table.Td>
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
                const position = material
                  ? manual('material', material.name, material.unit, material.price)
                  : flat
                    ? manual('flat-rate', [flat.name, flat.basis].filter(Boolean).join(' – '), t('position.flat'), flat.amount)
                    : manual(v as Position['kind'], t(`positionKind.${v}`), t('position.flat'), 0);
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

/** A payment (also partial): date not before the issue and not in the future; the open amount is suggested. */
function PaymentDialog({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  const { t, i18n } = useTranslation('cost-recovery');
  const { t: common } = useTranslation('common');
  const [form, setForm] = useState(() => ({ date: localDate(), amount: Math.max(0, notice.balance) as number | '', note: '' }));
  const save = useAction(() => send('POST', `cost-recovery/notices/${notice.id}/payments`, { ...form, amount: Number(form.amount) }), { invalidate: [keys.all], success: t('payments.saved'), onSuccess: onClose });
  const issued = notice.issuedAt ? notice.issuedAt.slice(0, 10) : undefined;
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={t('payments.add')}
      actions={<Group justify="flex-end"><Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button><Button loading={save.isPending} disabled={!form.amount || !form.date} onClick={() => save.mutate(undefined)}>{common('actions.save')}</Button></Group>}
    >
      <Text size="sm">{t('payments.open', { open: formatMoney(notice.balance, i18n.language), total: formatMoney(notice.total, i18n.language) })}</Text>
      <DateInput label={t('payments.date')} value={form.date} onChange={(v) => v && setForm({ ...form, date: v })} valueFormat="DD.MM.YYYY" minDate={issued} maxDate={localDate()} />
      <NumberInput label={t('payments.amount')} value={form.amount} onChange={(v) => setForm({ ...form, amount: v === '' ? '' : Number(v) })} min={0.01} decimalScale={2} fixedDecimalScale suffix=" €" />
      <TextInput label={t('payments.note')} value={form.note} onChange={(e) => setForm({ ...form, note: e.currentTarget.value })} />
    </ResponsiveDialog>
  );
}

/** Refund of an overpayment, at most the amount due; recorded as a negative payment. */
function RefundDialog({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  const { t, i18n } = useTranslation('cost-recovery');
  const { t: common } = useTranslation('common');
  const [form, setForm] = useState(() => ({ date: localDate(), amount: notice.refundDue as number | '', note: '' }));
  const save = useAction(() => send('POST', `cost-recovery/notices/${notice.id}/refunds`, { ...form, amount: Number(form.amount) }), { invalidate: [keys.all], success: t('refund.saved'), onSuccess: onClose });
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={t('refund.add')}
      actions={<Group justify="flex-end"><Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button><Button loading={save.isPending} disabled={!form.amount || !form.date} onClick={() => save.mutate(undefined)}>{common('actions.save')}</Button></Group>}
    >
      <Text size="sm">{t('refund.due', { amount: formatMoney(notice.refundDue, i18n.language) })}</Text>
      <DateInput label={t('refund.date')} value={form.date} onChange={(v) => v && setForm({ ...form, date: v })} valueFormat="DD.MM.YYYY" maxDate={localDate()} />
      <NumberInput label={t('payments.amount')} value={form.amount} onChange={(v) => setForm({ ...form, amount: v === '' ? '' : Number(v) })} min={0.01} max={notice.refundDue} decimalScale={2} fixedDecimalScale suffix=" €" />
      <TextInput label={t('payments.note')} value={form.note} onChange={(e) => setForm({ ...form, note: e.currentTarget.value })} />
    </ResponsiveDialog>
  );
}

function Payments({ notice, writable }: { notice: Notice; writable: boolean }) {
  const { t, i18n } = useTranslation('cost-recovery');
  const [reverse, setReverse] = useState<Payment | null>(null);
  const reversal = useAction((reason: string) => send('POST', `cost-recovery/notices/${notice.id}/payments/${reverse!.id}/reverse`, { reason }), { invalidate: [keys.all], onSuccess: () => setReverse(null) });
  if (!notice.payments.length) return null;
  return (
    <Panel title={t('payments.title')} aside={<Text size="sm" fw={700} c={notice.balance < 0 ? 'red.8' : undefined}>{notice.balance < 0 ? t('payments.overpaid', { amount: formatMoney(-notice.balance, i18n.language) }) : t('payments.balance', { amount: formatMoney(notice.balance, i18n.language) })}</Text>}>
      <DataTable<Payment>
        rows={notice.payments}
        rowKey={(p) => p.id}
        exportable={false}
        columns={[
          { key: 'date', header: t('payments.date'), render: (p) => formatDate(p.date, i18n.language) },
          { key: 'amount', header: t('payments.amount'), align: 'right', render: (p) => <Text size="sm" td={p.reversal ? 'line-through' : undefined}>{formatMoney(p.amount, i18n.language)}</Text> },
          { key: 'note', header: t('payments.note'), render: (p) => (p.reversal ? t('payments.reversed', { date: formatDate(p.reversal.date, i18n.language), reason: p.reversal.reason, by: p.reversal.by }) : [p.amount < 0 ? t('refund.entry') : '', p.note, p.recordedBy].filter(Boolean).join(' · ')) },
          { key: 'action', header: '', align: 'right', render: (p) => writable && !p.reversal && <Button size="compact-xs" variant="default" onClick={() => setReverse(p)}>{t('payments.reverse')}</Button> },
        ]}
      />
      {reverse && <ConfirmDialog opened onClose={() => setReverse(null)} title={t('payments.reverse')} description={t('payments.reverseHint', { amount: formatMoney(reverse.amount, i18n.language), date: formatDate(reverse.date, i18n.language) })} reason={t('payments.reason')} confirmLabel={t('payments.reverse')} loading={reversal.isPending} onConfirm={(reason) => reversal.mutate(reason)} />}
    </Panel>
  );
}

type Action = 'submit' | 'return' | 'issue' | 'hand-over' | 'recalculate';

/** One notice: calculation, debtors, texts and the steps up to payment. Keyed by version, so the form starts from the saved state. */
function NoticeView({ notice, showIncident, onToggleIncident }: { notice: Notice; showIncident: boolean; onToggleIncident: () => void }) {
  const { t, i18n } = useTranslation('cost-recovery');
  const session = useSession().data;
  const { data: settings } = useCostSettings();
  const id = notice.id;
  const [form, setForm] = useState<Form>(() => formOf(notice));
  const [confirm, setConfirm] = useState<Action | null>(null);
  const [dialog, setDialog] = useState<'objection' | 'cancel' | 'discard' | 'delete' | 'paid' | 'remind' | 'refund' | null>(null);
  const [discardReason, setDiscardReason] = useState('');
  const editable = (notice.status === 'draft' || notice.status === 'review') && can(session, WRITE);
  const dirty = editable && JSON.stringify(form) !== JSON.stringify(formOf(notice));
  // Leaving the page with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const put = () => send('PUT', `cost-recovery/notices/${id}`, { ...form, version: notice.version });
  const save = useAction(put, { success: t('notice.saved'), invalidate: [keys.all] });
  // A step saves the form first, so changes are never lost silently.
  const step = useAction(
    async (action: Action) => {
      if (dirty) await put();
      return send('POST', `cost-recovery/notices/${id}/${action}`);
    },
    { invalidate: [keys.all], onSuccess: () => setConfirm(null) },
  );
  const cancel = useAction((reason: string) => send('POST', `cost-recovery/notices/${id}/cancel`, { reason }), { invalidate: [keys.all], onSuccess: () => setDialog(null) });
  const discard = useAction(() => send('POST', `cost-recovery/notices/${id}/discard`, { reason: discardReason }), { invalidate: [keys.all], onSuccess: () => setDialog(null) });
  const remind = useAction(() => send<Notice>('POST', `cost-recovery/notices/${id}/reminders`), {
    invalidate: [keys.all],
    onSuccess: (n) => {
      setDialog(null);
      window.open(apiUrl(`cost-recovery/notices/${id}/reminders/${n.reminders.length - 1}/pdf`), '_blank');
    },
  });
  const navigate = useNavigate();
  const remove = useAction(() => send('DELETE', `cost-recovery/notices/${id}`), { invalidate: [keys.all], onSuccess: () => navigate('/cost-recovery/notices') });
  const amend = useAction(() => send<Notice>('POST', `cost-recovery/notices/${id}/amend`), { invalidate: [keys.all], success: t('notice.amendCreated'), onSuccess: (created) => navigate(`/cost-recovery/notices/${created.id}`) });
  // In effect, also when paid: objection, amendment and cancellation apply (an overpayment is refunded).
  const inEffect = IN_EFFECT_STATUSES.includes(notice.status);
  // Before the issue: is the incident still chargeable, and are all reports released for billing?
  const beforeIssue = notice.status === 'draft' || notice.status === 'review';
  const { data: incident } = useQuery({ queryKey: [...keys.notice(id), 'incident'], queryFn: () => api<NoticeIncident>(`cost-recovery/notices/${id}/incident`), enabled: beforeIssue });
  const ownSubmission = Boolean(settings?.fourEyes) && session?.user.id !== undefined && (notice.submittedById === session.user.id || notice.lastEditedById === session.user.id);
  // Reasoned deviations of calculated positions: kept by "Neu berechnen" only where the calculation is unchanged.
  const deviations = notice.positions.filter((p) => p.computedAmount !== null && differs(p));
  const confirmText = (action: Action) => {
    if (action === 'submit') return t(settings?.fourEyes ? 'confirm.submit.textFourEyes' : 'confirm.submit.text');
    if (action === 'recalculate' && deviations.length) return `${t('confirm.recalculate.text')} ${t('confirm.recalculate.deviations', { positions: deviations.map((p) => p.label).join(', ') })}`;
    return t(`confirm.${action}.text`);
  };

  return (
    <Stack gap="lg">
      <PageHeader
        breadcrumbs={[{ label: t('module') }, { label: t('notices.title'), to: '/cost-recovery/notices' }, { label: notice.number }]}
        title={t('notice.title', { number: notice.number })}
        badges={<NoticeStatusBadge status={notice.status} overdue={notice.overdue} refund={notice.refundDue > 0} />}
        subtitle={`${notice.alarmKeyword} · ${notice.dispatchNumber} · ${formatDateTime(notice.alarmedAt, i18n.language)}${notice.location ? ` · ${notice.location}` : ''}`}
        actions={
          <Group gap="sm">
            <Button variant="default" onClick={onToggleIncident}>{t('incident.show')}</Button>
            <Button component="a" href={apiUrl(`cost-recovery/notices/${id}/pdf`)} target="_blank" variant="default">{notice.hasPdf ? t('notice.pdf') : t('notice.preview')}</Button>
            {notice.status === 'draft' && can(session, WRITE) && <Button variant="default" onClick={() => setConfirm('recalculate')}>{t('notice.recalculate')}</Button>}
            {notice.status === 'draft' && can(session, WRITE) && <Button onClick={() => setConfirm('submit')}>{t('notice.submit')}</Button>}
            {notice.status === 'review' && can(session, ISSUE) && <Button variant="default" onClick={() => setConfirm('return')}>{t('notice.return')}</Button>}
            {notice.status === 'review' && can(session, ISSUE) && <Button disabled={ownSubmission} onClick={() => setConfirm('issue')}>{t('notice.issue')}</Button>}
            {inEffect && !notice.handedOverAt && can(session, WRITE) && <Button onClick={() => setConfirm('hand-over')}>{t('notice.handOver')}</Button>}
            {notice.refundDue > 0 && can(session, REFUND) && <Button onClick={() => setDialog('refund')}>{t('refund.add')}</Button>}
            {inEffect && can(session, WRITE) && (
              <Menu position="bottom-end">
                <Menu.Target><Button variant="default">{t('notice.more')}</Button></Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item onClick={() => setDialog('paid')}>{t('payments.add')}</Menu.Item>
                  {notice.overdue && <Menu.Item onClick={() => setDialog('remind')}>{t('reminder.create')}</Menu.Item>}
                  <Menu.Item onClick={() => setDialog('objection')}>{t('objection.title')}</Menu.Item>
                  <Menu.Item onClick={() => amend.mutate(undefined)}>{t('notice.amend')}</Menu.Item>
                </Menu.Dropdown>
              </Menu>
            )}
            {/* Drafts are deleted; notices in review are discarded and stay in the list. */}
            {notice.status === 'draft' && can(session, WRITE) && <Button variant="default" color="red" onClick={() => setDialog('delete')}>{t('notice.delete')}</Button>}
            {notice.status === 'review' && can(session, WRITE) && <Button variant="default" color="red" onClick={() => setDialog('discard')}>{t('notice.discard')}</Button>}
            {inEffect && can(session, ISSUE) && <Button variant="default" color="red" onClick={() => setDialog('cancel')}>{t('notice.cancel')}</Button>}
          </Group>
        }
      />
      {beforeIssue && incident && !incident.chargeable && <Hint kind="error">{t('notice.notChargeable')}</Hint>}
      {beforeIssue && incident && incident.chargeable && !incident.released && <Hint kind="warning">{t('notice.notReleased')}</Hint>}
      {notice.submittedAt && notice.status === 'review' && (
        <Hint kind="info">
          {t('notice.submittedBy', { name: notice.submittedBy, at: formatDateTime(notice.submittedAt, i18n.language) })}
          {notice.lastEditedBy ? ` ${t('notice.editedInReview', { name: notice.lastEditedBy })}` : ''}
          {ownSubmission ? ` ${t('notice.fourEyesOwn')}` : ''}
        </Hint>
      )}
      {notice.refundDue > 0 && <Hint kind="warning">{t('refund.hint', { amount: formatMoney(notice.refundDue, i18n.language) })}</Hint>}
      {notice.issuedAt && <Hint kind="done">{t('notice.issuedBy', { name: notice.issuedBy, at: formatDateTime(notice.issuedAt, i18n.language), due: formatDate(notice.dueOn, i18n.language) })}</Hint>}
      {notice.overdue && <Hint kind="warning">{t('notice.overdueHint', { due: formatDate(notice.dueOn, i18n.language), open: formatMoney(notice.balance, i18n.language) })}</Hint>}
      {notice.reminders.length > 0 && (
        <Hint kind="info">
          {t('reminder.sent')}{' '}
          {notice.reminders.map((r, index) => (
            <Anchor key={index} href={apiUrl(`cost-recovery/notices/${id}/reminders/${index}/pdf`)} target="_blank" mr="xs">{t('reminder.entry', { date: formatDate(r.date, i18n.language), due: formatDate(r.dueOn, i18n.language) })}</Anchor>
          ))}
        </Hint>
      )}
      {notice.objection && <Hint kind={notice.objection.result === 'pending' ? 'warning' : 'info'}>{t('objection.state', { date: formatDate(notice.objection.date, i18n.language), result: t(`objection.results.${notice.objection.result}`), note: notice.objection.note })}</Hint>}
      {notice.cancellation && <Hint kind="info">{t(notice.status === 'discarded' ? 'notice.discardedOn' : 'notice.cancelledOn', { date: formatDate(notice.cancellation.date, i18n.language), reason: notice.cancellation.reason })}</Hint>}
      {notice.amends && <Hint kind="info">{t('notice.amends')} <Link to={`/cost-recovery/notices/${notice.amends.id}`}>{notice.amends.number}</Link></Hint>}
      {notice.amendedBy && <Hint kind="info">{t('notice.amendedBy')} <Link to={`/cost-recovery/notices/${notice.amendedBy.id}`}>{notice.amendedBy.number}</Link></Hint>}
      {notice.paidOn && <Hint kind="done">{t('notice.paidOn', { date: formatDate(notice.paidOn, i18n.language) })}</Hint>}
      <Payments notice={notice} writable={can(session, WRITE)} />
      <Editor form={form} setForm={setForm} notice={notice} editable={editable} />
      {editable && (
        <ActionBar info={dirty ? t('notice.unsaved') : t('notice.editHint')}>
          <Button loading={save.isPending} disabled={!dirty || form.positions.some(missingReason)} onClick={() => save.mutate(undefined)}>{t('notice.save')}</Button>
        </ActionBar>
      )}
      <IncidentDrawer noticeId={notice.id} opened={showIncident} onClose={onToggleIncident} />
      {confirm && (
        <ConfirmDialog opened onClose={() => setConfirm(null)} title={t(`confirm.${confirm}.title`)} description={<>{confirmText(confirm)}{dirty ? ` ${t('notice.savedFirst')}` : ''}</>} confirmLabel={t(`confirm.${confirm}.button`)} loading={step.isPending} onConfirm={() => step.mutate(confirm)} />
      )}
      {dialog === 'cancel' && <ConfirmDialog opened onClose={() => setDialog(null)} title={t('confirm.cancel.title')} description={t('confirm.cancel.text')} reason={t('confirm.cancel.reason')} confirmLabel={t('confirm.cancel.button')} loading={cancel.isPending} onConfirm={(reason) => cancel.mutate(reason)} />}
      {dialog === 'delete' && (
        <ConfirmDialog opened onClose={() => setDialog(null)} title={t('confirm.delete.title')} description={t('confirm.delete.text')} confirmLabel={t('confirm.delete.button')} loading={remove.isPending} onConfirm={() => remove.mutate(undefined)} />
      )}
      {dialog === 'discard' && (
        <ConfirmDialog opened onClose={() => setDialog(null)} title={t('confirm.discard.title')} description={t('confirm.discard.text')} confirmLabel={t('confirm.discard.button')} loading={discard.isPending} onConfirm={() => discard.mutate(undefined)}>
          <TextInput label={t('confirm.discard.reason')} value={discardReason} onChange={(e) => setDiscardReason(e.currentTarget.value)} />
        </ConfirmDialog>
      )}
      {dialog === 'remind' && <ConfirmDialog opened onClose={() => setDialog(null)} title={t('reminder.create')} description={t('reminder.hint', { days: settings?.reminder?.days ?? 14 })} confirmLabel={t('reminder.create')} loading={remind.isPending} onConfirm={() => remind.mutate(undefined)} />}
      {dialog === 'objection' && <ObjectionDialog notice={notice} onClose={() => setDialog(null)} />}
      {dialog === 'paid' && <PaymentDialog notice={notice} onClose={() => setDialog(null)} />}
      {dialog === 'refund' && <RefundDialog notice={notice} onClose={() => setDialog(null)} />}
    </Stack>
  );
}

export function NoticePage() {
  const { id = '' } = useParams();
  const { t } = useTranslation('cost-recovery');
  const { data: notice, isLoading } = useNotice(id);
  const [showIncident, setShowIncident] = useState(false);
  if (!notice) return isLoading ? null : <EmptyState title={t('notice.notFound')} />;
  return <NoticeView key={`${notice.id}:${notice.version}`} notice={notice} showIncident={showIncident} onToggleIncident={() => setShowIncident((s) => !s)} />;
}
