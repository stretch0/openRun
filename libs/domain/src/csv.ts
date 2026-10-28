export type CsvValue = string | number | boolean | null | undefined;

/**
 * Formats rows as RFC 4180 CSV. Text that a spreadsheet would run as a
 * formula (starting with =, +, -, @, tab or CR) is prefixed with an
 * apostrophe, since activity names and notes are user input.
 */
export function toCsv(header: string[], rows: CsvValue[][]): string {
  return [header, ...rows].map((row) => row.map(cell).join(',')).join('\r\n');
}

function cell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
