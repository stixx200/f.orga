import { Anchor, Button, Group, Radio, SimpleGrid, Stack, Tabs, Text, Textarea, TextInput } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  PRIVACY_TEXT_BLOCKS,
  PRIVACY_TEXT_KEYS,
  type PrivacyContacts,
  type PrivacySelfService,
  type PrivacyTextKey,
  type PrivacyTexts,
  type Session,
} from '@forga/core-contracts';
import { api, can, formatDate, send, useTranslation } from '@forga/web-sdk';
import { DataTable, Notice, Panel, ResponsiveDialog, StatusBadge, useAction } from '@forga/web-ui';
import { RetentionSettings } from '../admin/RetentionSettings';
import { SecuritySettings } from '../admin/SecuritySettings';
import { PRIVACY, privacyKeys, useContacts, useNotice, useTexts } from './api';

const TABS = ['contacts', 'texts', 'selfService', 'security', 'retention'] as const;
type Tab = (typeof TABS)[number];

/** "Verwaltung → Datenschutz → Einstellungen": contacts, text blocks, self-service, security and retention. */
export function PrivacySettings({ session }: { session: Session }) {
  const { t } = useTranslation('shell');
  const [search, setSearch] = useSearchParams();
  const manager = can(session, PRIVACY);
  const settings = can(session, 'core.settings.manage');
  const available = TABS.filter((tab) => (tab === 'security' || tab === 'retention' ? manager || settings : manager));
  const requested = search.get('tab') as Tab | null;
  const tab = requested && available.includes(requested) ? requested : available[0];
  return (
    <Tabs value={tab} onChange={(value) => setSearch(value ? { tab: value } : {}, { replace: true })} keepMounted={false}>
      <Tabs.List mb="lg">
        {available.map((key) => <Tabs.Tab key={key} value={key}>{t(`privacy.settings.tabs.${key}`)}</Tabs.Tab>)}
      </Tabs.List>
      <Tabs.Panel value="contacts"><ContactsTab /></Tabs.Panel>
      <Tabs.Panel value="texts"><TextsTab /></Tabs.Panel>
      <Tabs.Panel value="selfService"><SelfServiceTab /></Tabs.Panel>
      <Tabs.Panel value="security">
        <Stack gap="lg" maw={880}>
          <Panel title={t('privacy.settings.stepUp')}>
            <Text size="sm">{t('privacy.settings.stepUpText')}</Text>
          </Panel>
          <SecuritySettings />
        </Stack>
      </Tabs.Panel>
      <Tabs.Panel value="retention"><RetentionSettings /></Tabs.Panel>
    </Tabs>
  );
}

function ContactsTab() {
  const { data: contacts } = useContacts();
  if (!contacts) return null;
  return (
    <Stack gap="lg" maw={1100}>
      <ContactsForm initial={contacts} />
    </Stack>
  );
}

function ContactsForm({ initial }: { initial: PrivacyContacts }) {
  const { t } = useTranslation('shell');
  const { t: common } = useTranslation('common');
  const [value, setValue] = useState(initial);
  const save = useAction(() => send('PUT', 'core/settings/privacy.contacts', value), { success: t('privacy.settings.saved'), invalidate: [privacyKeys.settings('privacy.contacts'), ['core', 'privacy', 'notice']] });
  const part = <K extends keyof PrivacyContacts>(key: K, field: keyof PrivacyContacts[K], v: string) => setValue((c) => ({ ...c, [key]: { ...c[key], [field]: v } }));
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(undefined);
      }}
    >
      <Stack gap="lg">
        <SimpleGrid cols={{ base: 1, md: 3 }}>
          <Panel title={t('privacy.settings.controller')}>
            <Stack gap="sm">
              <Text size="xs" c="dimmed">{t('privacy.settings.controllerHint')}</Text>
              <TextInput label={t('privacy.settings.name')} value={value.controller.name} onChange={(e) => part('controller', 'name', e.currentTarget.value)} />
              <Textarea label={t('privacy.settings.address')} autosize minRows={2} value={value.controller.address} onChange={(e) => part('controller', 'address', e.currentTarget.value)} />
              <TextInput label={t('privacy.settings.representedBy')} value={value.controller.representedBy} onChange={(e) => part('controller', 'representedBy', e.currentTarget.value)} />
            </Stack>
          </Panel>
          <Panel title={t('privacy.settings.dpo')}>
            <Stack gap="sm">
              <TextInput label={t('privacy.settings.dpoName')} value={value.dpo.name} onChange={(e) => part('dpo', 'name', e.currentTarget.value)} />
              <Textarea label={t('privacy.settings.address')} autosize minRows={2} value={value.dpo.address} onChange={(e) => part('dpo', 'address', e.currentTarget.value)} />
              <TextInput label={t('privacy.settings.email')} type="email" value={value.dpo.email} onChange={(e) => part('dpo', 'email', e.currentTarget.value)} />
              <TextInput label={t('privacy.settings.phone')} type="tel" value={value.dpo.phone} onChange={(e) => part('dpo', 'phone', e.currentTarget.value)} />
            </Stack>
          </Panel>
          <Panel title={t('privacy.settings.authority')}>
            <Stack gap="sm">
              <TextInput label={t('privacy.settings.name')} value={value.authority.name} onChange={(e) => part('authority', 'name', e.currentTarget.value)} />
              <Textarea label={t('privacy.settings.address')} autosize minRows={2} value={value.authority.address} onChange={(e) => part('authority', 'address', e.currentTarget.value)} />
              <TextInput label={t('privacy.settings.website')} value={value.authority.website} onChange={(e) => part('authority', 'website', e.currentTarget.value)} />
            </Stack>
          </Panel>
        </SimpleGrid>
        <Group justify="flex-end">
          <Button type="submit" loading={save.isPending}>{common('actions.save')}</Button>
        </Group>
      </Stack>
    </form>
  );
}

/** Text blocks with usage, version and review state; one block is edited below the table. */
function TextsTab() {
  const { t, i18n } = useTranslation('shell');
  const { data: texts } = useTexts();
  const [selected, setSelected] = useState<PrivacyTextKey>('noticeIntro');
  if (!texts) return null;
  const templates = PRIVACY_TEXT_KEYS.filter((key) => !texts[key].reviewedAt);
  return (
    <Stack gap="lg" maw={1100}>
      {templates.length > 0 && <Notice kind="warning">{t('privacy.settings.textsWarning', { count: templates.length })}</Notice>}
      <DataTable
        rows={PRIVACY_TEXT_KEYS}
        rowKey={(key) => key}
        selectedKey={selected}
        onRowClick={setSelected}
        columns={[
          { key: 'block', header: t('privacy.settings.textsColumns.block'), render: (key) => <Anchor component="button" type="button" onClick={() => setSelected(key)}>{t(`privacy.settings.blocks.${key}`)}</Anchor> },
          { key: 'usage', header: t('privacy.settings.textsColumns.usage'), render: (key) => PRIVACY_TEXT_BLOCKS[key].usage.map((u) => t(`privacy.settings.usage.${u}`)).join(', ') },
          { key: 'version', header: t('privacy.settings.textsColumns.version'), align: 'right', render: (key) => texts[key].version },
          {
            key: 'state',
            header: t('privacy.settings.textsColumns.state'),
            render: (key) =>
              texts[key].reviewedAt ? (
                <StatusBadge tone="done">{t('privacy.settings.reviewed', { date: formatDate(texts[key].reviewedAt, i18n.language) })}</StatusBadge>
              ) : (
                <StatusBadge tone="warning">{t('privacy.settings.template')}</StatusBadge>
              ),
          },
        ]}
      />
      <TextEditor key={`${selected}:${texts[selected].version}:${texts[selected].reviewedAt ?? ''}`} name={selected} texts={texts} />
    </Stack>
  );
}

function TextEditor({ name, texts }: { name: PrivacyTextKey; texts: PrivacyTexts }) {
  const { t, i18n } = useTranslation('shell');
  const { t: common } = useTranslation('common');
  const block = texts[name];
  const [text, setText] = useState(block.text);
  const [reviewing, setReviewing] = useState(false);
  const invalidate = [privacyKeys.texts, ['core', 'privacy', 'notice'], ['core', 'onboarding']] as const;
  const save = useAction(() => send('PUT', `core/privacy/texts/${name}`, { text, version: block.version }), { success: t('privacy.settings.saved'), invalidate });
  const review = useAction(() => send('POST', `core/privacy/texts/${name}/review`, { version: block.version }), { success: t('privacy.settings.saved'), invalidate, onSuccess: () => setReviewing(false) });
  const dirty = text.de !== block.text.de || text.en !== block.text.en;
  const title = t(`privacy.settings.blocks.${name}`);
  return (
    <Panel
      title={title}
      aside={block.reviewedAt ? <StatusBadge tone="done">{t('privacy.settings.reviewedBy', { date: formatDate(block.reviewedAt, i18n.language), name: block.reviewedBy ?? '' })}</StatusBadge> : <StatusBadge tone="warning">{t('privacy.settings.template')}</StatusBadge>}
    >
      <Stack gap="md">
        <SimpleGrid cols={{ base: 1, md: 2 }}>
          <Textarea label={t('privacy.settings.german')} autosize minRows={6} value={text.de} onChange={(e) => setText({ ...text, de: e.currentTarget.value })} />
          <Textarea label={t('privacy.settings.english')} autosize minRows={6} value={text.en} onChange={(e) => setText({ ...text, en: e.currentTarget.value })} />
        </SimpleGrid>
        <Text size="xs" c="dimmed">{t('privacy.settings.placeholders', { list: PRIVACY_TEXT_BLOCKS[name].placeholders.map((p) => `{${p}}`).join(', '), interpolation: { escapeValue: false } })}</Text>
        {block.changedAt && <Text size="xs" c="dimmed">{t('privacy.settings.changed', { version: block.version, date: formatDate(block.changedAt, i18n.language), name: block.changedBy ?? '' })}</Text>}
        <Group justify="flex-end">
          <Button variant="default" disabled={dirty || Boolean(block.reviewedAt)} onClick={() => setReviewing(true)}>{t('privacy.settings.markReviewed')}</Button>
          <Button disabled={!dirty || !text.de.trim() || !text.en.trim()} loading={save.isPending} onClick={() => save.mutate(undefined)}>{common('actions.save')}</Button>
        </Group>
      </Stack>
      {reviewing && (
        <ResponsiveDialog
          opened
          onClose={() => setReviewing(false)}
          title={t('privacy.settings.reviewTitle')}
          actions={
            <>
              <Button variant="default" onClick={() => setReviewing(false)}>{common('actions.cancel')}</Button>
              <Button loading={review.isPending} onClick={() => review.mutate(undefined)}>{t('privacy.settings.reviewSubmit')}</Button>
            </>
          }
        >
          <Text size="sm">{t('privacy.settings.reviewText', { block: title, version: block.version })}</Text>
        </ResponsiveDialog>
      )}
    </Panel>
  );
}

function SelfServiceTab() {
  const { t, i18n } = useTranslation('shell');
  const { data } = useQuery({ queryKey: privacyKeys.settings('privacy.selfServiceAccess'), queryFn: () => api<PrivacySelfService>('core/settings/privacy.selfServiceAccess') });
  const { data: notice } = useNotice();
  return (
    <Stack gap="lg" maw={880}>
      {data && <SelfServiceForm initial={data} />}
      {notice && (
        <Panel title={t('privacy.settings.notice')}>
          <Stack gap="sm">
            <Group>
              <Text size="sm">{t('privacy.settings.noticeVersion', { version: notice.version, date: formatDate(notice.publishedAt, i18n.language) })}</Text>
              {notice.template && <StatusBadge tone="warning">{t('privacy.settings.template')}</StatusBadge>}
              <Anchor href="/privacy" target="_blank" size="sm">{t('privacy.settings.noticeOpen')}</Anchor>
            </Group>
            <Text size="xs" c="dimmed">{t('privacy.settings.noticeTemplate')}</Text>
          </Stack>
        </Panel>
      )}
    </Stack>
  );
}

function SelfServiceForm({ initial }: { initial: PrivacySelfService }) {
  const { t } = useTranslation('shell');
  const { t: common } = useTranslation('common');
  const [value, setValue] = useState(initial);
  const save = useAction(() => send('PUT', 'core/settings/privacy.selfServiceAccess', value), { success: t('privacy.settings.saved'), invalidate: [privacyKeys.settings('privacy.selfServiceAccess')] });
  return (
    <Panel title={t('privacy.settings.selfService')}>
      <Stack gap="md">
        <Radio.Group label={t('privacy.settings.mode')} description={t('privacy.settings.modeHint')} value={value.mode} onChange={(mode) => setValue({ ...value, mode: mode as PrivacySelfService['mode'] })}>
          <Stack gap="xs" mt="xs">
            <Radio value="request" label={t('privacy.settings.modes.request')} />
            <Radio value="instant" label={t('privacy.settings.modes.instant')} />
          </Stack>
        </Radio.Group>
        <TextInput label={t('privacy.settings.contact')} placeholder={t('privacy.settings.contactPlaceholder')} value={value.contact} onChange={(e) => setValue({ ...value, contact: e.currentTarget.value })} />
        <Group justify="flex-end">
          <Button loading={save.isPending} onClick={() => save.mutate(undefined)}>{common('actions.save')}</Button>
        </Group>
      </Stack>
    </Panel>
  );
}
