import { Button, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import { type ReactNode, useState } from 'react';
import { Link, useParams } from 'react-router';
import { classNames, type DriverLicenseCheck, type DriverLicenseDue, type DriverLicenseFile, type DriverLicenseLastCheck } from '@forga/masterdata-contracts';
import { formatDate, formatDateTime, useTranslation } from '@forga/web-sdk';
import { DataTable, EmptyState, PageHeader, Panel, StatusBadge } from '@forga/web-ui';
import { personName, today, useDepartments } from '../api';
import { STATE_TONES, useLicenseFile } from './api';
import { CheckDialog, ReasonDialog, RequestDialog, RevokeDialog, TokenDialog } from './dialogs';

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Group gap="xs" wrap="nowrap" align="start">
      <Text size="sm" c="dimmed" w={160} style={{ flexShrink: 0 }}>{label}</Text>
      <Text size="sm" component="div">{children || '–'}</Text>
    </Group>
  );
}

/** "16.04.2026 · Original vorgelegt · Markus Vogt" */
export function useCheckText() {
  const { t, i18n } = useTranslation('masterdata');
  return (check: DriverLicenseLastCheck | null) =>
    check ? [formatDate(check.checkedOn, i18n.language), t(`licenses.methods.${check.method}`), check.checkedBy].filter(Boolean).join(' · ') : '';
}

/** "16.04.2031 (Ablauf C, CE)" */
export function useDueText() {
  const { t, i18n } = useTranslation('masterdata');
  return (due: DriverLicenseDue | null) => (due ? `${formatDate(due.dueOn, i18n.language)} (${t(`licenses.dues.${due.kind}`, { classes: due.classes.join(', ') })})` : '');
}

type Dialog =
  | { kind: 'check' }
  | { kind: 'request' }
  | { kind: 'token' }
  | { kind: 'revoke'; tokenId: string; suffix: string }
  | { kind: 'cancel'; check: DriverLicenseCheck }
  | { kind: 'withdraw'; requestId: string }
  | null;

function LicenseFile({ file }: { file: DriverLicenseFile }) {
  const { t, i18n } = useTranslation('masterdata');
  const { data: departments = [] } = useDepartments();
  const [dialog, setDialog] = useState<Dialog>(null);
  const checkText = useCheckText();
  const dueText = useDueText();
  const [day] = useState(today);
  const name = personName(file.person);
  const license = file.license;

  // Classes with the same expiry in one row, as on the licence ("C, CE · 16.04.2031").
  const groups = [...new Set(license.classes.map((c) => c.expiresOn ?? ''))].map((expiresOn) => ({
    expiresOn: expiresOn || null,
    classes: license.classes.filter((c) => (c.expiresOn ?? '') === expiresOn).map((c) => c.class),
  }));
  const token = file.tokens.find((x) => !x.revokedAt);
  const open = file.requests.find((r) => !r.completedByCheckId && !r.withdrawnAt);
  const subtitle = departments.filter((d) => file.person.departmentIds.includes(d.id)).map((d) => d.name).join(', ');
  const examiner = (c: DriverLicenseCheck) => c.checkedBy?.name ?? (c.device || t('licenses.unknownExaminer'));

  return (
    <Stack gap="lg">
      <PageHeader
        breadcrumbs={[{ label: t('module') }, { label: t('persons.title'), to: '/masterdata/persons' }, { label: name, to: `/masterdata/persons/${file.person.id}?tab=brigade` }, { label: t('licenses.title') }]}
        title={name}
        subtitle={subtitle}
        badges={
          <Group gap={4}>
            <StatusBadge tone={file.person.status === 'active' ? 'done' : 'neutral'}>{t(`status.${file.person.status}`)}</StatusBadge>
            {file.state && <StatusBadge tone={STATE_TONES[file.state]}>{t(`licenses.states.${file.state}`)}</StatusBadge>}
          </Group>
        }
      />
      <Text size="sm" c="dimmed">{t(`licenses.modeHint.${file.mode}`)}</Text>
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg" style={{ alignItems: 'start' }}>
        <Panel
          title={t('licenses.title')}
          aside={
            file.canCheck && (
              <Group gap="xs" wrap="nowrap">
                <Button size="xs" variant="default" onClick={() => setDialog({ kind: 'request' })}>{t('licenses.request.open')}</Button>
                <Button size="xs" onClick={() => setDialog({ kind: 'check' })}>{t('licenses.check.open')}</Button>
              </Group>
            )
          }
        >
          <Stack gap="md">
            <DataTable
              rows={groups}
              rowKey={(g) => g.expiresOn ?? 'none'}
              empty={t('licenses.noClasses')}
              columns={[
                { key: 'classes', header: t('licenses.class'), render: (g) => g.classes.join(', ') },
                { key: 'until', header: t('licenses.validUntil'), render: (g) => (g.expiresOn ? formatDate(g.expiresOn, i18n.language) : t('licenses.unlimited')) },
                {
                  key: 'state',
                  header: t('licenses.state'),
                  render: (g) => (
                    <Group gap={4}>
                      {g.expiresOn && g.expiresOn < day ? <StatusBadge tone="error">{t('licenses.expired')}</StatusBadge> : <StatusBadge tone="done">{t('licenses.valid')}</StatusBadge>}
                      {g.expiresOn && license.expiryToVerify && <StatusBadge tone="warning">{t('licenses.expiryToVerify')}</StatusBadge>}
                    </Group>
                  ),
                },
              ]}
            />
            <Stack gap={4}>
              <Line label={t('licenses.firstCheck')}>{checkText(file.firstCheck)}</Line>
              <Line label={t('licenses.lastCheck')}>{checkText(file.lastCheck)}</Line>
              <Line label={t('licenses.nextCheck')}>
                {file.monitored ? (
                  <Group gap={6}>
                    <span>{dueText(file.dues[0] ?? null) || t('licenses.noDue')}</span>
                    <StatusBadge>{t(`licenses.modes.${file.mode}`)}</StatusBadge>
                  </Group>
                ) : (
                  t('licenses.notMonitored')
                )}
              </Line>
              <Line label={t('licenses.documentExpiresOn')}>
                {license.documentExpiresOn && (
                  <Group gap={6}>
                    <span>{formatDate(license.documentExpiresOn, i18n.language)}</span>
                    {license.documentExpiresOn < day && <StatusBadge tone="warning">{t('licenses.documentExpired')}</StatusBadge>}
                  </Group>
                )}
              </Line>
            </Stack>
            <Text fw={700}>{t('licenses.checks')}</Text>
            <DataTable<DriverLicenseCheck>
              rows={file.checks}
              rowKey={(c) => c.id}
              empty={t('licenses.noChecks')}
              columns={[
                { key: 'date', header: t('licenses.check.date'), render: (c) => formatDate(c.checkedOn, i18n.language) },
                {
                  key: 'method',
                  header: t('licenses.method'),
                  render: (c) => (
                    <Stack gap={2}>
                      <StatusBadge tone={c.cancelledAt ? 'neutral' : c.method === 'in-person' ? 'done' : 'neutral'}>{t(`licenses.methods.${c.method}`)}</StatusBadge>
                      {c.cancelledAt ? (
                        <Text size="xs" c="red">{t('licenses.cancelled', { date: formatDateTime(c.cancelledAt, i18n.language), name: c.cancelledBy ?? '', reason: c.cancelReason ?? '' })}</Text>
                      ) : (
                        <Text size="xs" c="dimmed">{[c.first && t('licenses.first'), c.selfDeclaration && t('licenses.declared'), c.requestId && t('licenses.settledRequest'), c.note].filter(Boolean).join(' · ')}</Text>
                      )}
                    </Stack>
                  ),
                },
                { key: 'examiner', header: t('licenses.check.examiner'), render: examiner },
                { key: 'classes', header: t('licenses.classes'), render: (c) => classNames(c.classes) || '–' },
                {
                  key: 'actions',
                  header: '',
                  align: 'right',
                  render: (c) =>
                    file.canCheck && !c.cancelledAt && (
                      <Button size="compact-xs" variant="subtle" onClick={() => setDialog({ kind: 'cancel', check: c })}>{t('licenses.cancel.open')}</Button>
                    ),
                },
              ]}
            />
          </Stack>
        </Panel>
        <Stack gap="lg">
          {file.canCheck && (
            <Panel title={t('licenses.token.panel')}>
              <Stack gap="xs">
                {token ? (
                  <>
                    <Line label={t('licenses.token.kind')}>{t(`licenses.token.${token.kind}`)}</Line>
                    <Line label={t('licenses.token.code')}>…{token.suffix}</Line>
                    <Line label={t('licenses.token.registered')}>{`${formatDate(token.registeredAt, i18n.language)} · ${token.registeredBy}`}</Line>
                    <Group gap="xs" mt="xs">
                      <Button size="xs" variant="default" onClick={() => setDialog({ kind: 'token' })}>{t('licenses.token.replace')}</Button>
                      <Button size="xs" variant="default" color="red" onClick={() => setDialog({ kind: 'revoke', tokenId: token.id, suffix: token.suffix })}>{t('licenses.revoke.open')}</Button>
                    </Group>
                  </>
                ) : (
                  <>
                    <Text size="sm" c="dimmed">{t('licenses.token.none')}</Text>
                    <Group><Button size="xs" variant="default" onClick={() => setDialog({ kind: 'token' })}>{t('licenses.token.open')}</Button></Group>
                  </>
                )}
                <Text size="xs" c="dimmed" mt="xs">{file.selfCheck ? t('licenses.token.selfCheckOn') : t('licenses.token.selfCheckOff')}</Text>
              </Stack>
            </Panel>
          )}
          <Panel title={t('licenses.request.panel')}>
            {open ? (
              <Stack gap={4}>
                {open.reason && <Line label={t('licenses.request.reason')}>{open.reason}</Line>}
                <Line label={t('licenses.request.dueOn')}>{formatDate(open.dueOn, i18n.language)}</Line>
                <Line label={t('licenses.request.requested')}>{`${formatDate(open.requestedAt, i18n.language)} · ${open.requestedBy}`}</Line>
                {file.canCheck && (
                  <Group mt="xs"><Button size="xs" variant="default" onClick={() => setDialog({ kind: 'withdraw', requestId: open.id })}>{t('licenses.withdraw.open')}</Button></Group>
                )}
              </Stack>
            ) : (
              <Text size="sm" c="dimmed">{t('licenses.request.none')}</Text>
            )}
          </Panel>
        </Stack>
      </SimpleGrid>
      {dialog?.kind === 'check' && <CheckDialog file={file} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'request' && <RequestDialog file={file} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'token' && <TokenDialog file={file} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'revoke' && <RevokeDialog file={file} tokenId={dialog.tokenId} suffix={dialog.suffix} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'cancel' && (
        <ReasonDialog
          file={file}
          path={`checks/${dialog.check.id}/cancel`}
          title={t('licenses.cancel.title')}
          description={t('licenses.cancel.text', { date: formatDate(dialog.check.checkedOn, i18n.language) })}
          confirmLabel={t('licenses.cancel.confirm')}
          reasonLabel={t('licenses.cancel.reason')}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'withdraw' && (
        <ReasonDialog
          file={file}
          path={`requests/${dialog.requestId}/withdraw`}
          title={t('licenses.withdraw.title')}
          description={t('licenses.withdraw.text')}
          confirmLabel={t('licenses.withdraw.confirm')}
          reasonLabel={t('licenses.withdraw.reason')}
          onClose={() => setDialog(null)}
        />
      )}
    </Stack>
  );
}

/** Driving licence of a person: classes with their expiry, checks, request to present it again and sticker. */
export function LicensePage() {
  const { id = '' } = useParams();
  const { t } = useTranslation('masterdata');
  const { data: file, error } = useLicenseFile(id);
  if (error) return <EmptyState title={t('person.notFound')} action={<Button component={Link} to="/masterdata/persons" variant="default">{t('persons.title')}</Button>} />;
  if (!file) return null;
  return <LicenseFile file={file} />;
}
