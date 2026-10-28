import { Anchor, Button, FileInput, Group, Stack, Text } from '@mantine/core';
import { IconUpload } from '@tabler/icons-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { MpFeuerRun } from '@forga/mp-feuer-contracts';
import { uploadFiles, useCan, useTranslation } from '@forga/web-sdk';
import { EmptyState, Notice, Panel, useAction } from '@forga/web-ui';
import { isRunning, keys, TRANSFER, useRuns } from '../api';
import { ModulePage } from '../components/ModulePage';
import { RunSteps } from '../components/RunSteps';

/** "Neue Übernahme", step 1: the transfer files of all departments. */
export function NewRunPage() {
  const { t } = useTranslation('mp-feuer');
  const navigate = useNavigate();
  const mayTransfer = useCan(TRANSFER);
  const { data: runs = [] } = useRuns();
  const working = runs.find(isRunning);
  const [files, setFiles] = useState<File[]>([]);
  const read = useAction((selected: File[]) => uploadFiles<MpFeuerRun>('mp-feuer/runs', selected), {
    invalidate: [keys.runs],
    onSuccess: (run) => navigate(`/mp-feuer/runs/${run.id}`),
  });
  if (!mayTransfer) {
    return (
      <ModulePage tab="transfer">
        <EmptyState title={t('transfer.notAllowed')} />
      </ModulePage>
    );
  }
  return (
    <ModulePage tab="transfer">
      <RunSteps active={0} />
      {working && (
        <Notice kind="info" action={<Anchor component={Link} to={`/mp-feuer/runs/${working.id}`}>{t('transfer.toWorking')}</Anchor>}>
          {t('transfer.working')}
        </Notice>
      )}
      <Panel maw={760}>
        <Stack gap="md">
          <FileInput
            label={t('transfer.files')}
            description={t('transfer.filesHint')}
            placeholder={t('transfer.choose')}
            accept=".zip"
            multiple
            value={files}
            onChange={setFiles}
            leftSection={<IconUpload size={18} />}
            clearable
          />
          <Text size="sm" c="dimmed">{t('transfer.filesLimit')}</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => navigate('/mp-feuer/overview')}>{t('actions.cancel')}</Button>
            <Button disabled={!files.length} loading={read.isPending} onClick={() => read.mutate(files)}>{t('transfer.read')}</Button>
          </Group>
        </Stack>
      </Panel>
    </ModulePage>
  );
}
