import { Button, Stack, Text, Textarea } from '@mantine/core';
import type { Finding } from '@forga/incidents-contracts';
import { useTranslation } from '@forga/web-sdk';
import { Notice, Panel } from '@forga/web-ui';
import { type StepId, stepOf } from './editor';
import { findingKey, findingText, mergeFindings } from './findings';

/** All findings of the rules: errors block submitting, warnings need a reason. */
export function CheckSection({ findings, reasons, setReason, goTo, editable }: {
  findings: Finding[];
  reasons: Record<string, string>;
  setReason: (key: string, value: string) => void;
  goTo: (step: StepId) => void;
  editable: boolean;
}) {
  const { t } = useTranslation('incidents');
  const errors = mergeFindings(findings).filter((f) => f.level === 'error');
  const warnings = mergeFindings(findings).filter((f) => f.level === 'warning');
  return (
    <Panel title={t('check.title')}>
      <Stack gap="sm">
        {errors.map((f) => (
          <Notice key={findingKey(f)} kind="error" action={<Button size="xs" variant="outline" onClick={() => goTo(stepOf(f))}>{t('check.goTo')}</Button>}>
            {findingText(f, t)}
          </Notice>
        ))}
        {warnings.map((f) => (
          <Notice key={findingKey(f)} kind="warning" action={<Button size="xs" variant="outline" onClick={() => goTo(stepOf(f))}>{t('check.goTo')}</Button>}>
            <Stack gap={6}>
              <span>{findingText(f, t)}</span>
              {f.acknowledged ? (
                <Text size="sm">{t('check.reasonGiven', { reason: f.reason === 'released' ? t('check.releasedReason') : f.reason })}</Text>
              ) : (
                editable && (
                  <Textarea
                    label={t('check.reason')}
                    description={t('check.reasonHint')}
                    value={reasons[findingKey(f)] ?? ''}
                    onChange={(e) => setReason(findingKey(f), e.currentTarget.value)}
                    autosize
                    minRows={2}
                  />
                )
              )}
            </Stack>
          </Notice>
        ))}
        {!findings.length && <Notice kind="done">{t('check.allGood')}</Notice>}
        <Text size="sm" c="dimmed">{t('check.hint')}</Text>
      </Stack>
    </Panel>
  );
}
