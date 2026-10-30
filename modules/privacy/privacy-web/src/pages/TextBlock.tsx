import { List, Stack, Text } from '@mantine/core';
import { Fragment } from 'react';

/** A text block: paragraphs separated by blank lines, lines starting with `- ` as list. */
export function TextBlock({ text }: { text: string }) {
  return (
    <Stack gap="xs">
      {text.split(/\n\s*\n/).map((paragraph, index) => {
        const rows = paragraph.split('\n').filter((row) => row.trim());
        if (rows.length && rows.every((row) => row.startsWith('- '))) {
          return (
            <List key={index} size="sm">
              {rows.map((row, i) => <List.Item key={i}>{row.slice(2)}</List.Item>)}
            </List>
          );
        }
        return (
          <Text key={index} size="sm">
            {rows.map((row, i) => (
              <Fragment key={i}>
                {i > 0 && <br />}
                {row.startsWith('- ') ? `• ${row.slice(2)}` : row}
              </Fragment>
            ))}
          </Text>
        );
      })}
    </Stack>
  );
}
