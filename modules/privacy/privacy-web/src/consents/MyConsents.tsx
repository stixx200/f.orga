import { Anchor, Button, Stack, Switch, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { MyConsent, MyConsents } from '@forga/privacy-contracts';
import { api, formatDate, send, useLocalized, useTranslation } from '@forga/web-sdk';
import { Notice, Panel, ResponsiveDialog, useAction } from '@forga/web-ui';
import { TextBlock } from '../pages/TextBlock';

export const MY_CONSENTS_KEY = ['privacy', 'me', 'consents'] as const;

export function useMyConsents(enabled = true) {
  return useQuery({ queryKey: MY_CONSENTS_KEY, queryFn: () => api<MyConsents>('privacy/me/consents'), enabled });
}

/** Full text and purpose of a consent. */
function ConsentText({ consent, onClose }: { consent: MyConsent; onClose: () => void }) {
  const { t } = useTranslation('common');
  const localized = useLocalized();
  return (
    <ResponsiveDialog opened onClose={onClose} title={localized(consent.title)} actions={<Button onClick={onClose}>{t('actions.close')}</Button>}>
      <TextBlock text={localized(consent.text)} />
      {localized(consent.purpose) && <Text size="xs" c="dimmed">{localized(consent.purpose)}</Text>}
    </ResponsiveDialog>
  );
}

/**
 * „Meine Einwilligungen“ in "My area" (L9): each consent as a switch; giving needs the current version, a withdrawal
 * applies right away. Minors only see them (the legal guardians consent in writing).
 */
export function MyConsentsPanel() {
  const { t, i18n } = useTranslation('privacy');
  const localized = useLocalized();
  const { data } = useMyConsents();
  const [reading, setReading] = useState<MyConsent | null>(null);
  const change = useAction((input: { key: string; given: boolean; version: number | null }) => send<MyConsents>('PUT', `privacy/me/consents/${input.key}`, { given: input.given, ...(input.version ? { version: input.version } : {}) }), {
    invalidate: [MY_CONSENTS_KEY],
  });
  if (!data) return null;
  const meta = (c: MyConsent) => {
    if (c.given) return t('transparency.consents.me.given', { date: formatDate(c.given.givenOn, i18n.language) });
    if (c.withdrawnOn) return t('transparency.consents.me.withdrawn', { date: formatDate(c.withdrawnOn, i18n.language) });
    return t('transparency.consents.me.notGiven');
  };
  return (
    <Panel title={t('transparency.consents.me.title')}>
      <Stack gap="sm">
        <Text size="sm" c="dimmed">{t('transparency.consents.me.intro')}</Text>
        {data.minor && <Notice kind="info">{t('transparency.consents.me.minor')}</Notice>}
        {data.consents.length === 0 && <Text size="sm" c="dimmed">{t('transparency.consents.me.none')}</Text>}
        {data.consents.map((c) => {
          const renewal = c.given && c.version !== null && c.version > c.given.version;
          return (
            <Stack key={c.key} gap={2}>
              <Switch
                label={<Text size="sm" fw={700}>{localized(c.title)}</Text>}
                description={
                  <>
                    {meta(c)}
                    {c.version === null && ` · ${t('transparency.consents.me.noLongerOffered')}`}
                    {' · '}
                    <Anchor component="button" type="button" size="xs" onClick={() => setReading(c)}>{t('transparency.consents.me.readText')}</Anchor>
                  </>
                }
                checked={Boolean(c.given)}
                disabled={data.minor || change.isPending || (!c.given && c.version === null)}
                onChange={(e) => change.mutate({ key: c.key, given: e.currentTarget.checked, version: c.version })}
              />
              {renewal && !data.minor && (
                <Text size="xs" c="dimmed" pl={54}>
                  {t('transparency.consents.me.newVersion')}{' '}
                  <Anchor component="button" type="button" size="xs" onClick={() => change.mutate({ key: c.key, given: true, version: c.version })}>{localized(c.title)}</Anchor>
                </Text>
              )}
            </Stack>
          );
        })}
      </Stack>
      {reading && <ConsentText consent={reading} onClose={() => setReading(null)} />}
    </Panel>
  );
}

/**
 * The consents offered at the first sign-in after the notice (L4, L9): voluntary, one switch each, none preselected;
 * stored with "Weiter". Not for minors.
 */
export function FirstLoginConsents({ selected, onChange }: { selected: string[]; onChange: (keys: string[]) => void }) {
  const { t } = useTranslation('privacy');
  const localized = useLocalized();
  const { data } = useMyConsents();
  const [reading, setReading] = useState<MyConsent | null>(null);
  const offered = data && !data.minor ? data.consents.filter((c) => c.version !== null && !c.given) : [];
  if (!offered.length) return null;
  return (
    <Stack gap="xs">
      <Text fw={700}>{t('transparency.consents.firstLogin.title')}</Text>
      <Text size="xs" c="dimmed">{t('transparency.consents.firstLogin.hint')}</Text>
      {offered.map((c) => (
        <Switch
          key={c.key}
          label={localized(c.title)}
          description={
            <Anchor component="button" type="button" size="xs" onClick={() => setReading(c)}>{t('transparency.consents.me.readText')}</Anchor>
          }
          checked={selected.includes(c.key)}
          onChange={(e) => onChange(e.currentTarget.checked ? [...selected, c.key] : selected.filter((k) => k !== c.key))}
        />
      ))}
      {reading && <ConsentText consent={reading} onClose={() => setReading(null)} />}
    </Stack>
  );
}

/** Stores the consents chosen at the first sign-in (`firstLogin`), in the offered versions. */
export async function giveFirstLoginConsents(consents: MyConsents | undefined, keys: string[]): Promise<void> {
  for (const key of keys) {
    const consent = consents?.consents.find((c) => c.key === key);
    if (consent?.version) await send('PUT', `privacy/me/consents/${key}`, { given: true, version: consent.version, firstLogin: true });
  }
}
