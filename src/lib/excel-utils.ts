import ExcelJS from 'exceljs'

/**
 * ExcelJS utilities - replacement for xlsx library
 * Migrated from xlsx for security reasons (no upstream fix available)
 */

export async function createWorkbook(): Promise<ExcelJS.Workbook> {
  return new ExcelJS.Workbook()
}

export async function addSheetFromArray(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  data: (string | number | null | undefined)[][],
  options?: {
    columnWidths?: number[]
    headerStyle?: boolean
  }
): Promise<ExcelJS.Worksheet> {
  const worksheet = workbook.addWorksheet(sheetName)
  
  data.forEach((row, index) => {
    const excelRow = worksheet.addRow(row)
    
    if (index === 0 && options?.headerStyle !== false) {
      excelRow.eachCell((cell) => {
        cell.font = { bold: true }
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE0E0E0' }
        }
      })
    }
  })
  
  if (options?.columnWidths) {
    options.columnWidths.forEach((width, i) => {
      worksheet.getColumn(i + 1).width = width
    })
  } else {
    worksheet.columns.forEach((column) => {
      let maxLength = 10
      column.eachCell?.({ includeEmpty: true }, (cell) => {
        const cellLength = cell.value?.toString().length || 0
        if (cellLength > maxLength) maxLength = Math.min(cellLength, 50)
      })
      column.width = maxLength + 2
    })
  }
  
  return worksheet
}

export async function addSheetFromObjects(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  data: Record<string, unknown>[],
  options?: {
    columns?: { header: string; key: string; width?: number }[]
  }
): Promise<ExcelJS.Worksheet> {
  const worksheet = workbook.addWorksheet(sheetName)
  
  if (data.length === 0) return worksheet
  
  // Get columns from first object or options
  const keys = options?.columns?.map(c => c.key) || Object.keys(data[0])
  const headers = options?.columns?.map(c => c.header) || keys
  
  // Set columns
  worksheet.columns = keys.map((key, i) => ({
    header: headers[i],
    key,
    width: options?.columns?.[i]?.width || 15
  }))
  
  // Style header row
  worksheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true }
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    }
  })
  
  // Add data rows
  data.forEach(row => worksheet.addRow(row))
  
  return worksheet
}

export async function writeWorkbookToFile(
  workbook: ExcelJS.Workbook,
  filename: string
): Promise<void> {
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { 
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export async function readWorkbookFromBuffer(
  buffer: ArrayBuffer
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  return workbook
}

export async function readWorkbookFromFile(
  file: File
): Promise<ExcelJS.Workbook> {
  const buffer = await file.arrayBuffer()
  return readWorkbookFromBuffer(buffer)
}

export function worksheetToJson<T = Record<string, unknown>>(
  worksheet: ExcelJS.Worksheet,
  options?: { header?: 1 | 'A'; defval?: unknown }
): T[] {
  const data: T[] = []
  const rows: unknown[][] = []
  
  worksheet.eachRow((row, rowNumber) => {
    const rowData: unknown[] = []
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      let value = cell.value
      if (value === null || value === undefined) {
        value = options?.defval ?? null
      } else if (typeof value === 'object' && 'result' in (value as object)) {
        // Handle formulas
        value = (value as { result: unknown }).result
      } else if (typeof value === 'object' && 'text' in (value as object)) {
        // Handle rich text
        value = (value as { text: string }).text
      }
      rowData[colNumber - 1] = value
    })
    rows.push(rowData)
  })
  
  if (options?.header === 1) {
    // Return array of arrays
    return rows as unknown as T[]
  }
  
  // Return array of objects with first row as headers
  if (rows.length < 2) return []
  
  const headers = rows[0].map(h => String(h || ''))
  for (let i = 1; i < rows.length; i++) {
    const obj: Record<string, unknown> = {}
    headers.forEach((header, j) => {
      obj[header] = rows[i][j] ?? options?.defval ?? ''
    })
    data.push(obj as T)
  }
  
  return data
}

// Date parsing utility (replaces XLSX.SSF.parse_date_code)
export function parseExcelDate(serial: number): Date {
  // Excel dates are number of days since Dec 30, 1899
  const utcDays = Math.floor(serial - 25569)
  const utcValue = utcDays * 86400
  const dateInfo = new Date(utcValue * 1000)
  
  const fractionalDay = serial - Math.floor(serial)
  const totalSeconds = Math.floor(86400 * fractionalDay)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  
  dateInfo.setHours(hours, minutes, seconds, 0)
  return dateInfo
}
