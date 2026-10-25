import { Alert, Button, Center, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError, currentLanguage, send, useTranslation } from '@forga/web-sdk';
import { LanguageSwitch } from '../frame/LanguageSwitch';

export function SetupPage() {
  const { t } = useTranslation('shell');
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ setupToken: '', brigadeName: '', displayName: '', username: '', email: '', password: '' });
  const setup = useMutation({
    mutationFn: () => send('POST', 'core/setup', { ...form, language: currentLanguage() }),
    onSuccess: () => queryClient.invalidateQueries(),
  });
  const field = (name: keyof typeof form) => ({
    value: form[name],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [name]: event.currentTarget.value }),
    required: true,
  });

  return (
    <Center mih="100vh" p="md">
      <Paper withBorder p="xl" w={440}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setup.mutate();
          }}
        >
          <Stack>
            <Title order={2} c="brand">
              {t('setup.title')}
            </Title>
            <Text size="sm">{t('setup.intro')}</Text>
            {setup.error && <Alert color="brand">{(setup.error as ApiError).translated()}</Alert>}
            <PasswordInput label={t('setup.setupToken')} description={t('setup.setupTokenHint')} autoComplete="off" {...field('setupToken')} />
            <TextInput label={t('setup.brigadeName')} {...field('brigadeName')} />
            <TextInput label={t('setup.displayName')} {...field('displayName')} />
            <TextInput label={t('setup.username')} autoComplete="username" {...field('username')} />
            <TextInput label={t('setup.email')} description={t('setup.emailHint')} type="email" autoComplete="email" {...field('email')} />
            <PasswordInput label={t('setup.password')} autoComplete="new-password" minLength={10} {...field('password')} />
            <Button type="submit" loading={setup.isPending}>
              {t('setup.submit')}
            </Button>
            <LanguageSwitch loggedIn={false} />
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}
