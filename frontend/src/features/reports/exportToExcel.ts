import * as XLSX from 'xlsx'

/**
 * Export tabular data to an Excel file and trigger browser download.
 * Amounts in pence are converted to pounds (÷100) and formatted as currency.
 */
export function exportToExcel(
  sheets: Array<{
    name: string
    headers: string[]
    rows: (string | number)[][]
  }>,
  filename: string,
) {
  const wb = XLSX.utils.book_new()

  for (const sheet of sheets) {
    const data = [sheet.headers, ...sheet.rows]
    const ws = XLSX.utils.aoa_to_sheet(data)

    // Auto-size columns based on content
    const colWidths = sheet.headers.map((h, i) => {
      const maxLen = Math.max(
        h.length,
        ...sheet.rows.map(r => String(r[i] ?? '').length),
      )
      return { wch: Math.min(maxLen + 2, 30) }
    })
    ws['!cols'] = colWidths

    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31)) // Excel sheet name max 31 chars
  }

  XLSX.writeFile(wb, `${filename}.xlsx`)
}

/** Convert pence to pounds as a number (for Excel, not display) */
export function penceToPounds(pence: number): number {
  return Math.round(pence) / 100
}

/** Format a date string to DD/MM/YYYY for Excel */
export function formatDateForExcel(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB')
}
