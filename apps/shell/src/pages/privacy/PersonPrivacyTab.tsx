import { Anchor, Button, Group, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import type { PrivacyInformation, ProcessingRestriction } from '@forga/core-contracts';
import { api, formatDate, formatDateTime, unlocked, useSession, useTranslation } from '@forga/web-sdk';
import { DataTable, Notice, Panel, StatusBadge, StepUpButton } from '@forga/web-ui';
import { AccessReportsPanel } from '../../privacy/AccessReports';
import { PRIVACY, usePersonPrivacy } from './api';
import { InformationDialog, LiftDialog, RequestDialog, RestrictDialog } from './dialogs';
import { DeadlineBadge, Field, STATUS_TONES } from './PrivacyPage';

interface PersonPrivacyFields {
  firstName: string;
  lastName: string;
  processingRestriction: ProcessingRestriction | null;
  privacyInformation: PrivacyInformation | null;
}

/**
 * Tab „Datenschutz“ of the person file (extension point `masterdata.person.tab`, contributed by the shell): requests of
 * the person, privacy notice and information, restriction of processing.
 */
export function PersonPrivacyTab({ personId }: { personId: string }) {
  const { t } = useTranslation('shell');
  const session = useSession().data;
  if (!unlocked(session, PRIVACY)) {
    return <Notice kind="info" action={<StepUpButton>{t('privacy.person.stepUpButton')}</StepUpButton>}>{t('privacy.person.stepUp')}</Notice>;
  }
  return <PersonPrivacyDetails personId={personId} />;
}

function PersonPrivacyDetails({ personId }: { personId: string }) {
  const { t, i18n } = useTranslation('shell');
  const { data: privacy } = usePersonPrivacy(personId);
  const { data: person } = useQuery({ queryKey: ['masterdata', 'persons', personId, 'privacy'], queryFn: () => api<PersonPrivacyFields>(`masterdata/persons/${personId}`) });
  const [dialog, setDialog] = useState<'request' | 'restrict' | 'lift' | 'information' | null>(null);
  if (!privacy || !person) return null;
  const name = `${person.firstName} ${person.lastName}`;
  const restriction = person.processingRestriction;
  const information = person.privacyInformation;
  return (
    <Stack gap="lg">
      <Panel title={t('privacy.person.requests')} aside={<Button size="xs" variant="default" onClick={() => setDialog('request')}>{t('privacy.requests.create')}</Button>}>
        <Stack gap="sm">
          <DataTable
            rows={privacy.requests}
            rowKey={(r) => r.id}
            empty={t('privacy.person.none')}
            columns={[
              { key: 'kind', header: t('privacy.requests.columns.kind'), render: (r) => <Anchor component={Link} to={`/admin/privacy/requests/${r.id}`}>{t(`privacy.kinds.${r.kind}`)}</Anchor> },
              { key: 'received', header: t('privacy.requests.columns.received'), render: (r) => `${formatDate(r.receivedOn, i18n.language)} · ${t(`privacy.channels.${r.channel}`)}` },
              { key: 'deadline', header: t('privacy.requests.columns.deadline'), render: (r) => <DeadlineBadge request={r} /> },
              { key: 'status', header: t('privacy.requests.columns.status'), render: (r) => <StatusBadge tone={STATUS_TONES[r.status]}>{t(`privacy.statuses.${r.status}`)}</StatusBadge> },
            ]}
          />
          <Text size="xs" c="dimmed">{t('privacy.person.deadlineHint')}</Text>
        </Stack>
      </Panel>
      <AccessReportsPanel personId={personId} />
      <Panel title={t('privacy.person.info')}>
        <Stack gap="xs">
          <Field label={t('privacy.person.notice')}>
            {!privacy.notice
              ? t('privacy.person.noUser')
              : privacy.notice.acknowledgedAt
                ? t('privacy.person.noticeAck', { version: privacy.notice.version, date: formatDateTime(privacy.notice.acknowledgedAt, i18n.language) })
                : t('privacy.person.noticeNotAck')}
          </Field>
          <Field label={t('privacy.person.information')}>
            {information ? t('privacy.person.informed', { date: formatDate(information.informedOn, i18n.language), via: t(`privacy.via.${information.via}`) }) : t('privacy.person.notInformed')}
          </Field>
          <Field label={t('privacy.person.processing')}>
            {restriction ? (
              <Group gap={6}>
                <StatusBadge tone="error">{t('privacy.restriction.badge')}</StatusBadge>
                <span>
                  {[t('privacy.restriction.since', { date: formatDate(restriction.restrictedAt, i18n.language), reason: t(`privacy.reasons.${restriction.reason}`) }), restriction.until && t('privacy.restriction.untilPlanned', { date: formatDate(restriction.until, i18n.language) })]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </Group>
            ) : (
              t('privacy.restriction.none')
            )}
          </Field>
          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={() => setDialog('information')}>{t('privacy.information.recordOne')}</Button>
            {restriction ? (
              <Button variant="default" onClick={() => setDialog('lift')}>{t('privacy.restriction.lift')}</Button>
            ) : (
              <Button variant="default" onClick={() => setDialog('restrict')}>{t('privacy.restriction.restrict')}</Button>
            )}
          </Group>
        </Stack>
      </Panel>
      {dialog === 'request' && <RequestDialog personId={personId} onClose={() => setDialog(null)} />}
      {dialog === 'restrict' && <RestrictDialog personId={personId} name={name} onClose={() => setDialog(null)} />}
      {dialog === 'lift' && <LiftDialog personId={personId} name={name} onClose={() => setDialog(null)} />}
      {dialog === 'information' && <InformationDialog personIds={[personId]} onClose={() => setDialog(null)} />}
    </Stack>
  );
}
