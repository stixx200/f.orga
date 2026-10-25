import { Button, Group, Radio, Stack, Text } from '@mantine/core';
import { type ReactNode, useState } from 'react';
import type { Report } from '@forga/incidents-contracts';
import { can, formatMoney, send, useSession, useTranslation } from '@forga/web-sdk';
import { ConfirmDialog, Panel, useAction } from '@forga/web-ui';
import { keys, RELEASE, REVIEW, UNLOCK, useNames, useSettings } from './api';

/** Long labels wrap in narrow panels instead of being cut off. */
const WRAP = { root: { height: 'auto', minHeight: 36, paddingBlock: 8 }, label: { whiteSpace: 'normal' as const } };

type Dialog = 'compensation' | 'billing' | 'return' | 'unlock' | null;

/**
 * Actions of the releaser on a report: release in one or two steps, return to the author, unlock.
 * Shows nothing for users without the permissions.
 */
export function WorkflowActions({ report, onDone, framed }: { report: Report; onDone?: () => void; framed?: boolean }) {
  const { t, i18n } = useTranslation('incidents');
  const session = useSession().data;
  const names = useNames();
  const { data: settings } = useSettings();
  const [dialog, setDialog] = useState<Dialog>(null);
  // A locked draft was never submitted: it can only go back to the author.
  const [toStatus, setToStatus] = useState<'review' | 'draft'>(report.status === 'draft' ? 'draft' : 'review');
  const twoSteps = settings?.compensationRelease ?? true;
  const mayRelease = can(session, RELEASE, report.departmentId);
  const mayUnlock = can(session, UNLOCK, report.departmentId);
  // Department commanders pre-review: they return reports of their department, but do not release. A report
  // locked by a releaser is returned only by releasers.
  const mayReturn = mayRelease || (can(session, REVIEW, report.departmentId) && !report.locked);
  const invalidate = [keys.report(report.id), keys.incidents];
  const done = () => {
    setDialog(null);
    onDone?.();
  };
  const release = useAction((level: 'compensation' | 'billing') => send<Report>('POST', `incidents/reports/${report.id}/release`, { level }), {
    invalidate,
    success: t('workflow.released'),
    onSuccess: done,
  });
  const giveBack = useAction((comment: string) => send<Report>('POST', `incidents/reports/${report.id}/return`, { comment }), {
    invalidate,
    success: t('workflow.returned'),
    onSuccess: done,
  });
  const unlock = useAction((reason: string) => send<Report>('POST', `incidents/reports/${report.id}/unlock`, { reason, toStatus }), {
    invalidate,
    success: t('workflow.unlocked'),
    onSuccess: done,
  });

  const errors = report.findings.filter((f) => f.level === 'error').length;
  const label = `${names.departmentName(report.departmentId)} · ${report.number}`;
  const summary = t('workflow.summary', { count: report.personnel.length, amount: formatMoney(report.compensationTotal, i18n.language) });
  const buttons: ReactNode[] = [];
  if (mayRelease && report.status === 'review') {
    buttons.push(
      <Button key="release" size="md" disabled={errors > 0} styles={WRAP} onClick={() => setDialog(twoSteps ? 'compensation' : 'billing')}>
        {t(twoSteps ? 'workflow.releaseCompensation' : 'workflow.releaseBilling')}
      </Button>,
    );
  }
  if (mayReturn && report.status === 'review') {
    buttons.push(<Button key="return" variant="default" onClick={() => setDialog('return')}>{t('workflow.return')}</Button>);
  }
  if (mayRelease && report.status === 'released-compensation') {
    buttons.push(<Button key="billing" variant="outline" onClick={() => setDialog('billing')}>{t('workflow.releaseBilling')}</Button>);
  }
  if (mayUnlock && (report.locked || report.status.startsWith('released'))) {
    buttons.push(<Button key="unlock" variant="default" onClick={() => setDialog('unlock')}>{t('workflow.unlock')}</Button>);
  }
  if (!buttons.length) return null;

  const content = (
    <Stack gap="xs">
      {report.status === 'review' && twoSteps && mayRelease && <Text size="xs" c="dimmed">{t('workflow.stepHint')}</Text>}
      {errors > 0 && report.status === 'review' && <Text size="sm" c="brand">{t('workflow.errorsBlock', { count: errors })}</Text>}
      {framed ? <Group gap="sm">{buttons}</Group> : buttons}
      {(dialog === 'compensation' || dialog === 'billing') && (
        <ConfirmDialog
          opened
          onClose={() => setDialog(null)}
          title={t('workflow.releaseTitle')}
          description={t(dialog === 'compensation' ? 'workflow.releaseCompensationText' : 'workflow.releaseBillingText', { report: label })}
          confirmLabel={t('workflow.releaseNow')}
          loading={release.isPending}
          onConfirm={() => release.mutate(dialog)}
        >
          <Text size="sm" fw={700} mt="xs">{summary}</Text>
        </ConfirmDialog>
      )}
      {dialog === 'return' && (
        <ConfirmDialog
          opened
          onClose={() => setDialog(null)}
          title={t('workflow.returnTitle')}
          description={t('workflow.returnText', { author: names.person(report.authorPersonId) || t('workflow.theAuthor') })}
          reason={t('workflow.returnReason')}
          confirmLabel={t('workflow.returnConfirm')}
          loading={giveBack.isPending}
          onConfirm={(comment) => giveBack.mutate(comment)}
        />
      )}
      {dialog === 'unlock' && (
        <ConfirmDialog
          opened
          onClose={() => setDialog(null)}
          title={t('workflow.unlockTitle')}
          description={report.lockedBy ? t('workflow.unlockText', { report: label, by: report.lockedBy }) : label}
          reason={t('workflow.unlockReason')}
          confirmLabel={t('workflow.unlock')}
          loading={unlock.isPending}
          onConfirm={(reason) => unlock.mutate(reason)}
        >
          <Radio.Group label={t('workflow.unlockTo')} value={toStatus} onChange={(v) => setToStatus(v as 'review' | 'draft')} my="sm">
            <Stack gap={6} mt={4}>
              <Radio value="review" label={t('workflow.unlockToReview')} disabled={report.status === 'draft'} />
              <Radio value="draft" label={t('workflow.unlockToDraft')} />
            </Stack>
          </Radio.Group>
        </ConfirmDialog>
      )}
    </Stack>
  );
  return framed ? <Panel title={t('workflow.title')}>{content}</Panel> : content;
}
