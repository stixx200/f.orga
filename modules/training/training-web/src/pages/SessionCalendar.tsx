import { Box, Paper, SimpleGrid, Stack, Text, UnstyledButton } from '@mantine/core';
import { useState } from 'react';
import type { Session } from '@forga/training-contracts';
import { formatTime, useTranslation } from '@forga/web-sdk';

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** Weeks (Monday first) covering the month, as days; days of other months are `null`. */
function weeksOf(month: Date): (Date | null)[][] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7;
  const cells: (Date | null)[] = [...Array.from({ length: offset }, () => null), ...Array.from({ length: days }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

/** Month grid with the sessions of each day; a click opens the session. */
export function SessionCalendar({ month, sessions, onOpen }: { month: Date; sessions: Session[]; onOpen: (s: Session) => void }) {
  const { i18n } = useTranslation('training');
  const locale = i18n.language === 'de' ? 'de-DE' : 'en-GB';
  const byDay = new Map<string, Session[]>();
  for (const s of sessions) {
    const key = dayKey(new Date(s.startsAt));
    byDay.set(key, [...(byDay.get(key) ?? []), s]);
  }
  // 2024-01-01 was a Monday.
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: 'short' }));
  const [today] = useState(() => dayKey(new Date()));

  return (
    <Box style={{ overflowX: 'auto' }}>
      <SimpleGrid cols={7} spacing={4} miw={640}>
        {weekdays.map((w) => <Text key={w} size="xs" fw={700} c="dimmed" ta="center">{w}</Text>)}
        {weeksOf(month).flat().map((day, i) => (
          <Paper key={day ? dayKey(day) : `empty-${i}`} withBorder={Boolean(day)} p={4} mih={88} radius="sm" bg={day ? undefined : 'transparent'} style={day && dayKey(day) === today ? { borderColor: 'var(--mantine-primary-color-filled)' } : undefined}>
            {day && (
              <Stack gap={2}>
                <Text size="xs" fw={700} c={dayKey(day) === today ? 'brand' : 'dimmed'}>{day.getDate()}</Text>
                {(byDay.get(dayKey(day)) ?? []).map((s) => (
                  <UnstyledButton key={s.id} onClick={() => onOpen(s)} title={s.title}>
                    <Text size="xs" lineClamp={2} c={s.status === 'closed' ? 'dimmed' : undefined}>
                      <Text span size="xs" fw={700}>{formatTime(s.startsAt, i18n.language)}</Text> {s.title}
                    </Text>
                  </UnstyledButton>
                ))}
              </Stack>
            )}
          </Paper>
        ))}
      </SimpleGrid>
    </Box>
  );
}

/** Monday of the week of the date (local time). */
export function mondayOf(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() + 6) % 7));
}

/** ISO week number of the date. */
export function weekNumber(date: Date): number {
  const thursday = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const firstThursday = new Date(thursday.getFullYear(), 0, 4);
  return 1 + Math.round(((thursday.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7);
}

/** One week (Monday to Sunday) with the sessions of each day, time from–to and title; a click opens the session. */
export function SessionWeek({ monday, sessions, onOpen }: { monday: Date; sessions: Session[]; onOpen: (s: Session) => void }) {
  const { i18n } = useTranslation('training');
  const locale = i18n.language === 'de' ? 'de-DE' : 'en-GB';
  const days = Array.from({ length: 7 }, (_, i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i));
  const [today] = useState(() => dayKey(new Date()));
  return (
    <Box style={{ overflowX: 'auto' }}>
      <SimpleGrid cols={7} spacing={4} miw={760}>
        {days.map((day) => (
          <Paper key={dayKey(day)} withBorder p={6} mih={220} radius="sm" style={dayKey(day) === today ? { borderColor: 'var(--mantine-primary-color-filled)' } : undefined}>
            <Stack gap={6}>
              <Text size="xs" fw={700} c={dayKey(day) === today ? 'brand' : 'dimmed'}>{day.toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: '2-digit' })}</Text>
              {sessions.filter((s) => dayKey(new Date(s.startsAt)) === dayKey(day)).map((s) => (
                <UnstyledButton key={s.id} onClick={() => onOpen(s)} title={s.title}>
                  <Text size="xs" fw={700}>{formatTime(s.startsAt, i18n.language)} – {formatTime(s.endsAt, i18n.language)}</Text>
                  <Text size="sm" lineClamp={3} c={s.status === 'closed' ? 'dimmed' : undefined}>{s.title}</Text>
                </UnstyledButton>
              ))}
            </Stack>
          </Paper>
        ))}
      </SimpleGrid>
    </Box>
  );
}
