import { Badge, Button, Group, Select, Stack, Table, Text } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { CompensationSettings, Preview } from '@forga/compensation-contracts';
import { api, formatDate, formatMoney, formatTime, send, useTranslation, withQuery } from '@forga/web-sdk';
import { Panel, useAction } from '@forga/web-ui';

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** What the preview needs of a report of the incidents module. */
interface ReportReference {
  incidentId: string;
  dispatchNumber: string;
  alarmKeyword: string;
  alarmedAt: string;
}

/** "How incident X would be computed" with the settings as currently edited (not yet saved). */
export function PreviewPanel({ settings }: { settings: CompensationSettings }) {
  const { t, i18n } = useTranslation('compensation');
  const language = i18n.language;
  const [from, setFrom] = useState(() => isoDate(new Date(Date.now() - 90 * 86_400_000)));
  const [to, setTo] = useState(() => isoDate(new Date()));
  const [incidentId, setIncidentId] = useState<string | null>(null);
  const { data: reports = [] } = useQuery({
    queryKey: ['compensation', 'preview', 'reports', from, to],
    queryFn: () => api<ReportReference[]>(withQuery('compensation/preview/reports', { from, to })),
  });
  const incidents = [...new Map(reports.map((r) => [r.incidentId, r])).values()];
  const preview = useAction((id: string) => send<Preview>('POST', 'compensation/preview', { incidentId: id, settings }));
  const result = preview.data;

  return (
    <Panel title={t('preview.title')}>
      <Stack gap="sm">
        <Text size="sm" c="dimmed">{t('preview.hint')}</Text>
        <Group align="end" wrap="wrap">
          <DateInput label={t('preview.from')} value={from} onChange={(v) => v && setFrom(v)} valueFormat="DD.MM.YYYY" w={150} />
          <DateInput label={t('preview.to')} value={to} onChange={(v) => v && setTo(v)} valueFormat="DD.MM.YYYY" w={150} />
          <Select
            label={t('preview.incident')}
            placeholder={incidents.length ? t('preview.choose') : t('preview.none')}
            data={incidents.map((r) => ({ value: r.incidentId, label: `${formatDate(r.alarmedAt, language)} · ${r.alarmKeyword} · ${r.dispatchNumber}` }))}
            value={incidentId}
            onChange={setIncidentId}
            searchable
            style={{ flex: 1, minWidth: 240 }}
          />
          <Button variant="default" disabled={!incidentId} loading={preview.isPending} onClick={() => incidentId && preview.mutate(incidentId)}>{t('preview.compute')}</Button>
        </Group>
        {result?.reports.map((report) => (
          <Stack key={report.reportId} gap={4}>
            <Text size="sm" fw={700}>{report.reportNumber} · {t(`settings.incidentRateKinds.${result.compensationKind}`)}</Text>
            <Table.ScrollContainer minWidth={720}>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t('preview.person')}</Table.Th><Table.Th>{t('preview.time')}</Table.Th><Table.Th>{t('preview.hours')}</Table.Th><Table.Th>{t('preview.rate')}</Table.Th>
                    <Table.Th>{t('preview.computed')}</Table.Th><Table.Th>{t('preview.payout')}</Table.Th><Table.Th>{t('preview.hints')}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {report.personnel.map((p, index) => (
                    <Table.Tr key={`${p.personId ?? p.name}-${index}`}>
                      <Table.Td>{p.name}</Table.Td>
                      <Table.Td>{formatTime(p.from, language)} – {formatTime(p.to, language)}</Table.Td>
                      <Table.Td>{p.hours}{p.standby ? ` (${t('settings.incidentRateKinds.standby')})` : ''}</Table.Td>
                      <Table.Td>{p.rate === null ? '–' : formatMoney(p.rate, language)}</Table.Td>
                      <Table.Td>{formatMoney(p.computed, language)}{p.overridden ? ` (${t('preview.overridden')})` : ''}</Table.Td>
                      <Table.Td fw={700}>{formatMoney(p.amount, language)}{p.refreshment !== null ? ` + ${formatMoney(p.refreshment, language)}` : ''}</Table.Td>
                      <Table.Td>
                        <Group gap={4}>
                          {p.duringWorkingHours && <Badge variant="light" color="gray">{t('preview.workingHours')}</Badge>}
                          {p.hints.map((h) => <Badge key={h} variant="light" color="orange">{t(`preview.hintKinds.${h}`)}</Badge>)}
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Stack>
        ))}
      </Stack>
    </Panel>
  );
}
