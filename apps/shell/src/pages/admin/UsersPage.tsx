import { ActionIcon, Button, Grid, Group, PasswordInput, Select, Stack, Switch, Text, TextInput, Title } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import type { Role, User, UserInput } from '@forga/core-contracts';
import { can, formatDateTime, send, useSession, useTranslation } from '@forga/web-sdk';
import { ConfirmDialog, DataTable, matchesSearch, PageHeader, Panel, StatusBadge, useAction } from '@forga/web-ui';
import { type DepartmentOption, personLabel, USERS_KEY, useDepartments, usePersons, useRoles, useUsers } from './data';

type Draft = Required<Omit<UserInput, 'password'>> & { password: string };

const emptyDraft = (): Draft => ({
  username: '',
  displayName: '',
  email: null,
  personId: null,
  language: 'de',
  receiveDigest: true,
  active: true,
  roles: [],
  password: '',
});

const toDraft = (user: User): Draft => ({
  username: user.username,
  displayName: user.displayName,
  email: user.email,
  personId: user.personId,
  language: user.language,
  receiveDigest: user.receiveDigest,
  active: user.active,
  roles: user.roles.map((r) => ({ roleId: r.roleId, departmentId: r.departmentId })),
  password: '',
});

function assignmentLabel(roleId: string, departmentId: string | null, roles: Role[], departments: DepartmentOption[], brigade: string) {
  const role = roles.find((r) => r.id === roleId)?.name ?? roleId;
  const area = departmentId ? (departments.find((d) => d.id === departmentId)?.name ?? departmentId) : brigade;
  return `${role} (${area})`;
}

function UserEditor({ user, onDone }: { user: User | null; onDone: (id: string | null) => void }) {
  const { t } = useTranslation('shell');
  const { t: common } = useTranslation('common');
  const session = useSession().data;
  const { data: roles = [] } = useRoles();
  const { data: departments = [] } = useDepartments();
  const { data: persons = [] } = usePersons();
  const [draft, setDraft] = useState<Draft>(() => (user ? toDraft(user) : emptyDraft()));
  const [roleId, setRoleId] = useState<string | null>(null);
  const [departmentId, setDepartmentId] = useState<string>('');
  const [locking, setLocking] = useState(false);
  const [impersonating, setImpersonating] = useState(false);
  const impersonate = useAction((reason: string) => send('POST', `core/users/${user!.id}/impersonate`, { reason }), {
    onSuccess: () => window.location.assign('/'),
  });
  const unlinkOidc = useAction(() => send('DELETE', `core/users/${user!.id}/oidc`), { success: t('users.oidcUnlinked'), invalidate: [USERS_KEY] });
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const save = useAction(
    (input: Draft) => {
      const body: UserInput = { ...input, password: input.password || undefined };
      return user ? send<User>('PUT', `core/users/${user.id}`, body) : send<User>('POST', 'core/users', body);
    },
    {
      success: t('users.saved'),
      invalidate: [USERS_KEY],
      // Take over the saved state (e.g. locked), so a later save does not send the old one back.
      onSuccess: (saved) => {
        setDraft(toDraft(saved));
        onDone(saved.id);
      },
    },
  );

  const departmentOptions = [{ value: '', label: t('users.brigade') }, ...departments.map((d) => ({ value: d.id, label: d.name }))];
  const isSelf = user?.id === session?.user.id;

  return (
    <Panel
      title={user ? user.displayName : t('users.new')}
      aside={user && <StatusBadge tone={user.active ? 'done' : 'warning'}>{t(user.active ? 'users.active' : 'users.locked')}</StatusBadge>}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate(draft);
        }}
      >
        <Stack gap="sm">
          <TextInput label={t('users.username')} value={draft.username} onChange={(e) => set('username', e.currentTarget.value)} required minLength={3} disabled={!!user?.technical} />
          <TextInput label={t('users.displayName')} value={draft.displayName} onChange={(e) => set('displayName', e.currentTarget.value)} required />
          <TextInput label={t('users.email')} type="email" value={draft.email ?? ''} onChange={(e) => set('email', e.currentTarget.value || null)} />
          <Select
            label={t('users.person')}
            description={t('users.personHint')}
            data={persons.map((p) => ({ value: p.id, label: personLabel(p) }))}
            value={draft.personId}
            onChange={(value) => set('personId', value)}
            searchable
            clearable
            disabled={!persons.length}
          />
          <Select
            label={t('users.language')}
            description={t('users.languageHint')}
            data={[{ value: 'de', label: common('language.de') }, { value: 'en', label: common('language.en') }]}
            value={draft.language}
            onChange={(value) => value && set('language', value as Draft['language'])}
            allowDeselect={false}
          />
          <Switch label={t('users.receiveDigest')} checked={draft.receiveDigest} onChange={(e) => set('receiveDigest', e.currentTarget.checked)} />
          <PasswordInput
            label={user ? t('users.newPassword') : t('users.password')}
            description={user ? t('users.newPasswordHint') : t('users.passwordHint')}
            value={draft.password}
            onChange={(e) => set('password', e.currentTarget.value)}
            required={!user}
            minLength={10}
            autoComplete="new-password"
          />

          <Title order={3} size="h5" mt="sm">{t('users.roles')}</Title>
          {draft.roles.length === 0 && <Text size="sm" c="dimmed">{t('users.noRoles')}</Text>}
          {draft.roles.map((assignment, index) => (
            <Group key={`${assignment.roleId}-${assignment.departmentId}`} justify="space-between" wrap="nowrap">
              <Text size="sm">{assignmentLabel(assignment.roleId, assignment.departmentId ?? null, roles, departments, t('users.brigade'))}</Text>
              <ActionIcon
                aria-label={t('users.removeRole')}
                onClick={() => set('roles', draft.roles.filter((_, i) => i !== index))}
              >
                <IconTrash size={18} />
              </ActionIcon>
            </Group>
          ))}
          <Group align="end" gap="xs" wrap="nowrap">
            <Select label={t('users.role')} data={roles.map((r) => ({ value: r.id, label: r.name }))} value={roleId} onChange={setRoleId} style={{ flex: 1 }} />
            <Select label={t('users.area')} data={departmentOptions} value={departmentId} onChange={(value) => setDepartmentId(value ?? '')} allowDeselect={false} style={{ flex: 1 }} />
          </Group>
          <Button
            variant="outline"
            disabled={!roleId || draft.roles.some((r) => r.roleId === roleId && (r.departmentId ?? '') === departmentId)}
            onClick={() => roleId && set('roles', [...draft.roles, { roleId, departmentId: departmentId || null }])}
          >
            {t('users.assignRole')}
          </Button>

          <Group justify="flex-end" mt="md">
            {user && !isSelf && user.active && !user.technical && can(session, 'core.users.impersonate') && !session?.impersonator && (
              <Button variant="subtle" onClick={() => setImpersonating(true)}>{t('users.impersonate')}</Button>
            )}
            {user?.oidcLinked && <Button variant="subtle" onClick={() => unlinkOidc.mutate(undefined)} loading={unlinkOidc.isPending}>{t('users.oidcUnlink')}</Button>}
            {user && !isSelf && (
              user.active ? (
                <Button variant="default" onClick={() => setLocking(true)}>{t('users.lock')}</Button>
              ) : (
                <Button variant="default" onClick={() => save.mutate({ ...draft, active: true })}>{t('users.unlock')}</Button>
              )
            )}
            <Button type="submit" loading={save.isPending}>{common('actions.save')}</Button>
          </Group>
        </Stack>
      </form>
      <ConfirmDialog
        opened={impersonating}
        onClose={() => setImpersonating(false)}
        title={t('users.impersonateTitle', { name: user?.displayName })}
        description={t('users.impersonateText')}
        reason={t('users.impersonateReason')}
        confirmLabel={t('users.impersonateConfirm')}
        loading={impersonate.isPending}
        onConfirm={(reason) => impersonate.mutate(reason)}
      />
      <ConfirmDialog
        opened={locking}
        onClose={() => setLocking(false)}
        title={t('users.lockTitle', { name: user?.displayName })}
        description={t('users.lockText', { username: user?.username })}
        confirmLabel={t('users.lockConfirm')}
        loading={save.isPending}
        onConfirm={() => {
          setLocking(false);
          save.mutate({ ...draft, active: false });
        }}
      />
    </Panel>
  );
}

/** Users with their roles; the editor opens next to the list. */
export function UsersPage() {
  const { t, i18n } = useTranslation('shell');
  const { data: users = [] } = useUsers();
  const { data: roles = [] } = useRoles();
  const { data: departments = [] } = useDepartments();
  const { data: persons = [] } = usePersons();
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('active');
  const [selected, setSelected] = useState<string | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users
      .filter((u) => matchesSearch([u.username, u.displayName], q))
      .filter((u) => !roleFilter || u.roles.some((r) => r.roleId === roleFilter))
      .filter((u) => status === 'all' || (status === 'active' ? u.active : !u.active))
      .toSorted((a, b) => a.displayName.localeCompare(b.displayName));
  }, [users, query, roleFilter, status]);
  const current = selected && selected !== 'new' ? (users.find((u) => u.id === selected) ?? null) : null;
  const person = (id: string | null) => persons.find((p) => p.id === id);

  return (
    <Stack gap="lg">
      <PageHeader
        breadcrumbs={[{ label: t('nav.administration') }, { label: t('nav.users') }]}
        title={t('nav.users')}
        actions={<Button onClick={() => setSelected('new')}>{t('users.create')}</Button>}
      />
      <Grid gap="lg">
        <Grid.Col span={{ base: 12, lg: selected ? 7 : 12 }}>
          <Stack gap="md">
            <Group grow align="end">
              <TextInput label={t('users.search')} placeholder={t('users.searchPlaceholder')} value={query} onChange={(e) => setQuery(e.currentTarget.value)} type="search" />
              <Select label={t('users.role')} placeholder={t('users.allRoles')} data={roles.map((r) => ({ value: r.id, label: r.name }))} value={roleFilter} onChange={setRoleFilter} clearable />
              <Select
                label={t('users.status')}
                data={[{ value: 'active', label: t('users.active') }, { value: 'locked', label: t('users.locked') }, { value: 'all', label: t('users.all') }]}
                value={status}
                onChange={(value) => setStatus(value ?? 'active')}
                allowDeselect={false}
              />
            </Group>
            <DataTable
              rows={rows}
              rowKey={(u) => u.id}
              selectedKey={selected}
              onRowClick={(u) => setSelected(u.id)}
              columns={[
                { key: 'username', header: t('users.username'), render: (u) => <Text fw={700} size="sm">{u.username}</Text> },
                { key: 'person', header: t('users.personColumn'), render: (u) => (u.technical ? <Text size="sm" c="dimmed">{t('users.technical')}</Text> : (person(u.personId) ? personLabel(person(u.personId)!) : u.displayName)) },
                { key: 'roles', header: t('users.roles'), render: (u) => u.roles.map((r) => assignmentLabel(r.roleId, r.departmentId, roles, departments, t('users.brigade'))).join(' · ') },
                { key: 'lastLogin', header: t('users.lastLogin'), render: (u) => formatDateTime(u.lastLogin, i18n.language) },
                {
                  key: 'status',
                  header: t('users.status'),
                  render: (u) => <StatusBadge tone={u.technical ? 'neutral' : u.active ? 'done' : 'warning'}>{t(u.technical ? 'users.technical' : u.active ? 'users.active' : 'users.locked')}</StatusBadge>,
                },
              ]}
            />
          </Stack>
        </Grid.Col>
        {selected && (
          <Grid.Col span={{ base: 12, lg: 5 }}>
            <UserEditor key={selected} user={current} onDone={setSelected} />
          </Grid.Col>
        )}
      </Grid>
    </Stack>
  );
}
