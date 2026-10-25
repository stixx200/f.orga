import { ActionIcon, Button, Group, MultiSelect, NumberInput, Paper, Select, Stack, Switch } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import type { Condition } from '@forga/promotions-contracts';
import { useLocalized, useTranslation } from '@forga/web-sdk';
import { useCatalog } from '../api';

type Type = Condition['type'];
const TYPES: Type[] = ['and', 'or', 'rank', 'years-in-rank', 'min-interval', 'years-since-joining', 'qualification', 'office', 'probation-ended', 'musician', 'population'];

/** A new condition of the type with sensible defaults; groups keep their children. */
function blank(type: Type, previous: Condition): Condition {
  switch (type) {
    case 'and':
    case 'or':
      return { type, children: previous.type === 'and' || previous.type === 'or' ? previous.children : [] };
    case 'rank':
      return { type, ranks: [] };
    case 'years-in-rank':
    case 'years-since-joining':
    case 'min-interval':
      return { type, years: 1 };
    case 'qualification':
      return { type, keys: [] };
    case 'office':
      return { type, keys: [], current: true };
    case 'probation-ended':
      return { type };
    case 'musician':
      return { type, value: true };
    case 'population':
      return { type, min: null, max: null };
  }
}

/** Graphical editor of a condition tree: groups ("all of", "one of") with conditions of any depth. */
export function ConditionEditor({ value, onChange, onRemove }: { value: Condition; onChange: (c: Condition) => void; onRemove?: () => void }) {
  const { t } = useTranslation('promotions');
  const localized = useLocalized();
  const { data: ranks = [] } = useCatalog('rank');
  const { data: qualifications = [] } = useCatalog('qualification');
  const { data: offices = [] } = useCatalog('office');
  const options = (entries: { key: string; name: { de: string; en: string } }[]) => entries.map((e) => ({ value: e.key, label: localized(e.name) }));
  const group = value.type === 'and' || value.type === 'or';

  return (
    <Paper withBorder p="xs" radius="sm" bg={group ? 'var(--mantine-color-gray-0)' : undefined}>
      <Stack gap="xs">
        <Group gap="xs" align="end" wrap="wrap">
          <Select aria-label={t('editor.type')} data={TYPES.map((x) => ({ value: x, label: t(`editor.types.${x}`) }))} value={value.type} onChange={(v) => v && onChange(blank(v as Type, value))} allowDeselect={false} w={240} />
          {value.type === 'rank' && <MultiSelect aria-label={t('editor.ranks')} placeholder={t('editor.ranks')} data={options(ranks)} value={value.ranks} onChange={(selected) => onChange({ ...value, ranks: selected })} style={{ flex: 1 }} />}
          {(value.type === 'years-in-rank' || value.type === 'years-since-joining' || value.type === 'min-interval') && (
            <NumberInput aria-label={t('editor.years')} suffix={` ${t('editor.yearsSuffix')}`} value={value.years} onChange={(v) => onChange({ ...value, years: Number(v) || 0 })} min={0} max={50} step={0.5} decimalScale={1} w={140} />
          )}
          {value.type === 'qualification' && <MultiSelect aria-label={t('editor.qualifications')} placeholder={t('editor.qualifications')} data={options(qualifications)} value={value.keys} onChange={(keys) => onChange({ ...value, keys })} searchable style={{ flex: 1 }} />}
          {value.type === 'office' && (
            <>
              <MultiSelect aria-label={t('editor.offices')} placeholder={t('editor.offices')} data={options(offices)} value={value.keys} onChange={(keys) => onChange({ ...value, keys })} style={{ flex: 1 }} />
              <Switch label={t('editor.current')} checked={value.current} onChange={(e) => onChange({ ...value, current: e.currentTarget.checked })} mb={8} />
              <NumberInput aria-label={t('editor.minYears')} placeholder={t('editor.minYears')} value={value.years ?? ''} onChange={(v) => onChange({ ...value, years: v === '' ? undefined : Number(v) })} min={0} max={50} w={140} />
            </>
          )}
          {value.type === 'musician' && <Switch label={t('editor.musician')} checked={value.value} onChange={(e) => onChange({ ...value, value: e.currentTarget.checked })} mb={8} />}
          {value.type === 'population' && (
            <>
              <NumberInput aria-label={t('editor.min')} placeholder={t('editor.min')} value={value.min ?? ''} onChange={(v) => onChange({ ...value, min: v === '' ? null : Number(v) })} min={0} w={140} />
              <NumberInput aria-label={t('editor.max')} placeholder={t('editor.max')} value={value.max ?? ''} onChange={(v) => onChange({ ...value, max: v === '' ? null : Number(v) })} min={0} w={140} />
              <Select aria-label={t('editor.scope')} data={(['municipality', 'department'] as const).map((s) => ({ value: s, label: t(`editor.scopes.${s}`) }))} value={value.scope ?? 'municipality'} onChange={(v) => onChange({ ...value, scope: (v ?? 'municipality') as 'municipality' | 'department' })} allowDeselect={false} w={200} />
            </>
          )}
          {onRemove && <ActionIcon variant="subtle" color="red" aria-label={t('editor.remove')} onClick={onRemove} mb={4}><IconTrash size={16} /></ActionIcon>}
        </Group>
        {group && (
          <Stack gap="xs" pl="md" style={{ borderLeft: '2px solid var(--mantine-color-gray-4)' }}>
            {value.children.map((child, index) => (
              <ConditionEditor
                key={index}
                value={child}
                onChange={(c) => onChange({ ...value, children: value.children.map((x, i) => (i === index ? c : x)) })}
                onRemove={() => onChange({ ...value, children: value.children.filter((_, i) => i !== index) })}
              />
            ))}
            <Group><Button size="compact-xs" variant="subtle" onClick={() => onChange({ ...value, children: [...value.children, { type: 'years-in-rank', years: 1 }] })}>{t('editor.add')}</Button></Group>
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
