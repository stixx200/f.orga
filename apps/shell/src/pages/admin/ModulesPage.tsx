import { Button, FileButton, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { ModuleStatus } from '@forga/core-contracts';
import { api, send, upload, useLocalized, useTranslation } from '@forga/web-sdk';
import { ConfirmDialog, DataTable, Notice, PageHeader, Panel, StatusBadge, type Tone, useAction } from '@forga/web-ui';

const STATUS_KEY = ['core', 'modules', 'status'] as const;
const PLUGINS_KEY = ['core', 'plugins'] as const;

interface Plugin {
  id: string;
  version: string;
  signer: string | null;
  status: 'loaded' | 'installed' | 'removed' | 'error';
  error: string | null;
}
const PLUGIN_TONES: Record<Plugin['status'], Tone> = { loaded: 'done', installed: 'warning', removed: 'neutral', error: 'error' };

/** Plugin packages from outside: upload (signed), state after the last start, remove. */
function PluginsPanel() {
  const { t } = useTranslation('shell');
  const { data } = useQuery({ queryKey: PLUGINS_KEY, queryFn: () => api<{ enabled: boolean; allowUnsigned: boolean; trustedKeys: string[]; plugins: Plugin[] }>('core/plugins') });
  const [removing, setRemoving] = useState<Plugin | null>(null);
  const install = useAction((file: File) => upload<{ id: string; version: string }>('core/plugins', file), { success: t('plugins.installed'), invalidate: [PLUGINS_KEY] });
  const remove = useAction((id: string) => send('DELETE', `core/plugins/${id}`), { success: t('plugins.removed'), invalidate: [PLUGINS_KEY], onSuccess: () => setRemoving(null) });
  if (!data) return null;
  return (
    <Panel
      title={t('plugins.title')}
      aside={
        data.enabled && (
          <FileButton accept=".tgz,application/gzip" onChange={(file) => file && install.mutate(file)}>
            {(props) => <Button size="xs" loading={install.isPending} {...props}>{t('plugins.upload')}</Button>}
          </FileButton>
        )
      }
    >
      {!data.enabled ? (
        <Text size="sm" c="dimmed">{t('plugins.disabled')}</Text>
      ) : (
        <Stack gap="sm">
          <Text size="sm" c="dimmed">{t('plugins.info', { keys: data.trustedKeys.join(', ') || '–' })}</Text>
          {data.allowUnsigned && <Notice kind="warning">{t('plugins.unsignedAllowed')}</Notice>}
          <DataTable<Plugin>
            exportable={false}
            rows={data.plugins}
            rowKey={(p) => p.id}
            empty={t('plugins.none')}
            columns={[
              { key: 'id', header: t('plugins.id'), render: (p) => <Text size="sm" fw={700}>{p.id}</Text> },
              { key: 'version', header: t('plugins.version'), render: (p) => p.version || '–' },
              { key: 'signer', header: t('plugins.signer'), render: (p) => p.signer ?? t('plugins.unsigned') },
              { key: 'status', header: t('plugins.status'), render: (p) => <><StatusBadge tone={PLUGIN_TONES[p.status]}>{t(`plugins.states.${p.status}`)}</StatusBadge>{p.error && <Text size="xs" c="red.8">{p.error}</Text>}</> },
              { key: 'actions', header: '', align: 'right', render: (p) => p.status !== 'removed' && <Button size="compact-xs" variant="subtle" color="red" onClick={() => setRemoving(p)}>{t('plugins.remove')}</Button> },
            ]}
          />
        </Stack>
      )}
      <ConfirmDialog
        opened={!!removing}
        onClose={() => setRemoving(null)}
        title={t('plugins.removeTitle', { id: removing?.id })}
        description={t('plugins.removeText')}
        confirmLabel={t('plugins.remove')}
        loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.id)}
      />
    </Panel>
  );
}

/** Installed modules can be switched on and off; data of a deactivated module stays. */
export function ModulesPage() {
  const { t } = useTranslation('shell');
  const localized = useLocalized();
  const { data: modules = [] } = useQuery({ queryKey: STATUS_KEY, queryFn: () => api<ModuleStatus[]>('core/modules/status') });
  const [deactivating, setDeactivating] = useState<ModuleStatus | null>(null);
  // The shell loads the frontends of the active modules at start, so it starts over after a change.
  const toggle = useAction((module: ModuleStatus) => send('PUT', `core/modules/${module.id}`, { active: !module.active }), {
    invalidate: [STATUS_KEY],
    onSuccess: () => window.location.reload(),
  });

  const nameOf = (id: string) => {
    const module = modules.find((m) => m.id === id);
    return module ? localized(module.name) : id;
  };
  const requiredBy = (id: string) => modules.filter((m) => m.requires.includes(id)).map((m) => nameOf(m.id));

  return (
    <Stack gap="lg">
      <PageHeader breadcrumbs={[{ label: t('nav.administration') }, { label: t('nav.modules') }]} title={t('nav.modules')} />
      <Notice kind="info">{t('modules.info')}</Notice>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
        {modules.map((module) => {
          const dependents = requiredBy(module.id);
          return (
            <Panel
              key={module.id}
              title={<>{localized(module.name)} <Text span size="sm" c="dimmed" fw={400}>{module.version}</Text></>}
              aside={<StatusBadge tone={module.active ? 'done' : 'neutral'}>{t(module.active ? 'modules.active' : 'modules.inactive')}</StatusBadge>}
            >
              <Text size="sm" mb="md">{t(`modules.descriptions.${module.id}`, { defaultValue: '' })}</Text>
              <Group justify="space-between" align="end" wrap="nowrap">
                <Text size="xs" c="dimmed">
                  {[
                    module.requires.length ? t('modules.requires', { modules: module.requires.map(nameOf).join(', ') }) : '',
                    dependents.length ? t('modules.requiredBy', { modules: dependents.join(', ') }) : '',
                  ].filter(Boolean).join(' · ')}
                </Text>
                {module.active ? (
                  <Button variant="default" size="xs" style={{ flexShrink: 0 }} onClick={() => setDeactivating(module)}>{t('modules.deactivate')}</Button>
                ) : (
                  <Button size="xs" loading={toggle.isPending} onClick={() => toggle.mutate(module)}>{t('modules.activate')}</Button>
                )}
              </Group>
            </Panel>
          );
        })}
      </SimpleGrid>
      <PluginsPanel />
      <ConfirmDialog
        opened={!!deactivating}
        onClose={() => setDeactivating(null)}
        title={t('modules.deactivateTitle', { name: deactivating ? localized(deactivating.name) : '' })}
        description={t('modules.deactivateText')}
        confirmLabel={t('modules.deactivate')}
        loading={toggle.isPending}
        onConfirm={() => {
          if (deactivating) toggle.mutate(deactivating);
          setDeactivating(null);
        }}
      />
    </Stack>
  );
}
