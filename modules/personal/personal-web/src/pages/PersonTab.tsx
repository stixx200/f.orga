import { useState } from 'react';
import { Button, CopyButton, Group, Stack, Text, TextInput } from '@mantine/core';
import type { PersonalLinkCreated, ShownLink } from '@forga/personal-contracts';
import { can, formatDateTime, send, useSession, useTranslation } from '@forga/web-sdk';
import { Notice, Panel, useAction } from '@forga/web-ui';
import { linkKey, MANAGE, usePersonalLink } from '../api';

/** Tab "Persönlicher Zugang" in the person file. */
export function PersonTab({ personId }: { personId?: unknown }) {
  const { t, i18n } = useTranslation('personal');
  const id = String(personId);
  const session = useSession().data;
  const manage = can(session, MANAGE);
  const { data: link, isLoading } = usePersonalLink(id);
  const [shown, setShown] = useState<ShownLink | null>(null);
  const create = useAction(() => send<PersonalLinkCreated>('POST', `personal/persons/${id}/link`), {
    success: t('person.created'),
    invalidate: [linkKey(id), ['personal', 'links']],
    onSuccess: (result) => setShown({ url: result.url, key: result.key }),
  });
  const reveal = useAction(() => send<ShownLink>('POST', `personal/persons/${id}/link/show`), {
    invalidate: [linkKey(id)],
    onSuccess: (result) => setShown(result),
  });
  const revoke = useAction(() => send('DELETE', `personal/persons/${id}/link`), {
    success: t('person.revokedDone'),
    invalidate: [linkKey(id), ['personal', 'links']],
    onSuccess: () => setShown(null),
  });

  return (
    <Panel title={t('person.title')}>
      <Stack gap="sm">
        <Text size="sm" c="dimmed">{t('person.hint')}</Text>
        {isLoading ? null : link?.active ? (
          <Text size="sm">
            {t('person.prefix', { prefix: link.keyPrefix })}
            {' · '}
            {link.lastSeenAt ? t('person.lastSeen', { date: formatDateTime(link.lastSeenAt, i18n.language) }) : t('person.never')}
          </Text>
        ) : (
          <Text size="sm">{link?.revokedAt ? t('person.revoked') : t('person.none')}</Text>
        )}
        {shown ? (
          <Notice kind="done">
            <Stack gap="xs">
              <Text size="sm">{t('person.once')}</Text>
              <TextInput readOnly value={shown.url} />
              <CopyButton value={shown.url}>
                {({ copied, copy }) => <Button variant="default" onClick={copy}>{copied ? t('person.copied') : t('person.copy')}</Button>}
              </CopyButton>
            </Stack>
          </Notice>
        ) : null}
        {manage ? (
          <Group>
            <Button loading={create.isPending} onClick={() => create.mutate(undefined)}>{t('person.create')}</Button>
            {link?.active ? <Button variant="default" loading={reveal.isPending} onClick={() => reveal.mutate(undefined)}>{t('person.show')}</Button> : null}
            {link?.active ? <Button variant="default" loading={revoke.isPending} onClick={() => revoke.mutate(undefined)}>{t('person.revoke')}</Button> : null}
          </Group>
        ) : null}
      </Stack>
    </Panel>
  );
}
