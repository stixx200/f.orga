import { type ReactNode, useRef } from 'react';
import { Button, Checkbox, Group, Text } from '@mantine/core';
import { IconFileSpreadsheet } from '@tabler/icons-react';
import { useTranslation } from '@forga/web-sdk';
import classes from './components.module.css';
import { EmptyState } from './EmptyState';
import { downloadXlsx } from './xlsx';

export interface Column<T> {
  key: string;
  header: string;
  /** Replaces the header text, e.g. a checkbox. `header` stays the phone label and the Excel title. */
  heading?: ReactNode;
  render?: (row: T) => ReactNode;
  width?: number | string;
  align?: 'left' | 'right' | 'center';
  /** `false` leaves the column out of the Excel export; columns without header (e.g. buttons) are left out anyway. */
  export?: boolean;
}

/** Check mark, or a filled square when only some rows are selected. */
function HeaderCheckIcon({ indeterminate, className }: { indeterminate: boolean | undefined; className: string }) {
  if (indeterminate) {
    return (
      <svg viewBox="0 0 10 10" className={className} aria-hidden>
        <rect width="10" height="10" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 10 7" fill="none" className={className} aria-hidden>
      <path d="M4 4.586L1.707 2.293A1 1 0 0 0 .293 3.707l3 3a1 1 0 0 0 1.414 0l5-5A1 1 0 0 0 8.293.293L4 4.586z" fill="currentColor" />
    </svg>
  );
}

/** Selects or clears every shown row. A partial selection shows a dark square inside the box. */
export function HeaderCheckbox({
  checked,
  indeterminate,
  label,
  disabled,
  onChange,
}: {
  checked: boolean;
  indeterminate?: boolean;
  label: string;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Checkbox
      className={classes.headerCheck}
      aria-label={label}
      checked={checked}
      indeterminate={indeterminate}
      disabled={disabled}
      icon={HeaderCheckIcon}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange(e.currentTarget.checked)}
    />
  );
}

const pick = <V,>(values: V[], included: boolean[]) => values.filter((_, i) => included[i]);
const cellText = (cell: HTMLTableCellElement) => cell.innerText.replace(/\n{2,}/g, '\n').trim();

/** Name for the export file: the title of the surrounding panel, else of the page. */
function exportTitle(table: HTMLElement): string {
  for (let node = table.parentElement; node; node = node.parentElement) {
    const heading = [...node.querySelectorAll('h1, h2')].findLast((h) => h.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING);
    if (heading?.textContent?.trim()) return heading.textContent.trim();
  }
  return 'Tabelle';
}

/**
 * Table in the brigade style: white-on-red header, alternating rows; on phones every row becomes a card
 * with a label per field. Rows can be clickable, selected or highlighted as primary report.
 * `scroll` keeps a long selection list inside the table, so the page around it stays short.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  selectedKey,
  highlight,
  empty,
  caption,
  exportName,
  exportable = true,
  scroll = false,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  selectedKey?: string | null;
  highlight?: (row: T) => boolean;
  empty?: ReactNode;
  caption?: string;
  /** File name of the Excel export; default: the title of the panel or page around the table. */
  exportName?: string;
  /** Shows the Excel export below the table (default); `false` e.g. in dashboards and forms. */
  exportable?: boolean;
  /** The row list scrolls inside the table and the header stays put. */
  scroll?: boolean;
}) {
  const { t } = useTranslation('common');
  const table = useRef<HTMLTableElement>(null);
  const included = columns.map((c) => c.export !== false && !!c.header.trim());
  // Exports the table as shown: the cell texts of all rows, without columns lacking a header.
  const exportTable = () => {
    const element = table.current;
    if (!element) return;
    const cells = [...element.tBodies[0].rows].map((tr) => pick([...tr.cells].map(cellText), included));
    downloadXlsx(exportName ?? caption ?? exportTitle(element), pick(columns.map((c) => c.header), included), cells);
  };
  if (!rows.length) {
    return (
      <div className={`${classes.tableWrap} ${scroll ? classes.tableScroll : ''}`}>
        {typeof empty === 'string' ? <Text size="sm" c="dimmed" p="md">{empty}</Text> : (empty ?? <EmptyState title={t('table.empty')} />)}
      </div>
    );
  }
  return (
    <>
    <div className={`${classes.tableWrap} ${scroll ? classes.tableScroll : ''}`}>
      <table ref={table} className={`${classes.table} ${classes.stack}`}>
        {caption && <caption className="visually-hidden">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={{ width: c.width }} className={[c.align ? classes[c.align] : '', c.heading ? classes.headerControl : ''].filter(Boolean).join(' ') || undefined}>
                {c.heading ?? c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = rowKey(row);
            const rowClasses = [
              onRowClick ? classes.clickable : '',
              selectedKey === key ? classes.selected : '',
              highlight?.(row) ? classes.primary : '',
            ].join(' ');
            return (
              <tr
                key={key}
                className={rowClasses}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={onRowClick ? (e) => (e.key === 'Enter' ? onRowClick(row) : undefined) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                aria-selected={selectedKey === key || undefined}
              >
                {columns.map((c) => (
                  <td key={c.key} data-label={c.header} className={c.align ? classes[c.align] : undefined}>
                    {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? '')}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    {exportable && included.some(Boolean) && (
      <Group justify="flex-end" mt={4}>
        <Button variant="subtle" size="compact-xs" leftSection={<IconFileSpreadsheet size={14} />} onClick={exportTable}>
          {t('table.export')}
        </Button>
      </Group>
    )}
    </>
  );
}
