import { ActionIcon, Anchor, FileButton, Group, Image, Loader, Stack, Text } from '@mantine/core';
import { IconFileTypePdf, IconPaperclip, IconTrash } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import type { Attachment } from '@forga/core-contracts';
import { api, apiUrl, send, upload, useTranslation } from '@forga/web-sdk';
import { useAction } from './useAction';

const size = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

export const attachmentsKey = (type: string, id: string) => ['core', 'attachments', type, id] as const;

/**
 * Attachments of a record (photos and PDF): thumbnails open the file, `editable` allows adding and removing.
 * The module registers who may read and write them (`Attachments.register` on the server). `hint` is shown above the
 * upload, e.g. what photos of an incident may show; the server removes location and camera data of photos.
 */
export function Attachments({ type, id, editable = false, hint }: { type: string; id: string; editable?: boolean; hint?: string }) {
  const { t } = useTranslation('common');
  const key = attachmentsKey(type, id);
  const { data = [], isLoading } = useQuery({ queryKey: key, queryFn: () => api<Attachment[]>(`core/attachments?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`) });
  const add = useAction((file: File) => upload<Attachment>(`core/attachments?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`, file), { success: t('attachments.added'), invalidate: [key] });
  const remove = useAction((attachment: string) => send('DELETE', `core/attachments/${attachment}`), { success: t('attachments.removed'), invalidate: [key] });
  if (isLoading) return <Loader size="sm" />;
  return (
    <Stack gap="xs">
      {data.length === 0 && <Text size="sm" c="dimmed">{t('attachments.none')}</Text>}
      {data.map((a) => {
        const url = apiUrl(`core/attachments/${a.id}/file`);
        return (
          <Group key={a.id} gap="sm" wrap="nowrap" justify="space-between">
            <Group gap="sm" wrap="nowrap">
              {/* The thumbnail repeats the link of the name below, so it is skipped by keyboard and screen readers. */}
              <Anchor href={url} target="_blank" rel="noopener" tabIndex={-1} aria-hidden>
                {a.contentType.startsWith('image/') ? <Image src={url} alt="" w={56} h={56} fit="cover" radius="sm" /> : <IconFileTypePdf size={40} />}
              </Anchor>
              <div>
                <Anchor href={url} target="_blank" rel="noopener" size="sm">{a.fileName}</Anchor>
                <Text size="xs" c="dimmed">{t('attachments.by', { size: size(a.size), by: a.createdBy })}</Text>
              </div>
            </Group>
            {editable && (
              <ActionIcon variant="subtle" color="red" aria-label={t('attachments.remove')} loading={remove.isPending && remove.variables === a.id} onClick={() => remove.mutate(a.id)}>
                <IconTrash size={16} />
              </ActionIcon>
            )}
          </Group>
        );
      })}
      {editable && hint && <Text size="xs" c="dimmed">{hint}</Text>}
      {editable && (
        <Group gap="sm">
          <FileButton accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(file) => file && add.mutate(file)}>
            {(props) => (
              <Anchor component="button" type="button" size="sm" {...props}>
                <Group gap={4}><IconPaperclip size={16} />{t('attachments.add')}</Group>
              </Anchor>
            )}
          </FileButton>
          {add.isPending && <Loader size="xs" />}
          <Text size="xs" c="dimmed">{t('attachments.hint')}</Text>
        </Group>
      )}
      {editable && <Text size="xs" c="dimmed">{t('attachments.metadata')}</Text>}
    </Stack>
  );
}
