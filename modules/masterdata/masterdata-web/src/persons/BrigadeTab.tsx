import { ActionIcon, Button, Checkbox, Group, Radio, Select, SimpleGrid, Stack, Switch, TagsInput, Text, TextInput } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { IconTrash } from '@tabler/icons-react';
import { type Dispatch, type ReactNode, type SetStateAction, useState } from 'react';
import type { MembershipInput, Person } from '@forga/masterdata-contracts';
import { useQuery } from '@tanstack/react-query';
import type { ActiveModule } from '@forga/core-contracts';
import { api, ApiError, formatDate, send, useLocalized, useTranslation } from '@forga/web-sdk';
import { ConfirmDialog, DataTable, Notice, Panel, ResponsiveDialog, StatusBadge, useAction } from '@forga/web-ui';
import { probationEnd, today, useCatalog, useCatalogNames, useDepartments, useMembershipRules } from '../api';
import type { PersonForm } from './PersonPage';

type Dialog = 'probation' | 'admission' | 'status' | 'leave' | 'membership' | 'rank' | 'toOperational' | 'toVeterans' | null;

/** A change of the person that returns the updated person. */
function usePersonAction<T>(run: (input: T) => Promise<Person>, done: (person: Person) => void) {
  const { t } = useTranslation('masterdata');
  return useAction(run, { success: t('person.saved'), onSuccess: done });
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Group gap="xs" wrap="nowrap" align="start">
      <Text size="sm" c="dimmed" w={160} style={{ flexShrink: 0 }}>{label}</Text>
      <Text size="sm" component="div">{children || '–'}</Text>
    </Group>
  );
}

export function BrigadeTab({ person, form, setForm, disabled, onChanged }: {
  person: Person;
  form: PersonForm;
  setForm: Dispatch<SetStateAction<PersonForm>>;
  disabled: boolean;
  onChanged: (person: Person) => void;
}) {
  const { t, i18n } = useTranslation('masterdata');
  const { t: common } = useTranslation('common');
  const localized = useLocalized();
  const { data: departments = [] } = useDepartments();
  const { data: ranks = [] } = useCatalog('rank');
  const { data: exitReasons = [] } = useCatalog('exit-reason');
  const { data: rules } = useMembershipRules();
  // The body that decides on admission and transfers comes from the settings (fire brigade statute).
  const decidedLabel = rules?.admissionDecidedBy ? t('brigade.decidedOnBy', { body: rules.admissionDecidedBy }) : t('brigade.decidedOn');
  const rankName = useCatalogNames('rank');
  const exitReasonName = useCatalogNames('exit-reason');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [primary, setPrimary] = useState(false);
  const [removeRank, setRemoveRank] = useState<string | null>(null);
  const value = (key: string, fallback = '') => values[key] ?? fallback;
  const setValue = (key: string, v: string | null) => setValues((x) => ({ ...x, [key]: v ?? '' }));
  const open = (d: Dialog) => {
    setValues({});
    setPrimary(false);
    setDialog(d);
  };
  const close = () => setDialog(null);
  // Leaving and the transfer to the veterans are refused while other modules count items held; the message names them.
  const { data: modules = [] } = useQuery({ queryKey: ['core', 'modules'], queryFn: () => api<ActiveModule[]>('core/modules'), staleTime: 5 * 60_000 });
  const namingModules = async (run: () => Promise<Person>) => {
    try {
      return await run();
    } catch (error) {
      if (!(error instanceof ApiError) || error.code !== 'masterdata.personHoldsItems') throw error;
      const ids = Array.isArray(error.body?.['modules']) ? (error.body['modules'] as string[]) : [];
      const names = ids.map((id) => {
        const module = modules.find((m) => m.id === id);
        return module ? localized(module.name) : id;
      });
      throw new ApiError(error.status, { ...error.body, modules: names });
    }
  };
  const set = <K extends keyof PersonForm>(key: K, v: PersonForm[K]) => setForm((f) => ({ ...f, [key]: v }));
  const done = (p: Person) => {
    onChanged(p);
    close();
  };

  const probation = usePersonAction(() => send<Person>('PUT', `masterdata/persons/${person.id}/probation`, { probationEndsOn: value('date', person.probationEndsOn ?? today()), reason: value('reason'), decidedOn: value('decidedOn') || null }), done);
  const admission = usePersonAction(() => send<Person>('POST', `masterdata/persons/${person.id}/admission`, { decidedOn: value('date', today()), reason: value('reason') }), done);
  // An admission before the end of the probation or without its qualifications needs a reason (statute).
  const admissionDate = value('date', today());
  const missingQualifications = (rules?.probationQualifications ?? []).filter((q) => !person.qualifications.some((x) => x.qualification === q && x.acquiredOn <= admissionDate));
  const earlyAdmission = Boolean(person.probationEndsOn && admissionDate < person.probationEndsOn);
  const admissionBeforeJoining = Boolean(person.joinedOn && admissionDate < person.joinedOn);
  const qualificationName = useCatalogNames('qualification');
  const status = usePersonAction(() => send<Person>('POST', `masterdata/persons/${person.id}/status`, { status: value('status', person.status === 'left' || person.status === 'probation' ? 'active' : person.status), effectiveOn: value('date', today()) }), done);
  const leave = usePersonAction(() => namingModules(() => send<Person>('POST', `masterdata/persons/${person.id}/leave`, { leftOn: value('date', today()), exitReason: value('reason') })), done);
  const memberships = usePersonAction((list: MembershipInput[]) => send<Person>('PUT', `masterdata/persons/${person.id}/memberships`, list), done);
  const addRank = usePersonAction(() => send<Person>('POST', `masterdata/persons/${person.id}/ranks`, { rank: value('rank'), since: value('date', today()) }), done);
  const deleteRank = usePersonAction((id: string) => send<Person>('DELETE', `masterdata/persons/${person.id}/ranks/${id}`), done);

  // Transfers: youth → operational department (with probation), operational → veterans.
  const primaryDepartment = person.memberships.find((m) => m.primary && !m.to)?.departmentId ?? null;
  const operationalDepartments = departments.filter((d) => d.type === 'operational');
  const veteransDepartments = departments.filter((d) => d.type === 'veterans');
  // Joining the veterans and leaving the youth brigade only work through the transfers.
  const statusTargets = person.status === 'veterans' ? (['veterans', 'active', 'passive'] as const) : (['active', 'passive'] as const);
  // The veterans department of the own operational department, if there is one.
  const defaultVeterans = (primaryDepartment && veteransDepartments.find((d) => d.parentId === primaryDepartment)?.id) || '';
  const regularProbation = probationEnd(value('date', today()), rules?.probationMonths ?? 12);
  const probationMode = value('probation', 'regular');
  const probationEndsOn = probationMode === 'waived' ? null : probationMode === 'shortened' ? value('probationEndsOn') || null : regularProbation;
  const toOperational = usePersonAction(
    () =>
      send<Person>('POST', `masterdata/persons/${person.id}/transfer-to-operational`, {
        departmentId: value('department'),
        on: value('date', today()),
        probationEndsOn,
        // The reason field is hidden for the regular probation; text typed before switching back is not sent.
        reason: probationMode === 'regular' ? '' : value('reason'),
        decidedOn: value('decidedOn') || null,
      }),
    done,
  );
  const toVeterans = usePersonAction(
    () => namingModules(() => send<Person>('POST', `masterdata/persons/${person.id}/transfer-to-veterans`, { departmentId: value('department', defaultVeterans), on: value('date', today()), decidedOn: value('decidedOn') || null })),
    done,
  );

  const currentMemberships = person.memberships.map(({ departmentId, from, to, primary: p }) => ({ departmentId, from, to, primary: p }));
  const department = (id: string) => departments.find((d) => d.id === id)?.name ?? '';
  const dialogActions = (submit: () => void, loading: boolean, ok = true) => (
    <Group justify="flex-end">
      <Button variant="default" onClick={close}>{common('actions.cancel')}</Button>
      <Button onClick={submit} loading={loading} disabled={!ok}>{common('actions.save')}</Button>
    </Group>
  );
  const date = (label: string, key = 'date', fallback = today()) => (
    <DateInput label={label} value={value(key, fallback) || null} onChange={(v) => setValue(key, v)} valueFormat="DD.MM.YYYY" required />
  );

  return (
    <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
      <Panel
        title={t('brigade.membership')}
        aside={
          !disabled && person.status !== 'left' && (
            <Group gap="xs">
              {person.status === 'probation' ? (
                <>
                  <Button size="xs" variant="default" onClick={() => open('probation')}>{t('brigade.changeProbation')}</Button>
                  <Button size="xs" variant="outline" onClick={() => open('admission')}>{t('brigade.admit')}</Button>
                </>
              ) : (
                <>
                  {person.status === 'youth' && <Button size="xs" variant="outline" onClick={() => open('toOperational')}>{t('brigade.toOperational')}</Button>}
                  {(person.status === 'active' || person.status === 'passive') && <Button size="xs" variant="outline" onClick={() => open('toVeterans')}>{t('brigade.toVeterans')}</Button>}
                  {person.status !== 'youth' && <Button size="xs" variant="default" onClick={() => open('status')}>{t('brigade.changeStatus')}</Button>}
                </>
              )}
              <Button size="xs" variant="default" onClick={() => open('leave')}>{t('brigade.leave')}</Button>
            </Group>
          )
        }
      >
        <Stack gap={6}>
          <Row label={t('persons.status')}><StatusBadge>{t(`status.${person.status}`)}</StatusBadge></Row>
          {person.status === 'probation' && <Row label={t('brigade.probationEnds')}>{formatDate(person.probationEndsOn, i18n.language)}</Row>}
          {person.admittedOn && <Row label={t('brigade.admittedOn')}>{formatDate(person.admittedOn, i18n.language)}</Row>}
          {person.leftOn && <Row label={t('brigade.leftOn')}>{`${formatDate(person.leftOn, i18n.language)} · ${exitReasonName(person.exitReason, i18n.language)}`}</Row>}
          <Row label={t('brigade.rank')}>{rankName(person.rank, i18n.language)}</Row>
        </Stack>
        <SimpleGrid cols={{ base: 1, sm: 2 }} mt="md">
          <DateInput label={t('brigade.joinedOn')} value={form.joinedOn} onChange={(v) => set('joinedOn', v)} valueFormat="DD.MM.YYYY" disabled={disabled} clearable />
          <TextInput label={t('brigade.personnelNumber')} value={form.personnelNumber ?? ''} onChange={(e) => set('personnelNumber', e.currentTarget.value || null)} disabled={disabled} />
          <Select
            label={t('brigade.employment')}
            description={t('brigade.employmentHint')}
            data={(['volunteer', 'career-higher', 'career-elevated', 'career-intermediate', 'fire-service-employee', 'administration-employee'] as const).map((e) => ({ value: e, label: t(`employment.${e}`) }))}
            value={form.employment}
            onChange={(v) => v && set('employment', v as Person['employment'])}
            allowDeselect={false}
            disabled={disabled}
          />
          <Switch label={t('brigade.musician')} checked={form.musician} onChange={(e) => set('musician', e.currentTarget.checked)} disabled={disabled} mt="lg" />
        </SimpleGrid>
      </Panel>

      <Panel title={t('brigade.departments')} aside={!disabled && <Button size="xs" variant="outline" onClick={() => open('membership')}>{t('brigade.addMembership')}</Button>}>
        <DataTable
          rows={person.memberships.map((m, index) => ({ ...m, index }))}
          rowKey={(m) => m.id}
          columns={[
            { key: 'department', header: t('brigade.department'), render: (m) => department(m.departmentId) },
            { key: 'from', header: t('brigade.from'), render: (m) => formatDate(m.from, i18n.language) },
            { key: 'to', header: t('brigade.to'), render: (m) => (m.to ? formatDate(m.to, i18n.language) : '') },
            { key: 'primary', header: t('brigade.primary'), render: (m) => m.primary && <StatusBadge tone="done">{t('person.primary')}</StatusBadge> },
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (m) =>
                !disabled && !m.primary && !m.to && (
                  <Button size="xs" variant="subtle" onClick={() => memberships.mutate(currentMemberships.map((x, i) => (i === m.index ? { ...x, to: today() } : x)))}>
                    {t('brigade.end')}
                  </Button>
                ),
            },
          ]}
        />
      </Panel>

      <Panel title={t('brigade.ranks')} aside={!disabled && <Button size="xs" variant="outline" onClick={() => open('rank')}>{t('brigade.addRank')}</Button>}>
        <DataTable
          rows={person.ranks.toSorted((a, b) => b.since.localeCompare(a.since))}
          rowKey={(r) => r.id}
          empty={t('brigade.noRanks')}
          columns={[
            { key: 'rank', header: t('brigade.rank'), render: (r) => rankName(r.rank, i18n.language) },
            { key: 'since', header: t('brigade.since'), render: (r) => formatDate(r.since, i18n.language) },
            { key: 'remove', header: '', align: 'right', render: (r) => !disabled && <ActionIcon aria-label={common('actions.delete')} onClick={() => setRemoveRank(r.id)}><IconTrash size={16} /></ActionIcon> },
          ]}
        />
      </Panel>

      <Panel title={t('brigade.driverLicense')}>
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <TagsInput label={t('brigade.licenseClasses')} value={form.driverLicense.classes} onChange={(v) => set('driverLicense', { ...form.driverLicense, classes: v })} disabled={disabled} data={['B', 'BE', 'C1', 'C1E', 'C', 'CE']} />
          <DateInput label={t('brigade.licenseExpires')} value={form.driverLicense.expiresOn} onChange={(v) => set('driverLicense', { ...form.driverLicense, expiresOn: v })} valueFormat="DD.MM.YYYY" clearable disabled={disabled} />
          <DateInput label={t('brigade.licenseChecked')} value={form.driverLicense.lastCheckedOn} onChange={(v) => set('driverLicense', { ...form.driverLicense, lastCheckedOn: v })} valueFormat="DD.MM.YYYY" clearable disabled={disabled} />
        </SimpleGrid>
        <Text size="xs" c="dimmed" mt="xs">{t('brigade.saveHint')}</Text>
      </Panel>

      {dialog === 'probation' && (
        <ResponsiveDialog opened onClose={close} title={t('brigade.changeProbation')} actions={dialogActions(() => probation.mutate(undefined), probation.isPending, Boolean(value('reason').trim()))}>
          <Stack gap="sm">
            {date(t('brigade.probationEnds'), 'date', person.probationEndsOn ?? today())}
            <TextInput label={t('persons.probationReason')} value={value('reason')} onChange={(e) => setValue('reason', e.currentTarget.value)} required />
            <DateInput label={decidedLabel} value={value('decidedOn') || null} onChange={(v) => setValue('decidedOn', v)} valueFormat="DD.MM.YYYY" clearable />
          </Stack>
        </ResponsiveDialog>
      )}
      {dialog === 'admission' && (
        <ResponsiveDialog
          opened
          onClose={close}
          title={t('brigade.admit')}
          actions={dialogActions(() => admission.mutate(undefined), admission.isPending, !admissionBeforeJoining && (!(earlyAdmission || missingQualifications.length) || Boolean(value('reason').trim())))}
        >
          <Stack gap="sm">
            <Text size="sm">{t('brigade.admitText', { name: `${person.firstName} ${person.lastName}` })}</Text>
            {date(decidedLabel)}
            {admissionBeforeJoining && <Notice kind="warning">{t('brigade.admissionBeforeJoining', { date: formatDate(person.joinedOn, i18n.language) })}</Notice>}
            {earlyAdmission && <Notice kind="warning">{t('brigade.admissionEarly', { date: formatDate(person.probationEndsOn, i18n.language) })}</Notice>}
            {missingQualifications.length > 0 && <Notice kind="warning">{t('brigade.admissionMissing', { list: missingQualifications.map((q) => qualificationName(q, i18n.language)).join(', ') })}</Notice>}
            {(earlyAdmission || missingQualifications.length > 0) && (
              <TextInput label={t('brigade.admissionReason')} description={t('brigade.admissionReasonHint')} value={value('reason')} onChange={(e) => setValue('reason', e.currentTarget.value)} required />
            )}
          </Stack>
        </ResponsiveDialog>
      )}
      {dialog === 'status' && (
        <ResponsiveDialog opened onClose={close} title={t('brigade.changeStatus')} actions={dialogActions(() => status.mutate(undefined), status.isPending)}>
          <Stack gap="sm">
            <Radio.Group label={t('brigade.newStatus')} value={value('status', person.status === 'left' || person.status === 'probation' ? 'active' : person.status)} onChange={(v) => setValue('status', v)}>
              <Group mt={4}>{statusTargets.map((s) => <Radio key={s} value={s} label={t(`status.${s}`)} />)}</Group>
            </Radio.Group>
            {person.status !== 'veterans' && <Text size="xs" c="dimmed">{t('brigade.statusTransferHint')}</Text>}
            {date(t('brigade.effectiveOn'))}
          </Stack>
        </ResponsiveDialog>
      )}
      {dialog === 'leave' && (
        <ResponsiveDialog opened onClose={close} title={t('brigade.leave')} actions={dialogActions(() => leave.mutate(undefined), leave.isPending, Boolean(value('reason')))}>
          <Stack gap="sm">
            <Text size="sm">{t('brigade.leaveText', { name: `${person.firstName} ${person.lastName}` })}</Text>
            {date(t('brigade.leftOn'))}
            <Select label={t('brigade.exitReason')} data={exitReasons.map((r) => ({ value: r.key, label: localized(r.name) }))} value={value('reason') || null} onChange={(v) => setValue('reason', v)} required />
          </Stack>
        </ResponsiveDialog>
      )}
      {dialog === 'membership' && (
        <ResponsiveDialog
          opened
          onClose={close}
          title={t('brigade.addMembership')}
          actions={dialogActions(
            () =>
              memberships.mutate([
                ...currentMemberships.map((m) => (primary && !m.to ? { ...m, primary: false } : m)),
                { departmentId: value('department'), from: value('date', today()), to: null, primary },
              ]),
            memberships.isPending,
            Boolean(value('department')),
          )}
        >
          <Stack gap="sm">
            <Select label={t('brigade.department')} data={departments.map((d) => ({ value: d.id, label: d.name }))} value={value('department') || null} onChange={(v) => setValue('department', v)} required />
            {date(t('brigade.from'))}
            <Checkbox label={t('brigade.makePrimary')} description={t('brigade.makePrimaryHint')} checked={primary} onChange={(e) => setPrimary(e.currentTarget.checked)} />
          </Stack>
        </ResponsiveDialog>
      )}
      {dialog === 'toOperational' && (
        <ResponsiveDialog
          opened
          onClose={close}
          title={t('brigade.toOperational')}
          actions={dialogActions(
            () => toOperational.mutate(undefined),
            toOperational.isPending,
            Boolean(value('department')) && (probationMode === 'regular' || Boolean(value('reason').trim())) && (probationMode !== 'shortened' || Boolean(probationEndsOn)),
          )}
        >
          <Stack gap="sm">
            <Text size="sm">{t('brigade.toOperationalText', { name: `${person.firstName} ${person.lastName}` })}</Text>
            <Select label={t('brigade.targetDepartment')} data={operationalDepartments.map((d) => ({ value: d.id, label: d.name }))} value={value('department') || null} onChange={(v) => setValue('department', v)} required />
            {date(t('brigade.transferOn'))}
            <Radio.Group label={t('brigade.probation')} value={probationMode} onChange={(v) => setValue('probation', v)}>
              <Stack gap={6} mt={4}>
                <Radio value="regular" label={t('brigade.probationRegular', { date: formatDate(regularProbation, i18n.language) })} />
                <Radio value="shortened" label={t('brigade.probationShortened')} />
                <Radio value="waived" label={t('brigade.probationWaived')} />
              </Stack>
            </Radio.Group>
            {probationMode === 'shortened' && (
              <DateInput label={t('brigade.probationEnds')} value={value('probationEndsOn') || null} onChange={(v) => setValue('probationEndsOn', v)} valueFormat="DD.MM.YYYY" required />
            )}
            {probationMode !== 'regular' && (
              <TextInput label={t('persons.probationReason')} description={t('brigade.probationReasonHint')} value={value('reason')} onChange={(e) => setValue('reason', e.currentTarget.value)} required />
            )}
            <DateInput label={decidedLabel} value={value('decidedOn') || null} onChange={(v) => setValue('decidedOn', v)} valueFormat="DD.MM.YYYY" clearable />
          </Stack>
        </ResponsiveDialog>
      )}
      {dialog === 'toVeterans' && (
        <ResponsiveDialog
          opened
          onClose={close}
          title={t('brigade.toVeterans')}
          actions={dialogActions(() => toVeterans.mutate(undefined), toVeterans.isPending, Boolean(value('department', defaultVeterans)))}
        >
          <Stack gap="sm">
            <Text size="sm">{t('brigade.toVeteransText', { name: `${person.firstName} ${person.lastName}`, age: rules?.veteransApplicationAge ?? 55, limit: rules?.ageLimitOperational ?? 65 })}</Text>
            <Select label={t('brigade.targetDepartment')} data={veteransDepartments.map((d) => ({ value: d.id, label: d.name }))} value={value('department', defaultVeterans) || null} onChange={(v) => setValue('department', v)} required />
            {date(t('brigade.transferOn'))}
            <DateInput label={decidedLabel} value={value('decidedOn') || null} onChange={(v) => setValue('decidedOn', v)} valueFormat="DD.MM.YYYY" clearable />
          </Stack>
        </ResponsiveDialog>
      )}
      {dialog === 'rank' && (
        <ResponsiveDialog opened onClose={close} title={t('brigade.addRank')} actions={dialogActions(() => addRank.mutate(undefined), addRank.isPending, Boolean(value('rank')))}>
          <Stack gap="sm">
            <Select label={t('brigade.rank')} data={ranks.filter((r) => r.active).map((r) => ({ value: r.key, label: localized(r.name) }))} value={value('rank') || null} onChange={(v) => setValue('rank', v)} required />
            {date(t('brigade.since'))}
          </Stack>
        </ResponsiveDialog>
      )}
      <ConfirmDialog
        opened={!!removeRank}
        onClose={() => setRemoveRank(null)}
        title={t('brigade.removeRankTitle')}
        confirmLabel={common('actions.delete')}
        onConfirm={() => {
          if (removeRank) deleteRank.mutate(removeRank);
          setRemoveRank(null);
        }}
      />
    </SimpleGrid>
  );
}
