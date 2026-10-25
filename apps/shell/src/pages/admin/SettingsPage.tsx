import { Anchor, Button, FileButton, Group, NumberInput, PasswordInput, Select, SimpleGrid, Stack, Switch, Tabs, Text, TextInput } from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import type { BrigadeSettings, OidcSettings, PrivacySettings, ReminderSettings, RetentionResult, SmtpSettings } from '@forga/core-contracts';
import { api, can, send, upload as uploadFile, useLocalized, useSession, useTranslation } from '@forga/web-sdk';
import { ConfirmDialog, Notice, notifySuccess, PageHeader, Panel, useAction } from '@forga/web-ui';
import type { LoadedModule } from '../../modules';

const key = (section: string) => ['core', 'settings', section] as const;

function useSection<T>(section: string) {
  return useQuery({ queryKey: key(section), queryFn: () => api<T | null>(`core/settings/${section}`) });
}

/** A form for one settings section; the stored value is loaded before the form is shown. */
function SectionForm<T extends object>({ section, defaults, children }: { section: string; defaults: T; children: (value: T, set: <K extends keyof T>(k: K, v: T[K]) => void) => ReactNode }) {
  const { data, isLoading } = useSection<T>(section);
  if (isLoading) return null;
  return <SectionFormLoaded section={section} initial={{ ...defaults, ...data }}>{children}</SectionFormLoaded>;
}

function SectionFormLoaded<T extends object>({ section, initial, children }: { section: string; initial: T; children: (value: T, set: <K extends keyof T>(k: K, v: T[K]) => void) => ReactNode }) {
  const { t } = useTranslation('shell');
  const { t: common } = useTranslation('common');
  const [value, setValue] = useState<T>(initial);
  const save = useAction((input: T) => send('PUT', `core/settings/${section}`, input), { success: t('settings.saved'), invalidate: [key(section)] });
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(value);
      }}
    >
      <Stack gap="md">
        {children(value, (k, v) => setValue((current) => ({ ...current, [k]: v })))}
        <Group justify="flex-end">
          <Button type="submit" loading={save.isPending}>{common('actions.save')}</Button>
        </Group>
      </Stack>
    </form>
  );
}

const BRIGADE_DEFAULTS: BrigadeSettings = { name: '', street: '', postalCode: '', city: '', phone: '', fax: '', website: '', email: '', municipality: '', population: null, publicUrl: '' };
const PRIVACY_DEFAULTS: PrivacySettings = { anonymizeLeftAfterYears: null, auditRetentionMonths: 24 };
const TABS = ['brigade', 'smtp', 'reminders', 'privacy', 'oidc', 'export'];

/** Persons a period would anonymise now (dry run with the chosen value, before saving). */
function AffectedPersons({ years }: { years: number | null }) {
  const { t } = useTranslation('shell');
  const { data } = useQuery({
    queryKey: ['core', 'retention', 'preview', years],
    queryFn: () => send<RetentionResult>('POST', 'core/retention/run', { dryRun: true, settings: { anonymizeLeftAfterYears: years } }),
    enabled: years !== null,
  });
  if (years === null || !data) return null;
  const count = data.counts['masterdata.persons'] ?? 0;
  return <Notice kind={count > 0 ? 'warning' : 'info'}>{t('settings.privacy.affected', { count })}</Notice>;
}

/** Warnings and the connection test of the OIDC settings. */
function OidcChecks({ matchBy }: { matchBy: OidcSettings['matchBy'] }) {
  const { t } = useTranslation('shell');
  const { data: brigade } = useSection<BrigadeSettings>('brigade');
  const test = useAction(() => send<{ issuer: string }>('POST', 'core/settings/oidc/test'), { onSuccess: (r) => notifySuccess(t('settings.oidc.testOk', { issuer: r.issuer })) });
  return (
    <Stack gap="sm">
      {matchBy === 'username' && <Notice kind="warning">{t('settings.oidc.usernameWarning')}</Notice>}
      {brigade && !brigade.publicUrl && <Notice kind="warning">{t('settings.oidc.noPublicUrl')}</Notice>}
      <Text size="xs" c="dimmed">{t('settings.oidc.adminHint')}</Text>
      <Group>
        <Button variant="default" loading={test.isPending} onClick={() => test.mutate(undefined)}>{t('settings.oidc.test')}</Button>
      </Group>
    </Stack>
  );
}
const SMTP_DEFAULTS: SmtpSettings = { host: '', port: 587, starttls: true, username: '', password: '', sender: '' };
const REMINDER_DEFAULTS: ReminderSettings = { enabled: true, weekday: 1, hour: 7 };
const OIDC_DEFAULTS: OidcSettings = { enabled: false, issuer: '', clientId: '', clientSecret: '', scopes: 'openid email profile', matchBy: 'email', buttonLabel: { de: 'Mit Konto der Gemeinde anmelden', en: 'Sign in with the municipal account' } };

export function SettingsPage({ modules }: { modules: LoadedModule[] }) {
  const { t } = useTranslation('shell');
  const localized = useLocalized();
  const session = useSession().data;
  const [confirmRetention, setConfirmRetention] = useState(false);
  const testMail = useAction(() => send<{ to: string }>('POST', 'core/settings/smtp/test'), { onSuccess: (r) => notifySuccess(t('settings.smtp.testSent', { to: r.to })) });
  const retention = useAction((dryRun: boolean) => send<RetentionResult>('POST', 'core/retention/run', { dryRun }), {});
  const { data: exportModules = [] } = useQuery({ queryKey: ['core', 'export'], queryFn: () => api<string[]>('core/export'), enabled: can(session, 'core.data.export') });
  const moduleName = (id: string) => {
    const module = modules.find((m) => m.info.id === id);
    return module ? localized(module.info.name) : id;
  };
  const [tab, setTab] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get('tab');
    return requested && TABS.includes(requested) ? requested : 'brigade';
  });
  const weekdays = [1, 2, 3, 4, 5, 6, 7].map((day) => ({ value: String(day), label: t(`settings.weekdays.${day}`) }));
  return (
    <Stack gap="lg">
      <PageHeader breadcrumbs={[{ label: t('nav.administration') }, { label: t('nav.settings') }]} title={t('nav.settings')} />
      <Tabs value={tab} onChange={(value) => setTab(value ?? 'brigade')} keepMounted={false}>
        <Tabs.List mb="lg">
          <Tabs.Tab value="brigade">{t('settings.tabs.brigade')}</Tabs.Tab>
          <Tabs.Tab value="smtp">{t('settings.tabs.smtp')}</Tabs.Tab>
          <Tabs.Tab value="reminders">{t('settings.tabs.reminders')}</Tabs.Tab>
          <Tabs.Tab value="privacy">{t('settings.tabs.privacy')}</Tabs.Tab>
          <Tabs.Tab value="oidc">{t('settings.tabs.oidc')}</Tabs.Tab>
          {can(session, 'core.data.export') && <Tabs.Tab value="export">{t('settings.tabs.export')}</Tabs.Tab>}
        </Tabs.List>
        <Tabs.Panel value="brigade">
          <Panel title={t('settings.brigade.title')} maw={880}>
            <SectionForm section="brigade" defaults={BRIGADE_DEFAULTS}>
              {(v, set) => (
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                  <TextInput label={t('settings.brigade.name')} description={t('settings.brigade.nameHint')} value={v.name} onChange={(e) => set('name', e.currentTarget.value)} required />
                  <TextInput label={t('settings.brigade.email')} type="email" value={v.email} onChange={(e) => set('email', e.currentTarget.value)} />
                  <TextInput label={t('settings.brigade.street')} value={v.street} onChange={(e) => set('street', e.currentTarget.value)} />
                  <Group grow>
                    <TextInput label={t('settings.brigade.postalCode')} value={v.postalCode} onChange={(e) => set('postalCode', e.currentTarget.value)} />
                    <TextInput label={t('settings.brigade.city')} value={v.city} onChange={(e) => set('city', e.currentTarget.value)} />
                  </Group>
                  <TextInput label={t('settings.brigade.phone')} type="tel" value={v.phone} onChange={(e) => set('phone', e.currentTarget.value)} />
                  <TextInput label={t('settings.brigade.fax')} type="tel" value={v.fax} onChange={(e) => set('fax', e.currentTarget.value)} />
                  <TextInput label={t('settings.brigade.website')} value={v.website} onChange={(e) => set('website', e.currentTarget.value)} />
                  <TextInput label={t('settings.brigade.municipality')} description={t('settings.brigade.municipalityHint')} value={v.municipality} onChange={(e) => set('municipality', e.currentTarget.value)} />
                  <NumberInput label={t('settings.brigade.population')} description={t('settings.brigade.populationHint')} value={v.population ?? ''} onChange={(value) => set('population', value === '' ? null : Number(value))} min={0} thousandSeparator="." decimalSeparator="," />
                  <TextInput label={t('settings.brigade.publicUrl')} description={t('settings.brigade.publicUrlHint')} placeholder="https://forga.feuerwehr-beispiel.de" value={v.publicUrl} onChange={(e) => set('publicUrl', e.currentTarget.value)} />
                </SimpleGrid>
              )}
            </SectionForm>
          </Panel>
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg" mt="lg" maw={880}>
            <AssetPanel asset="logo" />
            <AssetPanel asset="letterhead" />
          </SimpleGrid>
        </Tabs.Panel>
        <Tabs.Panel value="smtp">
          <Panel title={t('settings.smtp.title')} maw={880}>
            <SectionForm section="smtp" defaults={SMTP_DEFAULTS}>
              {(v, set) => (
                <>
                  <SimpleGrid cols={{ base: 1, sm: 2 }}>
                    <TextInput label={t('settings.smtp.host')} value={v.host} onChange={(e) => set('host', e.currentTarget.value)} />
                    <NumberInput label={t('settings.smtp.port')} value={v.port} onChange={(value) => set('port', Number(value) || 587)} min={1} max={65535} />
                    <TextInput label={t('settings.smtp.sender')} type="email" value={v.sender} onChange={(e) => set('sender', e.currentTarget.value)} />
                    <TextInput label={t('settings.smtp.username')} value={v.username} onChange={(e) => set('username', e.currentTarget.value)} autoComplete="off" />
                    <PasswordInput label={t('settings.smtp.password')} description={t('settings.smtp.passwordHint')} value={v.password ?? ''} onChange={(e) => set('password', e.currentTarget.value)} autoComplete="new-password" />
                  </SimpleGrid>
                  <Switch label={t('settings.smtp.starttls')} checked={v.starttls} onChange={(e) => set('starttls', e.currentTarget.checked)} />
                </>
              )}
            </SectionForm>
            <Group mt="md">
              <Button variant="default" loading={testMail.isPending} onClick={() => testMail.mutate(undefined)}>{t('settings.smtp.test')}</Button>
              <Text size="xs" c="dimmed">{t('settings.smtp.testHint')}</Text>
            </Group>
          </Panel>
        </Tabs.Panel>
        <Tabs.Panel value="reminders">
          <Panel title={t('settings.reminders.title')} maw={880}>
            <SectionForm section="reminders" defaults={REMINDER_DEFAULTS}>
              {(v, set) => (
                <>
                  <Switch label={t('settings.reminders.enabled')} description={t('settings.reminders.enabledHint')} checked={v.enabled} onChange={(e) => set('enabled', e.currentTarget.checked)} />
                  <SimpleGrid cols={{ base: 1, sm: 2 }}>
                    <Select label={t('settings.reminders.weekday')} data={weekdays} value={String(v.weekday)} onChange={(value) => set('weekday', Number(value))} allowDeselect={false} disabled={!v.enabled} />
                    <NumberInput label={t('settings.reminders.hour')} value={v.hour} onChange={(value) => set('hour', Number(value))} min={0} max={23} disabled={!v.enabled} />
                  </SimpleGrid>
                </>
              )}
            </SectionForm>
          </Panel>
        </Tabs.Panel>
        <Tabs.Panel value="oidc">
          <Panel title={t('settings.oidc.title')} maw={880}>
            <Text size="sm" c="dimmed" mb="md">{t('settings.oidc.intro')}</Text>
            <SectionForm section="oidc" defaults={OIDC_DEFAULTS}>
              {(v, set) => (
                <>
                  <Switch label={t('settings.oidc.enabled')} checked={v.enabled} onChange={(e) => set('enabled', e.currentTarget.checked)} />
                  <TextInput label={t('settings.oidc.issuer')} description={t('settings.oidc.issuerHint')} value={v.issuer} onChange={(e) => set('issuer', e.currentTarget.value)} />
                  <SimpleGrid cols={{ base: 1, sm: 2 }}>
                    <TextInput label={t('settings.oidc.clientId')} value={v.clientId} onChange={(e) => set('clientId', e.currentTarget.value)} autoComplete="off" />
                    <PasswordInput label={t('settings.oidc.clientSecret')} description={t('settings.smtp.passwordHint')} value={v.clientSecret ?? ''} onChange={(e) => set('clientSecret', e.currentTarget.value)} autoComplete="new-password" />
                    <TextInput label={t('settings.oidc.scopes')} value={v.scopes} onChange={(e) => set('scopes', e.currentTarget.value)} />
                    <Select label={t('settings.oidc.matchBy')} data={(['email', 'username'] as const).map((m) => ({ value: m, label: t(`settings.oidc.match.${m}`) }))} value={v.matchBy} onChange={(m) => m && set('matchBy', m as OidcSettings['matchBy'])} allowDeselect={false} />
                    <TextInput label={t('settings.oidc.labelDe')} value={v.buttonLabel.de} onChange={(e) => set('buttonLabel', { ...v.buttonLabel, de: e.currentTarget.value })} />
                    <TextInput label={t('settings.oidc.labelEn')} value={v.buttonLabel.en} onChange={(e) => set('buttonLabel', { ...v.buttonLabel, en: e.currentTarget.value })} />
                  </SimpleGrid>
                  <Text size="xs" c="dimmed">{t('settings.oidc.redirect')}</Text>
                  <OidcChecks matchBy={v.matchBy} />
                </>
              )}
            </SectionForm>
          </Panel>
        </Tabs.Panel>
        <Tabs.Panel value="privacy">
          <Panel title={t('settings.privacy.title')} maw={880}>
            <SectionForm section="privacy" defaults={PRIVACY_DEFAULTS}>
              {(v, set) => (
                <>
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                  <Select
                    label={t('settings.privacy.anonymize')}
                    description={t('settings.privacy.anonymizeHint')}
                    data={[{ value: '', label: t('settings.privacy.never') }, ...[5, 10, 15, 20].map((y) => ({ value: String(y), label: t('settings.privacy.years', { count: y }) }))]}
                    value={v.anonymizeLeftAfterYears === null ? '' : String(v.anonymizeLeftAfterYears)}
                    onChange={(value) => set('anonymizeLeftAfterYears', value ? Number(value) : null)}
                    allowDeselect={false}
                  />
                  <Select
                    label={t('settings.privacy.audit')}
                    data={[12, 24, 60, 120].map((m) => ({ value: String(m), label: t('settings.privacy.months', { count: m }) }))}
                    value={String(v.auditRetentionMonths)}
                    onChange={(value) => value && set('auditRetentionMonths', Number(value))}
                    allowDeselect={false}
                  />
                </SimpleGrid>
                <AffectedPersons years={v.anonymizeLeftAfterYears} />
                </>
              )}
            </SectionForm>
            <Group mt="md" align="center">
              <Button variant="default" loading={retention.isPending} onClick={() => retention.mutate(true)}>{t('settings.privacy.preview')}</Button>
              {retention.data && (
                <Text size="sm">
                  {t('settings.privacy.result', { persons: retention.data.counts['masterdata.persons'] ?? 0, audit: retention.data.counts['core.audit'] ?? 0 })}
                </Text>
              )}
              {retention.data?.dryRun && Object.values(retention.data.counts).some((c) => c > 0) && (
                <Button color="brand" onClick={() => setConfirmRetention(true)}>{t('settings.privacy.apply')}</Button>
              )}
            </Group>
            <Text size="xs" c="dimmed" mt="sm">{t('settings.privacy.daily')}</Text>
          </Panel>
          <ConfirmDialog
            opened={confirmRetention}
            onClose={() => setConfirmRetention(false)}
            title={t('settings.privacy.applyTitle')}
            description={t('settings.privacy.applyText')}
            confirmLabel={t('settings.privacy.apply')}
            onConfirm={() => {
              setConfirmRetention(false);
              retention.mutate(false);
            }}
          />
        </Tabs.Panel>
        <Tabs.Panel value="export">
          <Panel title={t('settings.export.title')} maw={880}>
            <Text size="sm" mb="md">{t('settings.export.text')}</Text>
            <Group>
              {exportModules.map((module) => (
                <Button key={module} component="a" href={`/api/core/export/${module}`} variant="default" leftSection={<IconDownload size={16} />}>
                  {t('settings.export.module', { module: moduleName(module) })}
                </Button>
              ))}
            </Group>
            <Text size="xs" c="dimmed" mt="md">{t('settings.export.personHint')}</Text>
            <Text size="sm" mt="lg">
              {t('settings.export.api')} <Anchor href="/api/docs" target="_blank">/api/docs</Anchor>
            </Text>
          </Panel>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

/** Upload, preview and removal of the coat of arms or the letterhead (`/api/core/assets/:key`). */
function AssetPanel({ asset }: { asset: 'logo' | 'letterhead' }) {
  const { t } = useTranslation('shell');
  const [version, setVersion] = useState(0);
  const [missing, setMissing] = useState(false);
  const changed = () => {
    setMissing(false);
    setVersion((v) => v + 1);
  };
  const store = useAction((file: File) => uploadFile(`core/assets/${asset}`, file, 'PUT'), { success: t('settings.saved'), onSuccess: changed });
  const remove = useAction(() => send('DELETE', `core/assets/${asset}`), { success: t('settings.saved'), onSuccess: changed });
  return (
    <Panel title={t(`settings.assets.${asset}`)}>
      <Stack gap="sm">
        <Text size="xs" c="dimmed">{t(`settings.assets.${asset}Hint`)}</Text>
        {missing ? (
          <Text size="sm" c="dimmed">{t('settings.assets.none')}</Text>
        ) : (
          <img key={version} src={`/api/core/assets/${asset}?v=${version}`} alt="" style={{ maxHeight: 96, maxWidth: '100%', objectFit: 'contain', alignSelf: 'flex-start' }} onError={() => setMissing(true)} />
        )}
        <Group>
          <FileButton onChange={(file) => file && store.mutate(file)} accept="image/png,image/jpeg,image/webp,image/svg+xml">
            {(props) => <Button {...props} variant="default" loading={store.isPending}>{t('settings.assets.upload')}</Button>}
          </FileButton>
          {!missing && <Button variant="subtle" loading={remove.isPending} onClick={() => remove.mutate(undefined)}>{t('settings.assets.remove')}</Button>}
        </Group>
      </Stack>
    </Panel>
  );
}
