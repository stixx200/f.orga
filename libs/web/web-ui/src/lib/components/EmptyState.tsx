import { Stack, Text } from '@mantine/core';
import { IconInbox } from '@tabler/icons-react';
import type { ReactNode } from 'react';

/** Empty list or page with an explanation and the next action. */
export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <Stack align="center" gap="xs" py="xl">
      <IconInbox size={40} stroke={1.25} color="#9b8a88" aria-hidden />
      <Text fw={700}>{title}</Text>
      {text && <Text c="dimmed" size="sm" ta="center" maw={420}>{text}</Text>}
      {action}
    </Stack>
  );
}
