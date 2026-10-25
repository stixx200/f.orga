import { Button, Grid, Group, NavLink, SegmentedControl, Stack, Switch, Table, Text, TextInput, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { LocalizedText, Permission, Role } from '@forga/core-contracts';
import { api, can, send, useLocalized, useSession, useTranslation } from '@forga/web-sdk';
import { ConfirmDialog, Notice, PageHeader, Panel, StatusBadge, useAction } from '@forga/web-ui';
import type { LoadedModule } from '../../modules';
import { ROLES_KEY, useRoles, useUsers } from './data';

/** Name and description in both languages. */
interface Draft {
  name: LocalizedText;
  description: Role['description'];
  permissions: string[];
  permissionsAllDepartments: string[];
}
type Area = 'none' | 'assigned' | 'all';

const moduleOf = (permission: string) => permission.split('.')[0];

function RoleEditor({ role, permissions, modules, onDone }: { role: Role | null; permissions: Permission[]; modules: LoadedModule[]; onDone: (id: string | null) => void }) {
  const { t, i18n } = useTranslation('shell');
  const { t: common } = useTranslation('common');
  const localized = useLocalized();
  const [draft, setDraft] = useState<Draft>(() => ({
    name: role?.name ?? { de: '', en: '' },
    description: role?.description ?? { de: '', en: '' },
    permissions: role?.permissions ?? [],
    permissionsAllDepartments: role?.permissionsAllDepartments ?? [],
  }));
  const [deleting, setDeleting] = useState(false);
  const all = draft.permissions.includes('*') || draft.permissionsAllDepartments.includes('*');
  /** Where a permission (or a module pattern) applies in the draft. */
  const areaOf = (id: string): Area => {
    const covers = (list: string[]) => list.includes(id) || (!id.endsWith('.*') && list.includes(`${moduleOf(id)}.*`));
    if (covers(draft.permissionsAllDepartments)) return 'all';
    if (covers(draft.permissions)) return 'assigned';
    return 'none';
  };
  const setArea = (id: string, area: Area) =>
    setDraft((d) => {
      const strip = (list: string[]) => list.filter((p) => p !== id && !(id.endsWith('.*') && moduleOf(p) === moduleOf(id)));
      return {
        ...d,
        permissions: area === 'assigned' ? [...strip(d.permissions), id] : strip(d.permissions),
        permissionsAllDepartments: area === 'all' ? [...strip(d.permissionsAllDepartments), id] : strip(d.permissionsAllDepartments),
      };
    });
  const areaControl = (id: string, disabled = false) => (
    <SegmentedControl
      size="xs"
      value={areaOf(id)}
      onChange={(v) => setArea(id, v as Area)}
      disabled={disabled}
      aria-label={id}
      data={[
        { value: 'none', label: t('roles.areas.none') },
        { value: 'assigned', label: t('roles.areas.assigned') },
        { value: 'all', label: t('roles.areas.all') },
      ]}
    />
  );

  const save = useAction((input: Draft) => (role ? send<Role>('PUT', `core/roles/${role.id}`, input) : send<Role>('POST', 'core/roles', input)), {
    success: t('roles.saved'),
    invalidate: [ROLES_KEY],
    onSuccess: (saved) => onDone(saved.id),
  });
  const copy = useAction((input: Draft) => send<Role>('POST', 'core/roles', input), {
    success: t('roles.saved'),
    invalidate: [ROLES_KEY],
    onSuccess: (saved) => onDone(saved.id),
  });
  const remove = useAction(() => send('DELETE', `core/roles/${role!.id}`), { success: t('roles.deleted'), invalidate: [ROLES_KEY], onSuccess: () => onDone(null) });
  const applyTemplate = useAction(() => send<Role>('POST', `core/roles/${role!.id}/apply-template`), {
    success: t('roles.templateApplied'),
    invalidate: [ROLES_KEY],
    onSuccess: (saved) => setDraft({ name: saved.name, description: saved.description, permissions: saved.permissions, permissionsAllDepartments: saved.permissionsAllDepartments }),
  });

  const groups = [...new Set(permissions.map((p) => moduleOf(p.id)))];
  const moduleName = (id: string) => {
    const module = modules.find((m) => m.info.id === id);
    return module ? localized(module.info.name) : t('roles.core');
  };

  return (
    <Panel title={role ? t('roles.editTitle', { name: localized(role.name) }) : t('roles.new')}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate(draft);
        }}
      >
        <Stack gap="md">
          <Group grow align="start">
            <TextInput label={t('roles.nameDe')} value={draft.name.de} onChange={(e) => setDraft({ ...draft, name: { ...draft.name, de: e.currentTarget.value } })} required />
            <TextInput label={t('roles.nameEn')} value={draft.name.en} onChange={(e) => setDraft({ ...draft, name: { ...draft.name, en: e.currentTarget.value } })} required />
          </Group>
          <Group grow align="start">
            <TextInput label={t('roles.descriptionDe')} value={draft.description.de} onChange={(e) => setDraft({ ...draft, description: { ...draft.description, de: e.currentTarget.value } })} />
            <TextInput label={t('roles.descriptionEn')} value={draft.description.en} onChange={(e) => setDraft({ ...draft, description: { ...draft.description, en: e.currentTarget.value } })} />
          </Group>
          <Switch label={t('roles.all')} checked={all} onChange={(e) => setDraft({ ...draft, permissions: e.currentTarget.checked ? ['*'] : [], permissionsAllDepartments: [] })} />
          {!all && <Text size="sm" c="dimmed">{t('roles.areasHint')}</Text>}
          {!all &&
            groups.map((group) => {
              const wholeModule = areaOf(`${group}.*`) !== 'none';
              return (
                <div key={group}>
                  <Group justify="space-between" mb={4}>
                    <Title order={3} size="h5">{t('roles.permissionsOf', { module: moduleName(group) })}</Title>
                    <Group gap="xs">
                      <Text size="xs" c="dimmed">{t('roles.wholeModule')}</Text>
                      {areaControl(`${group}.*`)}
                    </Group>
                  </Group>
                  <Table withTableBorder>
                    <Table.Tbody>
                      {permissions
                        .filter((p) => moduleOf(p.id) === group)
                        .map((p) => (
                          <Table.Tr key={p.id}>
                            <Table.Td>
                              <Text size="sm">{localized(p.name)}</Text>
                              <Text size="xs" c="dimmed"><code>{p.id}</code> · {t(p.scope === 'brigade' ? 'roles.scopeBrigade' : 'roles.scopeDepartment')}</Text>
                            </Table.Td>
                            <Table.Td align="right">{areaControl(p.id, wholeModule)}</Table.Td>
                          </Table.Tr>
                        ))}
                    </Table.Tbody>
                  </Table>
                </div>
              );
            })}
          <Group justify="flex-end">
            {role?.templateKey && (
              <Button variant="subtle" loading={applyTemplate.isPending} onClick={() => applyTemplate.mutate(undefined)}>{t('roles.applyTemplate')}</Button>
            )}
            {role && <Button variant="default" onClick={() => setDeleting(true)}>{common('actions.delete')}</Button>}
            {role && (
              <Button
                variant="default"
                loading={copy.isPending}
                onClick={() =>
                  copy.mutate({
                    ...draft,
                    name: { de: i18n.getFixedT('de', 'shell')('roles.copyName', { name: draft.name.de }), en: i18n.getFixedT('en', 'shell')('roles.copyName', { name: draft.name.en }) },
                  })
                }
              >
                {t('roles.copy')}
              </Button>
            )}
            <Button type="submit" loading={save.isPending}>{common('actions.save')}</Button>
          </Group>
        </Stack>
      </form>
      <ConfirmDialog
        opened={deleting}
        onClose={() => setDeleting(false)}
        title={t('roles.deleteTitle', { name: role ? localized(role.name) : '' })}
        description={t('roles.deleteText')}
        confirmLabel={common('actions.delete')}
        loading={remove.isPending}
        onConfirm={() => {
          setDeleting(false);
          remove.mutate(undefined);
        }}
      />
    </Panel>
  );
}

/** Roles with their permissions; the area (brigade or department) is chosen when assigning a role to a user. */
export function RolesPage({ modules }: { modules: LoadedModule[] }) {
  const { t } = useTranslation('shell');
  const localized = useLocalized();
  const session = useSession().data;
  const { data: roles = [] } = useRoles();
  const { data: users = [] } = useUsers(can(session, 'core.users.manage'));
  const { data: permissions = [] } = useQuery({ queryKey: ['core', 'permissions'], queryFn: () => api<Permission[]>('core/permissions') });
  const { data: templates = [] } = useQuery({ queryKey: ['core', 'roles', 'templates'], queryFn: () => api<{ key: string }[]>('core/roles/templates') });
  const [selected, setSelected] = useState<string | null>(null);
  const createTemplates = useAction(() => send<{ created: string[] }>('POST', 'core/roles/templates'), {
    invalidate: [ROLES_KEY],
    success: t('roles.templatesCreated'),
  });

  const sorted = roles.toSorted((a, b) => localized(a.name).localeCompare(localized(b.name)));
  const current = selected && selected !== 'new' ? (roles.find((r) => r.id === selected) ?? null) : null;
  const missing = templates.filter((tpl) => !roles.some((r) => r.templateKey === tpl.key)).length;
  const count = (role: Role) => users.filter((u) => u.roles.some((r) => r.roleId === role.id)).length;

  return (
    <Stack gap="lg">
      <PageHeader
        breadcrumbs={[{ label: t('nav.administration') }, { label: t('nav.roles') }]}
        title={t('nav.roles')}
        actions={<Button onClick={() => setSelected('new')}>{t('roles.create')}</Button>}
      />
      {missing > 0 && (
        <Notice kind="info" action={<Button variant="outline" size="xs" loading={createTemplates.isPending} onClick={() => createTemplates.mutate(undefined)}>{t('roles.createTemplates')}</Button>}>
          {t('roles.templatesMissing', { count: missing })}
        </Notice>
      )}
      <Grid gap="lg">
        <Grid.Col span={{ base: 12, md: 4 }} order={{ base: 1, md: 2 }}>
          <Panel title={t('roles.allRoles')}>
            {sorted.map((role) => (
              <NavLink
                key={role.id}
                active={role.id === selected}
                onClick={() => setSelected(role.id)}
                label={<Text fw={700} size="sm">{localized(role.name)}</Text>}
                description={localized(role.description)}
                rightSection={users.length ? <StatusBadge>{count(role)}</StatusBadge> : undefined}
              />
            ))}
            <Text size="xs" c="dimmed" mt="sm">{t('roles.areaHint')}</Text>
          </Panel>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 8 }} order={{ base: 2, md: 1 }}>
          {selected ? (
            <RoleEditor key={selected} role={current} permissions={permissions} modules={modules} onDone={setSelected} />
          ) : (
            <Text c="dimmed">{t('roles.choose')}</Text>
          )}
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
