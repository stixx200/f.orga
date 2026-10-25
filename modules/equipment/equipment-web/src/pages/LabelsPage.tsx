import { Button, Group, Select, Stack, Text } from '@mantine/core';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { useLocalized, useTranslation } from '@forga/web-sdk';
import { PageHeader } from '@forga/web-ui';
import { useCategories, useDepartments, useItems } from '../api';
import classes from './labels.module.css';

/** QR labels to print and stick on the equipment; scanning opens the item. */
export function LabelsPage() {
  const { t } = useTranslation('equipment');
  const localized = useLocalized();
  const { data: departments = [] } = useDepartments();
  const { data: categories = [] } = useCategories();
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [categoryKey, setCategoryKey] = useState<string | null>(null);
  const { data = [] } = useItems({ departmentId: departmentId ?? undefined, categoryKey: categoryKey ?? undefined });
  const origin = window.location.origin;
  return (
    <Stack gap="lg">
      <div className={classes.noPrint}>
        <PageHeader breadcrumbs={[{ label: t('module') }, { label: t('items.title'), to: '/equipment/items' }, { label: t('labels.title') }]} title={t('labels.title')} subtitle={t('labels.subtitle')} actions={<Button onClick={() => window.print()}>{t('labels.print')}</Button>} />
        <Group>
          <Select label={t('fields.department')} placeholder={t('items.all')} data={departments.map((d) => ({ value: d.id, label: d.name }))} value={departmentId} onChange={setDepartmentId} clearable />
          <Select label={t('fields.category')} placeholder={t('items.all')} data={categories.map((c) => ({ value: c.key, label: localized(c.name) }))} value={categoryKey} onChange={setCategoryKey} clearable />
        </Group>
      </div>
      <div className={classes.sheet}>
        {data.map((item) => (
          <div key={item.id} className={classes.label}>
            <QRCodeSVG value={`${origin}/equipment/items/${item.id}`} size={88} />
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
