import { strToU8, zipSync } from 'fflate';

/** Cell value: text, or a number when the text is one ("12", "1.234,5"; not "0151 …" or "2026-013"). */
function cell(text: string): { number: number } | { text: string } {
  const value = text.trim();
  if (/^-?(0|[1-9]\d{0,2}(\.\d{3})*|[1-9]\d*)(,\d+)?$/.test(value)) return { number: Number(value.replaceAll('.', '').replace(',', '.')) };
  return { text: value };
}

/** Control characters other than tab, line feed and carriage return are not allowed in XML. */
const allowed = (char: string) => char.charCodeAt(0) >= 32 || char === '\t' || char === '\n' || char === '\r';

const escape = (text: string) =>
  [...text]
    .filter(allowed)
    .join('')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

/** Length of the longest line of a cell. */
const longest = (text: string) => Math.max(...text.split('\n').map((line) => line.length));

/** Column letters: 0 → A, 26 → AA. */
function column(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

/** A workbook with one sheet: bold header row (frozen, with filter), then the rows. */
export function toXlsx(sheetName: string, headers: string[], rows: string[][]): Uint8Array {
  const all = [headers, ...rows];
  const xmlRow = (values: string[], r: number) =>
    `<row r="${r + 1}">${values
      .map((v, c) => {
        const ref = `${column(c)}${r + 1}`;
        const style = r === 0 ? ' s="1"' : '';
        const content = r === 0 ? { text: v } : cell(v);
        return 'number' in content
          ? `<c r="${ref}"${style}><v>${content.number}</v></c>`
          : `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escape(content.text)}</t></is></c>`;
      })
      .join('')}</row>`;
  const widths = headers.map((_, c) => Math.min(60, Math.max(8, ...all.map((r) => longest(r[c] ?? ''))) + 2));
  const last = `${column(Math.max(0, headers.length - 1))}${all.length}`;
  const sheet =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    `<cols>${widths.map((w, c) => `<col min="${c + 1}" max="${c + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` +
    `<sheetData>${all.map(xmlRow).join('')}</sheetData>` +
    `<autoFilter ref="A1:${last}"/>` +
    '</worksheet>';
  const name = escape(sheetName.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Tabelle');
  return zipSync({
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ),
    'xl/workbook.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        `<sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets>` +
        `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${name.replaceAll("'", "''")}'!$A$1:$${column(Math.max(0, headers.length - 1))}$${all.length}</definedName></definedNames></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    ),
    'xl/worksheets/sheet1.xml': strToU8(sheet),
    'xl/styles.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
        '</styleSheet>',
    ),
  });
}

/** Offers the workbook as a download, e.g. `Personen_2026-10-25.xlsx`. */
export function downloadXlsx(name: string, headers: string[], rows: string[][]): void {
  const data = toXlsx(name, headers, rows);
  const blob = new Blob([data as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Tabelle'}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
