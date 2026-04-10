/**
 * Spreadsheet read helpers for browser imports.
 * Uses `read-excel-file` (MIT, fflate) instead of exceljs/jszip for production license clarity (REP-005).
 */

import readXlsxFile, { parseExcelDate as parseExcelDateFromLib } from 'read-excel-file'

export type SpreadsheetCell = string | number | boolean | Date | null | undefined
export type SpreadsheetRow = SpreadsheetCell[]

export { parseExcelDateFromLib as parseExcelDate }

function parseCsvToRows(text: string): SpreadsheetRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0)
  return lines.map((line) => {
    const cells: string[] = []
    let cur = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === '"') {
        inQuotes = !inQuotes
        continue
      }
      if (c === ',' && !inQuotes) {
        cells.push(cur)
        cur = ''
        continue
      }
      cur += c
    }
    cells.push(cur)
    return cells.map((c) => c.trim()) as SpreadsheetCell[]
  })
}

/**
 * First sheet as a row matrix (same shape as the former ExcelJS + worksheetToJson(..., { header: 1 }) path).
 */
export async function readSpreadsheetRowsMatrix(file: File): Promise<SpreadsheetRow[]> {
  const lower = file.name.toLowerCase()
  if (lower.endsWith('.csv') || file.type === 'text/csv') {
    const text = await file.text()
    return parseCsvToRows(text)
  }
  if (lower.endsWith('.xls') && !lower.endsWith('.xlsx')) {
    throw new Error(
      'Legacy .xls binary workbooks are not supported. Save the file as .xlsx in Excel, or export as CSV.'
    )
  }
  const buffer = await file.arrayBuffer()
  return readXlsxFile(buffer)
}
