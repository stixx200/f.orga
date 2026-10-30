import { Button, Group, Select, Stack, Switch, Text } from '@mantine/core';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { send, useLocalized, useTranslation } from '@forga/web-sdk';
import { Notice, PageHeader, treeOptions, useAction } from '@forga/web-ui';
import { keys, useCategories, useDepartments, useItemAccess, useItems, useLabelBase } from '../api';
import classes from './labels.module.css';

/**
 * QR labels to print and stick on the equipment; scanning opens the item. `?ids=` prints the labels of single items
 * (from the equipment file); "without label" shows only items whose label has not been printed yet.
 */
export function LabelsPage() {
  const { t } = useTranslation('equipment');
  const localized = useLocalized();
  const [params, setParams] = useSearchParams();
  const ids = params.get('ids')?.split(',').filter(Boolean) ?? [];
  const access = useItemAccess();
  const { data: departments = [] } = useDepartments();
  const { data: categories = [] } = useCategories();
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [categoryKey, setCategoryKey] = useState<string | null>(null);
  const [withoutLabel, setWithoutLabel] = useState(false);
  const { data: all = [] } = useItems({ departmentId: departmentId ?? undefined, categoryKey: categoryKey ?? undefined, withoutLabel: withoutLabel ? 'true' : undefined });
  const data = ids.length ? all.filter((i) => ids.includes(i.id)) : all;
  const { base, configured } = useLabelBase();
  const markable = data.filter((i) => access.canWrite(i));
  const printed = useAction(() => send('POST', 'equipment/items/labels/printed', { itemIds: markable.map((i) => i.id) }), { success: t('labels.marked', { count: markable.length }), invalidate: [keys.all] });
  return (
    <Stack gap="lg">
      <div className={classes.noPrint}>
        <PageHeader
          breadcrumbs={[{ label: t('module') }, { label: t('items.title'), to: '/equipment/items' }, { label: t('labels.title') }]}
          title={t('labels.title')}
          subtitle={t('labels.subtitle')}
          actions={
            <Group gap="sm">
              {markable.length > 0 && <Button variant="default" loading={printed.isPending} onClick={() => printed.mutate(undefined)}>{t('labels.markPrinted', { count: markable.length })}</Button>}
              <Button onClick={() => window.print()} disabled={!data.length}>{t('labels.print')}</Button>
            </Group>
          }
        />
        {!configured && <Notice kind="warning">{t('labels.noPublicUrl', { origin: base })}</Notice>}
        {ids.length > 0 ? (
          <Group>
            <Text size="sm">{t('labels.selection', { count: data.length })}</Text>
            <Button size="xs" variant="subtle" onClick={() => setParams({})}>{t('labels.allItems')}</Button>
          </Group>
        ) : (
          <Group align="end">
            <Select label={t('fields.department')} placeholder={t('items.all')} data={departments.map((d) => ({ value: d.id, label: d.name }))} value={departmentId} onChange={setDepartmentId} clearable />
            <Select label={t('fields.category')} placeholder={t('items.all')} data={treeOptions(categories, (c) => localized(c.name))} value={categoryKey} onChange={setCategoryKey} clearable searchable miw={280} />
            <Switch label={t('labels.withoutLabel')} checked={withoutLabel} onChange={(e) => setWithoutLabel(e.currentTarget.checked)} />
          </Group>
        )}
      </div>
      <div className={classes.sheet}>
        {data.map((item) => (
          <div key={item.id} className={classes.label}>
            <QRCodeSVG value={`${base}/equipment/items/${item.id}`} size={88} />
            <div>
              <Text fw={700} size="sm">{item.inventoryNumber}</Text>
              <Text size="xs">{item.name}</Text>
            </div>
          </div>
        ))}
      </div>
    </Stack>
  );
}
