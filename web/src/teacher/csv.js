// ============================================================
// CSV export of dashboard tables (built in the browser from data the page
// already has; no student names are in any of these tables).
// Spreadsheet apps execute cells that start with = + - @ ; those are
// neutralised, the same way the server's participation export does it.
// ============================================================

const cell = (v) => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const toCsv = (rows) => rows.map((r) => r.map(cell).join(',')).join('\n') + '\n';

export function downloadCsv(filename, rows) {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// numbers for spreadsheets: rates as 0-100 with one decimal, blanks for "no data"
export const pctCell = (x) => (x === null || x === undefined ? '' : Math.round(x * 1000) / 10);
export const secCell = (ms) => (ms === null || ms === undefined ? '' : Math.round(ms / 100) / 10);
