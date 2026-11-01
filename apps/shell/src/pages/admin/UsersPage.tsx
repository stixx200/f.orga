import { ActionIcon, Button, Grid, Group, MultiSelect, PasswordInput, Select, Stack, Switch, Table, Text, TextInput, Title } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import type { BulkUserInvitationResult, LocalizedText, Role, User, UserInput } from '@forga/core-contracts';
import { can, currentLanguage, formatDate, formatDateTime, send, useLocalized, useSession, useTranslation } from '@forga/web-sdk';
import { ConfirmDialog, DataTable, matchesSearch, notifySuccess, PageHeader, Panel, ResponsiveDialog, StatusBadge, useAction, useRevealOnSelect } from '@forga/web-ui';
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

function assignmentLabel(roleId: string, departmentId: string | null, roles: Role[], departments: DepartmentOption[], brigade: string, localized: (text: LocalizedText) => string) {
  const name = roles.find((r) => r.id === roleId)?.name;
  const role = name ? localized(name) : roleId;
  const area = departmentId ? (departments.find((d) => d.id === departmentId)?.name ?? departmentId) : brigade;
  return `${role} (${area})`;
}

function UserEditor({ user, onDone }: { user: User | null; onDone: (id: string | null) => void }) {
  const { t } = useTranslation('shell');
  const { t: common } = useTranslation('common');
  const localized = useLocalized();
  const session = useSession().data;
  const { data: roles = [] } = useRoles();
  const { data: departments = [] } = useDepartments();
  const { data: persons = [] } = usePersons();
  const { data: users = [] } = useUsers();
  // A person belongs to at most one user: only persons without a user (and the own one) are offered.
  const linkedElsewhere = new Set(users.flatMap((u) => (u.personId && u.id !== user?.id ? [u.personId] : [])));
  const [draft, setDraft] = useState<Draft>(() => (user ? toDraft(user) : emptyDraft()));
  const isSelf = user?.id === session?.user.id;
  const [roleId, setRoleId] = useState<string | null>(null);
  const [departmentId, setDepartmentId] = useState<string>('');
  const [locking, setLocking] = useState(false);
  const [impersonating, setImpersonating] = useState(false);
  const impersonate = useAction((reason: string) => send('POST', `core/users/${user!.id}/impersonate`, { reason }), {
    onSuccess: () => window.location.assign('/'),
  });
  const resend = useAction(() => send('POST', `core/users/${user!.id}/invitation`), { success: t('users.resent') });
  const unlinkOidc = useAction(() => send('DELETE', `core/users/${user!.id}/oidc`), { success: t('users.oidcUnlinked'), invalidate: [USERS_KEY] });
  const [resettingMfa, setResettingMfa] = useState(false);
  const resetMfa = useAction((reason: string) => send('DELETE', `core/users/${user!.id}/mfa`, { reason }), {
    success: t('users.mfaResetDone'),
    invalidate: [USERS_KEY],
    onSuccess: () => setResettingMfa(false),
  });
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

  return (
    <Panel
      title={user ? user.displayName : t('users.new')}
      aside={user && <StatusBadge tone={user.active ? (user.passwordSet ? 'done' : 'neutral') : 'warning'}>{t(!user.active ? 'users.locked' : user.passwordSet ? 'users.active' : 'users.pending')}</StatusBadge>}
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
            data={persons.filter((p) => !linkedElsewhere.has(p.id)).map((p) => ({ value: p.id, label: personLabel(p) }))}
            value={draft.personId}
            onChange={(value) => set('personId', value)}
            searchable
            clearable
            // Nobody changes the person of his own account (it opens that person's data).
            disabled={!persons.length || isSelf}
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
              <Text size="sm">{assignmentLabel(assignment.roleId, assignment.departmentId ?? null, roles, departments, t('users.brigade'), localized)}</Text>
              <ActionIcon
                aria-label={t('users.removeRole')}
                onClick={() => set('roles', draft.roles.filter((_, i) => i !== index))}
              >
                <IconTrash size={18} />
              </ActionIcon>
            </Group>
          ))}
          <Group align="end" gap="xs" wrap="nowrap">
            <Select label={t('users.role')} data={roles.map((r) => ({ value: r.id, label: localized(r.name) }))} value={roleId} onChange={setRoleId} style={{ flex: 1 }} />
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
            {user && !user.passwordSet && user.active && <Button variant="subtle" onClick={() => resend.mutate(undefined)} loading={resend.isPending}>{t('users.resend')}</Button>}
            {user?.oidcLinked && <Button variant="subtle" onClick={() => unlinkOidc.mutate(undefined)} loading={unlinkOidc.isPending}>{t('users.oidcUnlink')}</Button>}
            {user?.mfaEnrolled && !isSelf && <Button variant="subtle" onClick={() => setResettingMfa(true)}>{t('users.mfaReset')}</Button>}
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
        opened={resettingMfa}
        onClose={() => setResettingMfa(false)}
        title={t('users.mfaResetTitle', { name: user?.displayName })}
        description={t('users.mfaResetText')}
        reason={t('users.mfaResetReason')}
        confirmLabel={t('users.mfaResetConfirm')}
        loading={resetMfa.isPending}
        onConfirm={(reason) => resetMfa.mutate(reason)}
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
  const localized = useLocalized();
  const { data: users = [] } = useUsers();
  const { data: roles = [] } = useRoles();
  const { data: departments = [] } = useDepartments();
  const { data: persons = [] } = usePersons();
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('active');
  const [selected, setSelected] = useState<string | null>(null);
  const detail = useRevealOnSelect(selected);
  const [inviting, setInviting] = useState<'one' | 'many' | null>(null);

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
        actions={
          <Group gap="xs">
            {persons.length > 0 && <Button variant="default" onClick={() => setInviting('many')}>{t('users.bulk')}</Button>}
            {persons.length > 0 && <Button variant="default" onClick={() => setInviting('one')}>{t('users.invite')}</Button>}
            <Button onClick={() => setSelected('new')}>{t('users.create')}</Button>
          </Group>
        }
      />
      {inviting && <InviteDialog many={inviting === 'many'} linked={new Set(users.flatMap((u) => (u.personId ? [u.personId] : [])))} onClose={(id) => {
        setInviting(null);
        if (id) setSelected(id);
      }} />}
      <Grid gap="lg">
        <Grid.Col span={{ base: 12, lg: selected ? 7 : 12 }}>
          <Stack gap="md">
            <Group grow align="end">
              <TextInput label={t('users.search')} placeholder={t('users.searchPlaceholder')} value={query} onChange={(e) => setQuery(e.currentTarget.value)} type="search" />
              <Select label={t('users.role')} placeholder={t('users.allRoles')} data={roles.map((r) => ({ value: r.id, label: localized(r.name) }))} value={roleFilter} onChange={setRoleFilter} clearable />
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
                { key: 'roles', header: t('users.roles'), render: (u) => u.roles.map((r) => assignmentLabel(r.roleId, r.departmentId, roles, departments, t('users.brigade'), localized)).join(' · ') },
                { key: 'lastLogin', header: t('users.lastLogin'), render: (u) => formatDateTime(u.lastLogin, i18n.language) },
                {
                  key: 'mfa',
                  header: t('users.mfa'),
                  render: (u) =>
                    u.mfaEnrolled ? <StatusBadge tone="done">{t('users.mfaEnrolled')}</StatusBadge>
                    : u.mfaNeeded ? <StatusBadge tone="warning">{t('users.mfaMissing')}</StatusBadge>
                    : <Text size="sm" c="dimmed">{t('users.mfaNotNeeded')}</Text>,
                },
                {
                  key: 'status',
                  header: t('users.status'),
                  render: (u) => (
                    <>
                      <StatusBadge tone={u.technical || (u.active && !u.passwordSet) ? 'neutral' : u.active ? 'done' : 'warning'}>
                        {t(u.technical ? 'users.technical' : !u.active ? 'users.locked' : u.passwordSet ? 'users.active' : 'users.pending')}
                      </StatusBadge>
                      {!u.active && u.lockedAt && <Text size="xs" c="dimmed">{t('hardening.users.lockedSince', { date: formatDate(u.lockedAt, i18n.language) })}</Text>}
                    </>
                  ),
                },
              ]}
            />
          </Stack>
        </Grid.Col>
        {selected && (
          <Grid.Col span={{ base: 12, lg: 5 }} ref={detail}>
            <UserEditor key={selected} user={current} onDone={setSelected} />
          </Grid.Col>
        )}
      </Grid>
    </Stack>
  );
}

/** Invites one person (or several, `many`) to f.orga: user from the person file, link to set the password by e-mail. */
function InviteDialog({ many, linked, onClose }: { many: boolean; linked: Set<string>; onClose: (createdId?: string) => void }) {
  const { t } = useTranslation('shell');
  const { t: common } = useTranslation('common');
  const localized = useLocalized();
  const [result, setResult] = useState<BulkUserInvitationResult | null>(null);
  const { data: roles = [] } = useRoles();
  const { data: departments = [] } = useDepartments();
  const { data: persons = [] } = usePersons();
  const [personIds, setPersonIds] = useState<string[]>([]);
  const [roleId, setRoleId] = useState<string | null>(null);
  const [departmentId, setDepartmentId] = useState('');
  const options = persons.filter((p) => !linked.has(p.id)).map((p) => ({ value: p.id, label: personLabel(p) }));
  const body = () => ({ language: currentLanguage(), roles: roleId ? [{ roleId, departmentId: departmentId || null }] : [] });
  const one = useAction(() => send<User>('POST', 'core/users/invitations', { personId: personIds[0], ...body() }), {
    invalidate: [USERS_KEY],
    onSuccess: (user) => {
      notifySuccess(t('users.invited', { email: user.email }));
      onClose(user.id);
    },
  });
  const bulk = useAction(() => send<BulkUserInvitationResult>('POST', 'core/users/invitations/bulk', { personIds, ...body() }), {
    invalidate: [USERS_KEY],
    onSuccess: (outcome) => {
      notifySuccess(t('users.bulkResult', { invited: outcome.invited.length, skipped: outcome.skipped.length }));
      // Who was skipped and why stays visible until the dialog is closed.
      if (outcome.skipped.length) setResult(outcome);
      else onClose();
    },
  });
  const action = many ? bulk : one;
  const name = (personId: string) => {
    const person = persons.find((p) => p.id === personId);
    return person ? personLabel(person) : personId;
  };
  if (result) {
    return (
      <ResponsiveDialog
        opened
        onClose={() => onClose()}
        title={t('users.bulkResultTitle')}
        actions={<Button onClick={() => onClose()}>{common('actions.close')}</Button>}
      >
        <Text size="sm">{t('users.bulkResult', { invited: result.invited.length, skipped: result.skipped.length })}</Text>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('users.personColumn')}</Table.Th>
              <Table.Th>{t('users.skippedReason')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {result.skipped.map((s) => (
              <Table.Tr key={s.personId}>
                <Table.Td>{name(s.personId)}</Table.Td>
                <Table.Td>
                  {t(`users.skipped.${s.reason}`)}
                  {s.code && <Text size="xs" c="dimmed">{common(`errors.${s.code}`)}</Text>}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ResponsiveDialog>
    );
  }
  return (
    <ResponsiveDialog
      opened
      onClose={() => onClose()}
      title={t(many ? 'users.bulkTitle' : 'users.inviteTitle')}
      actions={
        <>
          <Button variant="outline" color="gray" onClick={() => onClose()}>{common('actions.cancel')}</Button>
          <Button loading={action.isPending} disabled={!personIds.length} onClick={() => action.mutate(undefined)}>
            {many ? t('users.bulkSend', { count: personIds.length }) : t('users.inviteSend')}
          </Button>
        </>
      }
    >
      <Text size="sm">{t(many ? 'users.bulkText' : 'users.inviteText')}</Text>
      {many ? (
        <MultiSelect label={t('users.bulkPersons')} data={options} value={personIds} onChange={setPersonIds} searchable clearable />
      ) : (
        <Select label={t('users.invitePerson')} data={options} value={personIds[0] ?? null} onChange={(value) => setPersonIds(value ? [value] : [])} searchable required />
      )}
      <Group grow align="end">
        <Select label={t('users.roleOptional')} data={roles.map((r) => ({ value: r.id, label: localized(r.name) }))} value={roleId} onChange={setRoleId} clearable />
        <Select label={t('users.area')} data={[{ value: '', label: t('users.brigade') }, ...departments.map((d) => ({ value: d.id, label: d.name }))]} value={departmentId} onChange={(value) => setDepartmentId(value ?? '')} allowDeselect={false} />
      </Group>
    </ResponsiveDialog>
  );
}
