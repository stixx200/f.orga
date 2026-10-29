import type { Language, LocalizedText } from '@forga/core-contracts';

/** Formats an ISO date for letters and notices: `21.10.2026` in German, `2026-10-21` in English. */
export function formatDay(date: string | null | undefined, language: Language): string {
  if (!date) return '';
  const [y, m, d] = date.slice(0, 10).split('-');
  return language === 'de' ? `${d}.${m}.${y}` : `${y}-${m}-${d}`;
}

/** The non-empty parts, one per line. */
export const lines = (...parts: (string | null | undefined | false)[]): string => parts.filter((p): p is string => Boolean(p && p.trim())).join('\n');

/**
 * A text block as pdfmake content: paragraphs separated by blank lines, lines starting with `- ` as bullet list,
 * other line breaks kept.
 */
export function pdfParagraphs(text: string): unknown[] {
  const result: unknown[] = [];
  for (const paragraph of text.split(/\n\s*\n/)) {
    const rows = paragraph.split('\n');
    const bullets = rows.filter((r) => r.startsWith('- '));
    if (bullets.length && bullets.length === rows.filter((r) => r.trim()).length) {
      result.push({ ul: bullets.map((b) => b.slice(2)), margin: [0, 0, 0, 6] });
    } else if (bullets.length) {
      for (const row of rows.filter((r) => r.trim())) result.push(row.startsWith('- ') ? { ul: [row.slice(2)] } : { text: row });
      result.push({ text: '', margin: [0, 0, 0, 6] });
    } else if (paragraph.trim()) {
      result.push({ text: paragraph.trim(), margin: [0, 0, 0, 6] });
    }
  }
  return result;
}

/** Labels of the kinds of requests in letters. */
export const KIND_LABELS: Record<string, LocalizedText> = {
  access: { de: 'Auskunft', en: 'Access' },
  rectification: { de: 'Berichtigung', en: 'Rectification' },
  erasure: { de: 'Löschung', en: 'Erasure' },
  restriction: { de: 'Einschränkung der Verarbeitung', en: 'Restriction of processing' },
  objection: { de: 'Widerspruch', en: 'Objection' },
  'consent-withdrawal': { de: 'Widerruf einer Einwilligung', en: 'Withdrawal of consent' },
};
