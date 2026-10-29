import { ActionIcon, Anchor, Button, Group, Stack, Text } from '@mantine/core';
import { IconPencil, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { Link } from 'react-router';
import type { Evidence } from '@forga/respiratory-protection-contracts';
import { apiUrl, can, formatDate, send, useSession, useTranslation } from '@forga/web-sdk';
import { ConfirmDialog, DataTable, Notice, Panel, StepUpButton, useAction } from '@forga/web-ui';
import { EVIDENCE, EXAMINATIONS, keys, usePersonRespiratoryProtection } from '../api';
import { ConditionList, FitnessBadge } from '../parts';
import { EvidenceDialog, KINDS } from './EvidenceDialog';

/** Tab "Atemschutz" in the person file (extension point `masterdata.person.tab`). */
export function PersonTab({ personId }: { personId?: unknown }) {
  const id = String(personId);
  const { t, i18n } = useTranslation('respiratory-protection');
  const session = useSession().data;
  const { data } = usePersonRespiratoryProtection(id);
  const [editing, setEditing] = useState<Evidence | 'new' | null>(null);
  const [removing, setRemoving] = useState<Evidence | null>(null);
  const remove = useAction(() => send('DELETE', `respiratory-protection/evidence/${removing!.id}`), { success: t('evidence.deleted'), invalidate: [keys.all], onSuccess: () => setRemoving(null) });
  if (!data) return null;

  const { status, evidence } = data;
  const allowed = (permission: string) => status.departmentIds.some((d) => can(session, permission, d));
  const kinds = KINDS.filter((k) => allowed(k === 'examination' ? EXAMINATIONS : EVIDENCE));
  const editable = (e: Evidence) => (e.source === 'manual' || e.source === 'import') && kinds.includes(e.kind);

  return (
    <Stack gap="lg">
      {data.stepUpAvailable && <Notice kind="info" action={<StepUpButton>{t('person.showExaminations')}</StepUpButton>}>{t('person.examinationsHidden')}</Notice>}
      <Panel
        title={t('person.title')}
        aside={
          <Group gap="sm">
            <FitnessBadge color={status.color} />
            {status.color !== 'grey' && (
              <Button component="a" href={apiUrl('core/lists/respiratory-protection.record/export/pdf', { personId: id, lang: i18n.language })} target="_blank" size="xs" variant="default">
                {t('person.recordPdf')}
              </Button>
            )}
          </Group>
        }
      >
        {status.color === 'grey' ? <Text size="sm" c="dimmed">{t('person.noWearer')}</Text> : <ConditionList conditions={status.conditions} />}
      </Panel>
      <Panel title={t('person.evidence')} aside={kinds.length > 0 && <Button size="xs" onClick={() => setEditing('new')}>{t('evidence.add')}</Button>}>
        <DataTable<Evidence>
          rows={evidence}
          rowKey={(e) => e.id}
          empty={t('person.noEvidence')}
          columns={[
            { key: 'date', header: t('evidence.date'), render: (e) => formatDate(e.date, i18n.language) },
            { key: 'kind', header: t('evidence.kind'), render: (e) => <Text size="sm" td={e.withdrawn ? 'line-through' : undefined}>{t(`kind.${e.kind}`)}</Text> },
            {
              key: 'details',
              header: t('evidence.details'),
              render: (e) =>
                [
                  e.result && t(`result.${e.result}`),
                  e.validUntil && t('evidence.validUntilShort', { date: formatDate(e.validUntil, i18n.language) }),
                  e.restrictions,
                  e.examinationGroup && t(`examinationGroup.${e.examinationGroup}`),
                  e.device && t(`device.${e.device}`),
                  e.facility,
                  e.kilojoules !== null && `${e.kilojoules} kJ`,
                  e.passed === false && t('evidence.notPassed'),
                  e.minutes !== null && t('evidence.minutesShort', { minutes: e.minutes }),
                  e.note,
                  e.withdrawn && t('evidence.withdrawn'),
                ]
                  .filter(Boolean)
                  .join(' · '),
            },
            {
              key: 'source',
              header: t('evidence.source'),
              render: (e) => {
                // Reports and sessions the evidence comes from are linked.
                const to = e.sourceId && e.source === 'incidents' ? `/incidents/reports/${e.sourceId}` : e.sourceId && e.source === 'training' ? `/training/sessions/${e.sourceId}` : null;
                return to ? <Anchor component={Link} to={to} size="sm">{t(`source.${e.source}`)}</Anchor> : t(`source.${e.source}`);
              },
            },
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (e) =>
                editable(e) && (
                  <Group gap={4} justify="flex-end" wrap="nowrap">
                    <ActionIcon variant="subtle" aria-label={t('evidence.edit')} onClick={() => setEditing(e)}><IconPencil size={16} /></ActionIcon>
                    <ActionIcon variant="subtle" color="red" aria-label={t('evidence.delete')} onClick={() => setRemoving(e)}><IconTrash size={16} /></ActionIcon>
                  </Group>
                ),
            },
          ]}
        />
      </Panel>
      {editing && <EvidenceDialog personId={id} evidence={editing === 'new' ? undefined : editing} kinds={kinds} minimumKilojoules={status.minimumKilojoules} onClose={() => setEditing(null)} />}
      {removing && (
        <ConfirmDialog
          opened
          onClose={() => setRemoving(null)}
          title={t('evidence.deleteTitle')}
          description={t('evidence.deleteText', { kind: t(`kind.${removing.kind}`), date: formatDate(removing.date, i18n.language) })}
          confirmLabel={t('evidence.delete')}
          loading={remove.isPending}
          onConfirm={() => remove.mutate(undefined)}
        />
      )}
    </Stack>
  );
}
