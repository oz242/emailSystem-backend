import xlsx from 'xlsx';
import fs from 'fs';

/**
 * Parses an Excel (.xlsx/.xls) or CSV file.
 * Returns { headers: string[], rows: object[] }
 */
export function parseSheetFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error('File does not exist');
    }

    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new Error('Spreadsheet has no sheets');
    }

    const sheet = workbook.Sheets[sheetName];
    // Get headers first
    const headers = [];
    const range = xlsx.utils.decode_range(sheet['!ref'] || 'A1:A1');
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cell = sheet[xlsx.utils.encode_cell({ r: range.s.r, c: C })];
      let hdr = `UNKNOWN_${C}`;
      if (cell && cell.t) {
        hdr = xlsx.utils.format_cell(cell).trim();
      }
      headers.push(hdr);
    }

    // Convert all sheet rows to JSON objects
    const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });

    return {
      headers: headers.filter(h => h && !h.startsWith('UNKNOWN_')),
      rows: rows
    };
  } catch (error) {
    console.error('Error parsing sheet file:', error);
    throw new Error(`Failed to parse file: ${error.message}`);
  }
}
