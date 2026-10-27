import { ActionIcon, Button, Checkbox, Group, NumberInput, Select, Stack, Text } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { Item, ReportUsage } from '@forga/equipment-contracts';
import { api, send, useTranslation } from '@forga/web-sdk';
import { Panel, useAction } from '@forga/web-ui';
import { useCategories, useItems } from '../api';

/**
 * Equipment used in an incident report or a training session, with quantity for consumables and "inspect after use".
 * `offer` limits the items offered for adding; `suggested` are proposed with one click.
 */
/** `departmentIds: null`: items of every department (report of a brigade-wide unit, e.g. the duty officer). */
function UsageCard({ path, departmentIds, offer, suggest = () => [], disabled }: { path: string; departmentIds: string[] | null; offer: (item: Item, stock: boolean) => boolean; suggest?: (items: Item[], current: ReportUsage[], breathingCategories: string[]) => Item[]; disabled: boolean }) {
  const { t } = useTranslation('equipment');
  const { data: categories = [] } = useCategories();
  const { data: usage = [], refetch } = useQuery({ queryKey: ['equipment', 'usage', path], queryFn: () => api<ReportUsage[]>(path) });
  const { data: all = [] } = useItems({});
  const items = all.filter((i) => !departmentIds || departmentIds.includes(i.departmentId));
  const [rows, setRows] = useState<ReportUsage[] | null>(null);
  const current = rows ?? usage;
  const stock = new Set(categories.filter((c) => c.tracking === 'stock').map((c) => c.key));
  const offered = items.filter((i) => i.status !== 'retired' && offer(i, stock.has(i.categoryKey))).filter((i) => !current.some((u) => u.itemId === i.id));
  const suggested = suggest(items, current, categories.filter((c) => c.breathingApparatus).map((c) => c.key));
  const save = useAction(() => send('PUT', path, current.map(({ itemId, quantity, inspectAfter }) => ({ itemId, quantity, inspectAfter }))), {
    success: t('report.saved'),
    onSuccess: () => {
      setRows(null);
      void refetch();
    },
  });
  const set = (itemId: string, change: Partial<ReportUsage>) => setRows(current.map((u) => (u.itemId === itemId ? { ...u, ...change } : u)));
  const readOnly = disabled;
  return (
    <Panel title={t('report.title')} aside={rows && !readOnly && <Button size="xs" loading={save.isPending} onClick={() => save.mutate(undefined)}>{t('report.save')}</Button>}>
      <Stack gap="xs">
        {current.length === 0 && <Text size="sm" c="dimmed">{t('report.none')}</Text>}
        {current.map((u) => (
          <Group key={u.itemId} justify="space-between" wrap="nowrap">
            <Text size="sm">{u.inventoryNumber} · {u.name}</Text>
            <Group gap="sm" wrap="nowrap">
              {u.stock && <NumberInput aria-label={t('report.quantity')} w={80} size="xs" min={1} value={u.quantity} onChange={(v) => set(u.itemId, { quantity: Number(v) || 1 })} disabled={readOnly} />}
              <Checkbox label={t('report.inspectAfter')} checked={u.inspectAfter} onChange={(e) => set(u.itemId, { inspectAfter: e.currentTarget.checked })} disabled={readOnly} />
              {!readOnly && <ActionIcon variant="subtle" color="red" aria-label={t('report.remove')} onClick={() => setRows(current.filter((x) => x.itemId !== u.itemId))}><IconTrash size={16} /></ActionIcon>}
            </Group>
          </Group>
        ))}
        {!readOnly && suggested.length > 0 && (
          <Group justify="space-between" wrap="nowrap" gap="sm">
            <Text size="sm" c="dimmed">{t('report.suggestion', { items: suggested.map((i) => i.inventoryNumber).join(', ') })}</Text>
            <Button
              size="xs"
              variant="default"
              onClick={() => setRows([...current, ...suggested.map((i) => ({ itemId: i.id, name: i.name, inventoryNumber: i.inventoryNumber, quantity: 1, inspectAfter: true, stock: false }))])}
            >
              {t('report.takeSuggestion')}
            </Button>
          </Group>
        )}
        {!readOnly && (
          <Select
            placeholder={t('report.add')}
            aria-label={t('report.add')}
            data={offered.map((i) => ({ value: i.id, label: `${i.inventoryNumber} · ${i.name}` }))}
            value={null}
            onChange={(v) => {
              const item = items.find((i) => i.id === v);
              if (item) setRows([...current, { itemId: item.id, name: item.name, inventoryNumber: item.inventoryNumber, quantity: 1, inspectAfter: !stock.has(item.categoryKey), stock: stock.has(item.categoryKey) }]);
            }}
            searchable
          />
        )}
      </Stack>
    </Panel>
  );
}

/** Section "Geräte" in the incident report (extension point `incidents.report.sections`): items of the report's vehicles and stock. */
export function ReportSection({ reportId, departmentId, vehicleIds, breathingVehicleIds, disabled }: { reportId?: unknown; departmentId?: unknown; vehicleIds?: unknown; breathingVehicleIds?: unknown; disabled?: unknown }) {
  const vehicles = (vehicleIds as string[] | undefined) ?? [];
  const wearers = new Map<string, number>();
  for (const v of (breathingVehicleIds as (string | null)[] | undefined) ?? []) if (v) wearers.set(v, (wearers.get(v) ?? 0) + 1);
  // Per vehicle and type of breathing equipment (apparatus, mask, cylinder …) as many items as persons were under
  // breathing apparatus there, minus those already listed.
  const suggest = (items: Item[], current: ReportUsage[], breathingCategories: string[]) =>
    [...wearers].flatMap(([vehicleId, count]) => {
      const onVehicle = items.filter((i) => i.vehicleId === vehicleId && breathingCategories.includes(i.categoryKey) && i.status !== 'retired').toSorted((a, b) => a.inventoryNumber.localeCompare(b.inventoryNumber));
      return [...new Set(onVehicle.map((i) => i.typeKey))].flatMap((type) => {
        const ofType = onVehicle.filter((i) => i.typeKey === type);
        const listed = ofType.filter((i) => current.some((u) => u.itemId === i.id)).length;
        return ofType.filter((i) => !current.some((u) => u.itemId === i.id)).slice(0, Math.max(0, count - listed));
      });
    });
  return (
    <UsageCard
      path={`equipment/reports/${String(reportId)}/usage`}
      departmentIds={departmentId ? [String(departmentId)] : null}
      offer={(i, stock) => Boolean(i.vehicleId && vehicles.includes(i.vehicleId)) || stock}
      suggest={suggest}
      disabled={Boolean(disabled)}
    />
  );
}

/** Tab "Geräte" of a training session (extension point `training.session.sections`): any item of the session's departments. */
export function SessionSection({ sessionId, departmentIds, disabled }: { sessionId?: unknown; departmentIds?: unknown; disabled?: unknown }) {
  return <UsageCard path={`equipment/sessions/${String(sessionId)}/usage`} departmentIds={(departmentIds as string[] | undefined) ?? []} offer={() => true} disabled={Boolean(disabled)} />;
}
