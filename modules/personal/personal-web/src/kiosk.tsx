import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Stack, Text, TextInput, Title } from '@mantine/core';
import type { PersonalView } from '@forga/personal-contracts';
import { ApiError, api, defineKioskModule, formatDate, send, useLocalized, useTranslation } from '@forga/web-sdk';
import { LanguageSwitch, StatusBadge, type Tone } from '@forga/web-ui';
import { kioskTranslations } from './kiosk/i18n';
import classes from './kiosk/kiosk.module.css';

const QUERY = ['personal', 'kiosk'] as const;
const TONES: Record<'green' | 'yellow' | 'red' | 'grey', Tone> = {
  green: 'done',
  yellow: 'warning',
  red: 'error',
  grey: 'neutral',
};

function keyFromHash(): string | null {
  return new URLSearchParams(window.location.hash.slice(1)).get('k');
}

function PersonalViewPage() {
  const { t } = useTranslation('personal');
  const queryClient = useQueryClient();
  const [pasted, setPasted] = useState('');
  const file = useQuery({
    queryKey: QUERY,
    retry: false,
    queryFn: async () => {
      const key = keyFromHash();
      if (key) {
        await send('POST', 'personal/kiosk/session', { key });
        window.history.replaceState(null, '', window.location.pathname);
      }
      return api<PersonalView>('personal/kiosk/file');
    },
  });
  const open = useMutation({
    mutationFn: (key: string) => send('POST', 'personal/kiosk/session', { key: key.trim() }),
    onSuccess: async () => {
      setPasted('');
      await queryClient.invalidateQueries({ queryKey: QUERY });
    },
  });
  const logout = useMutation({
    mutationFn: () => send('POST', 'personal/kiosk/logout'),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: QUERY });
      await queryClient.invalidateQueries({ queryKey: QUERY });
    },
  });

  if (file.isSuccess) return <File view={file.data} onLogout={() => logout.mutate()} />;

  const error = open.error ?? file.error;
  const message = error instanceof ApiError ? error.translated() : null;
  const waiting = file.isPending && !file.isError;
  return (
    <main className={classes.page}>
      <div className={classes.frame}>
        <div className={classes.top}>
          <Title order={2}>{t('title')}</Title>
          <LanguageSwitch loggedIn={false} />
        </div>
        <Text>{t('intro')}</Text>
        {message && !waiting ? <Text c="brand">{message}</Text> : null}
        <TextInput label={t('key')} value={pasted} onChange={(event) => setPasted(event.currentTarget.value)} autoComplete="off" />
        <Button loading={open.isPending || waiting} disabled={!pasted.trim()} onClick={() => open.mutate(pasted)}>
          {t('open')}
        </Button>
      </div>
    </main>
  );
}

function File({ view, onLogout }: { view: PersonalView; onLogout: () => void }) {
  const { t, i18n } = useTranslation('personal');
  const localized = useLocalized();
  const date = (value: string) => formatDate(value, i18n.language);
  const address = [view.street, [view.postalCode, view.city].filter(Boolean).join(' ')].filter(Boolean);
  const phones = [
    view.phonePrivate ? `${t('phonePrivate')}: ${view.phonePrivate}` : '',
    view.phoneMobile ? `${t('phoneMobile')}: ${view.phoneMobile}` : '',
    view.phoneWork ? `${t('phoneWork')}: ${view.phoneWork}` : '',
  ].filter(Boolean);
  return (
    <main className={classes.page}>
      <div className={classes.frame}>
        <div className={classes.top}>
          <div>
            <Title order={2}>{view.firstName} {view.lastName}</Title>
            <Text size="sm" c="dimmed">{t('title')}</Text>
          </div>
          <LanguageSwitch loggedIn={false} />
        </div>
        <section className={classes.card}>
          <Title order={4}>{t('master')}</Title>
          <Line label={t('status')} value={t(`statusName.${view.status}`, { defaultValue: view.status })} />
          {view.joinedOn ? <Line label={t('joined')} value={date(view.joinedOn)} /> : null}
          {view.rank ? <Line label={t('rank')} value={localized(view.rank.name)} /> : null}
          <Text size="sm" c="dimmed">{t('departments')}</Text>
          {view.memberships.length ? view.memberships.map((membership) => (
            <Text key={membership.departmentId} size="sm">{membership.name}{membership.primary ? ` · ${t('primary')}` : ''}</Text>
          )) : <Text size="sm">{t('none')}</Text>}
          <Text size="sm" c="dimmed">{t('address')}</Text>
          {address.length ? address.map((line) => <Text key={line} size="sm">{line}</Text>) : <Text size="sm">{t('noAddress')}</Text>}
          {phones.length ? <><Text size="sm" c="dimmed">{t('phones')}</Text>{phones.map((line) => <Text key={line} size="sm">{line}</Text>)}</> : null}
          {view.email ? <Line label={t('email')} value={view.email} /> : null}
        </section>
        <section className={classes.card}>
          <Title order={4}>{t('qualifications')}</Title>
          {view.qualifications.length ? view.qualifications.map((item) => (
            <Text key={item.key} size="sm">
              {localized(item.name)} · {t('since', { date: date(item.acquiredOn) })}
              {item.validUntil ? ` · ${t('validUntil', { date: date(item.validUntil) })}` : ''}
            </Text>
          )) : <Text size="sm">{t('none')}</Text>}
        </section>
        <section className={classes.card}>
          <Title order={4}>{t('offices')}</Title>
          {view.offices.length ? view.offices.map((item) => (
            <Text key={`${item.key}-${item.from}`} size="sm">
              {localized(item.name)} · {t('since', { date: date(item.from) })}
              {item.to ? ` · ${t('until', { date: date(item.to) })}` : ''}
            </Text>
          )) : <Text size="sm">{t('none')}</Text>}
        </section>
        {view.respiratory ? (
          <section className={classes.card}>
            <Title order={4}>{t('respiratory')}</Title>
            <StatusBadge tone={TONES[view.respiratory.color]}>{t(`color.${view.respiratory.color}`)}</StatusBadge>
            <Text size="sm">{view.respiratory.nextDue ? t('nextDue', { date: date(view.respiratory.nextDue) }) : t('noDeadline')}</Text>
            <Stack gap={4}>
              {view.respiratory.evidence.map((item) => (
                <Text key={`${item.kind}-${item.date}`} size="sm">
                  {t(`kind.${item.kind}`, { defaultValue: item.kind })} · {date(item.date)}
                  {item.passed === true ? ` · ${t('passed')}` : item.passed === false ? ` · ${t('notPassed')}` : ''}
                  {item.validUntil ? ` · ${t('validUntil', { date: date(item.validUntil) })}` : ''}
                </Text>
              ))}
            </Stack>
          </section>
        ) : null}
        <Button variant="default" onClick={onLogout}>{t('logout')}</Button>
      </div>
    </main>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className={classes.row}>
      <Text size="sm" className={classes.label}>{label}</Text>
      <Text size="sm">{value}</Text>
    </div>
  );
}

/** Personal view, served by the shell at `/personal` without frame and login. */
export default defineKioskModule({
  translations: kioskTranslations,
  component: PersonalViewPage,
});
