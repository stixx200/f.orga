import type ExcelJS from 'exceljs';

/**
 * Adds a sheet in the brigade style to an Excel workbook: title, subtitle, white-on-red header,
 * alternating rows, numbers with two decimals.
 */
export function addStyledSheet(workbook: ExcelJS.Workbook, name: string, title: string, subtitle: string, headers: string[], rows: (string | number | null)[][], widths: number[]): ExcelJS.Worksheet {
  const ws = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 3 }], pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  ws.addRow([title]).font = { name: 'Arial', bold: true, size: 14, color: { argb: 'FF8C1D18' } };
  ws.addRow([subtitle]).font = { name: 'Arial', size: 10, color: { argb: 'FF595959' } };
  const header = ws.addRow(headers.map((h) => h.toUpperCase()));
  header.eachCell((cell) => {
    cell.font = { name: 'Arial', bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8C1D18' } };
  });
  rows.forEach((values, index) => {
    const row = ws.addRow(values);
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: 'Arial', size: 10, color: { argb: 'FF222222' } };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFE0D2D0' } } };
      if (typeof cell.value === 'number') cell.numFmt = '#,##0.00';
      if (index % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFBF7F6' } };
    });
  });
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  return ws;
}
