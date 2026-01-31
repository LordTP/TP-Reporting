import { useState, useCallback, useRef, Fragment } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Upload, Download, FileText, CheckCircle2, AlertTriangle, Calendar } from 'lucide-react'

interface UploadResult {
  message: string
  rows_processed: number
  budgets_created: number
  budgets_updated: number
  unmatched_locations: string[]
}

interface LocationInfo {
  id: string
  name: string
}

interface BudgetRecord {
  id: string
  location_id: string
  date: string
  budget_amount: number
  currency: string
  budget_type: string
  notes: string | null
  created_by: string
  created_at: string
  updated_at: string
}

interface ParsedCSV {
  headers: string[]
  rows: string[][]
  dateRange: string
}

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount / 100)
}

function parseCSVLocally(text: string): ParsedCSV {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return { headers: [], rows: [], dateRange: '' }

  const headers = lines[0].split(',').map(h => h.trim())
  const rows: string[][] = []
  const dates: string[] = []

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',').map(c => c.trim())
    if (cells[0]) {
      rows.push(cells)
      dates.push(cells[0])
    }
  }

  const dateRange = dates.length > 0
    ? `${dates[0]} to ${dates[dates.length - 1]} (${dates.length} days)`
    : ''

  return { headers, rows, dateRange }
}

export default function BudgetUpload() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ParsedCSV | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [templateLocationId, setTemplateLocationId] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  const hasToken = !!localStorage.getItem('access_token')

  // Fetch locations via square accounts (same pattern that works on AnalyticsPage)
  const { data: locations } = useQuery({
    queryKey: ['all-locations-for-budgets'],
    queryFn: async () => {
      const accountsData = await apiClient.get<{ accounts: Array<{ id: string }> }>('/square/accounts')
      if (!accountsData.accounts || accountsData.accounts.length === 0) return []
      const locationPromises = accountsData.accounts.map((account) =>
        apiClient.get<{ locations: Array<{ id: string; name: string }> }>(`/square/accounts/${account.id}/locations`)
      )
      const locationResults = await Promise.all(locationPromises)
      return locationResults.flatMap((result) =>
        (result.locations || []).map((loc) => ({ id: loc.id, name: loc.name }))
      ) as LocationInfo[]
    },
    enabled: hasToken,
  })

  // Fetch existing budgets
  const { data: existingBudgets, isLoading: budgetsLoading } = useQuery({
    queryKey: ['existing-budgets'],
    queryFn: () => apiClient.get<{ budgets: BudgetRecord[]; total: number }>('/budgets/?page_size=1000'),
    enabled: hasToken,
  })

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: (csvFile: File) =>
      apiClient.postFile<UploadResult>('/budgets/upload-csv', csvFile, { currency: 'GBP' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['existing-budgets'] })
    },
  })

  const handleFile = useCallback((selectedFile: File) => {
    setFile(selectedFile)
    uploadMutation.reset()

    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      setPreview(parseCSVLocally(text))
    }
    reader.readAsText(selectedFile)
  }, [uploadMutation])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped?.name.endsWith('.csv')) handleFile(dropped)
  }, [handleFile])

  const handleUpload = () => {
    if (file) uploadMutation.mutate(file)
  }

  const handleDownloadTemplate = () => {
    const locs = locations || []
    const selectedLoc = locs.find(l => l.id === templateLocationId)
    if (!selectedLoc) return

    const header = ['date', selectedLoc.name].join(',')
    const rows: string[] = []
    const today = new Date()
    // Generate 365 days from today
    for (let i = 0; i < 365; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() + i)
      const dateStr = d.toISOString().split('T')[0]
      rows.push(`${dateStr},`)
    }
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `budget_template_${selectedLoc.name.replace(/\s+/g, '_')}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setTemplateDialogOpen(false)
    setTemplateLocationId('')
  }

  const result = uploadMutation.data

  // Build grid data for existing budgets: pivot by date (rows) × location (columns)
  const budgetRecords = existingBudgets?.budgets || []
  const locationMap = new Map<string, string>()
  if (locations) {
    for (const loc of locations) {
      locationMap.set(loc.id, loc.name)
    }
  }

  // Group budgets by date → location_id → amount
  const budgetGrid = new Map<string, Map<string, number>>()
  const locationIdsInBudgets = new Set<string>()
  for (const b of budgetRecords) {
    locationIdsInBudgets.add(b.location_id)
    if (!budgetGrid.has(b.date)) budgetGrid.set(b.date, new Map())
    budgetGrid.get(b.date)!.set(b.location_id, b.budget_amount)
  }

  // Sort dates ascending — closest to today first
  const allDates = Array.from(budgetGrid.keys()).sort((a, b) => a.localeCompare(b))
  const gridLocationIds = Array.from(locationIdsInBudgets)
  const gridLocationNames = gridLocationIds.map(id => locationMap.get(id) || 'Unknown')

  // Summary: total budget per location
  const locationTotals = new Map<string, number>()
  for (const [, dateMap] of budgetGrid) {
    for (const [locId, amount] of dateMap) {
      locationTotals.set(locId, (locationTotals.get(locId) || 0) + amount)
    }
  }

  // Budgets are always in GBP regardless of location currency
  const currency = 'GBP'

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Budgets</h2>
          <p className="text-muted-foreground">
            Upload daily budgets per location via CSV
          </p>
        </div>
        <Button variant="outline" onClick={() => setTemplateDialogOpen(true)}>
          <Download className="mr-2 h-4 w-4" />
          Download Template
        </Button>
      </div>

      {/* Template Download Dialog */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Download Budget Template</DialogTitle>
            <DialogDescription>
              Select a location to generate a CSV template with 365 days of dates starting from today.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={templateLocationId} onValueChange={setTemplateLocationId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a location" />
              </SelectTrigger>
              <SelectContent>
                {(locations || []).map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {templateLocationId && (
              <p className="text-sm text-muted-foreground mt-3">
                Template will contain dates from{' '}
                <span className="font-medium text-foreground">{new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                {' '}to{' '}
                <span className="font-medium text-foreground">{(() => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) })()}</span>
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setTemplateDialogOpen(false); setTemplateLocationId('') }}>
              Cancel
            </Button>
            <Button onClick={handleDownloadTemplate} disabled={!templateLocationId}>
              <Download className="mr-2 h-4 w-4" />
              Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload zone */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Upload Budget CSV</CardTitle>
          <CardDescription>
            Grid format: first column is date (YYYY-MM-DD), remaining columns are location names with daily amounts in pounds.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              dragOver
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50 hover:bg-muted/30'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
              }}
            />
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <FileText className="h-8 w-8 text-primary" />
                <div className="text-left">
                  <p className="text-sm font-medium text-foreground">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
              </div>
            ) : (
              <div>
                <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  Drag and drop a CSV file here, or click to select
                </p>
              </div>
            )}
          </div>

          {/* Preview */}
          {preview && preview.headers.length > 0 && (
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-4 text-sm">
                <span className="text-muted-foreground">Locations detected:</span>
                <span className="font-medium">{preview.headers.length - 1}</span>
                <span className="text-muted-foreground">Date range:</span>
                <span className="font-medium">{preview.dateRange}</span>
                <span className="text-muted-foreground">Rows:</span>
                <span className="font-medium">{preview.rows.length}</span>
              </div>

              <div className="overflow-x-auto max-h-[300px] overflow-y-auto border border-border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                    <tr>
                      {preview.headers.map((h, i) => (
                        <th key={i} className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {preview.rows.slice(0, 10).map((row, ri) => (
                      <tr key={ri} className="hover:bg-muted/30">
                        {row.map((cell, ci) => (
                          <td key={ci} className={`px-3 py-1.5 whitespace-nowrap ${ci === 0 ? 'font-medium' : 'text-right'}`}>
                            {ci > 0 && cell ? `${parseFloat(cell.replace(',', '')).toLocaleString()}` : cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.rows.length > 10 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    Showing first 10 of {preview.rows.length} rows
                  </p>
                )}
              </div>

              <Button
                onClick={handleUpload}
                disabled={uploadMutation.isPending}
                className="w-full"
              >
                {uploadMutation.isPending ? 'Uploading...' : `Upload ${preview.rows.length} days of budgets`}
              </Button>
            </div>
          )}

          {/* Success result */}
          {result && (
            <Alert className="mt-4">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription>
                <p className="font-medium">{result.message}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {result.rows_processed} rows processed &middot; {result.budgets_created} created &middot; {result.budgets_updated} updated
                </p>
                {result.unmatched_locations.length > 0 && (
                  <div className="mt-2 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                    <p className="text-sm text-amber-700 dark:text-amber-300">
                      Unmatched locations (not found in your account): {result.unmatched_locations.join(', ')}
                    </p>
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Error */}
          {uploadMutation.isError && (
            <Alert variant="destructive" className="mt-4">
              <AlertDescription>
                Upload failed: {(uploadMutation.error as any)?.response?.data?.detail || (uploadMutation.error as Error)?.message || 'Please check the CSV format and try again.'}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Existing Budgets Grid */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold">Budget Overview</CardTitle>
              <CardDescription>
                {allDates.length > 0
                  ? `${allDates.length} days across ${gridLocationIds.length} ${gridLocationIds.length === 1 ? 'location' : 'locations'}`
                  : 'No budgets uploaded yet'}
              </CardDescription>
            </div>
            {allDates.length > 0 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                {new Date(allDates[0]).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                {' \u2013 '}
                {new Date(allDates[allDates.length - 1]).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </div>
            )}
          </div>

          {/* Location summary cards */}
          {gridLocationIds.length > 0 && (
            <div className={`grid gap-3 mt-4 ${gridLocationIds.length === 1 ? 'grid-cols-1' : gridLocationIds.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
              {gridLocationIds.map((locId, i) => {
                const total = locationTotals.get(locId) || 0
                const avgDaily = allDates.length > 0 ? Math.round(total / allDates.length) : 0
                return (
                  <div key={locId} className="rounded-lg border border-border bg-muted/30 p-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{gridLocationNames[i]}</p>
                    <p className="text-lg font-bold text-foreground mt-1">{formatCurrency(total, currency)}</p>
                    <p className="text-xs text-muted-foreground">{formatCurrency(avgDaily, currency)}/day avg</p>
                  </div>
                )
              })}
              {gridLocationIds.length > 1 && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <p className="text-xs font-medium text-primary uppercase tracking-wider">All Locations</p>
                  <p className="text-lg font-bold text-foreground mt-1">
                    {formatCurrency(gridLocationIds.reduce((sum, locId) => sum + (locationTotals.get(locId) || 0), 0), currency)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(allDates.length > 0 ? Math.round(gridLocationIds.reduce((sum, locId) => sum + (locationTotals.get(locId) || 0), 0) / allDates.length) : 0, currency)}/day avg
                  </p>
                </div>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {budgetsLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading budgets...</p>
          ) : allDates.length > 0 ? (
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b-2 border-border bg-card">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider sticky left-0 bg-card z-20 min-w-[160px]">
                      Date
                    </th>
                    {gridLocationIds.map((locId, i) => (
                      <th key={locId} className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap min-w-[120px]">
                        {gridLocationNames[i]}
                      </th>
                    ))}
                    {gridLocationIds.length > 1 && (
                      <th className="px-4 py-3 text-right text-xs font-semibold text-primary uppercase tracking-wider min-w-[120px]">
                        Day Total
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const todayStr = new Date().toISOString().split('T')[0]
                    let lastMonth = ''
                    return allDates.map((dateStr) => {
                      const dateObj = new Date(dateStr)
                      const dateMap = budgetGrid.get(dateStr)!
                      const dayOfWeek = dateObj.getDay()
                      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
                      const isToday = dateStr === todayStr
                      const monthKey = `${dateObj.getFullYear()}-${dateObj.getMonth()}`
                      const showMonthHeader = monthKey !== lastMonth
                      lastMonth = monthKey

                      return (
                        <Fragment key={dateStr}>
                          {showMonthHeader && (
                            <tr>
                              <td
                                colSpan={gridLocationIds.length + (gridLocationIds.length > 1 ? 2 : 1)}
                                className="px-4 py-2 text-xs font-bold text-primary uppercase tracking-widest bg-primary/5 border-y border-primary/20 sticky left-0"
                              >
                                {dateObj.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
                              </td>
                            </tr>
                          )}
                          <tr
                            className={`
                              border-b border-border/50 transition-colors
                              ${isToday ? 'bg-primary/10 font-semibold' : isWeekend ? 'bg-muted/20' : 'hover:bg-muted/30'}
                            `}
                          >
                            <td className={`px-4 py-2 whitespace-nowrap sticky left-0 z-10 ${isToday ? 'bg-primary/10' : isWeekend ? 'bg-muted/20' : 'bg-card'}`}>
                              <div className="flex items-center gap-2">
                                <span className={`inline-block w-8 text-xs ${isWeekend ? 'text-muted-foreground' : 'text-foreground/60'}`}>
                                  {dateObj.toLocaleDateString('en-GB', { weekday: 'short' })}
                                </span>
                                <span className={`font-medium ${isToday ? 'text-primary' : 'text-foreground'}`}>
                                  {dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                </span>
                                {isToday && (
                                  <span className="text-[10px] font-bold text-primary bg-primary/20 px-1.5 py-0.5 rounded-full">TODAY</span>
                                )}
                              </div>
                            </td>
                            {gridLocationIds.map((locId) => {
                              const amount = dateMap.get(locId)
                              return (
                                <td key={locId} className="px-4 py-2 text-right whitespace-nowrap tabular-nums">
                                  {amount ? (
                                    <span className="text-foreground">{formatCurrency(amount, currency)}</span>
                                  ) : (
                                    <span className="text-muted-foreground/30">&mdash;</span>
                                  )}
                                </td>
                              )
                            })}
                            {gridLocationIds.length > 1 && (
                              <td className="px-4 py-2 text-right font-semibold text-foreground whitespace-nowrap tabular-nums">
                                {formatCurrency(gridLocationIds.reduce((sum, locId) => sum + (dateMap.get(locId) || 0), 0), currency)}
                              </td>
                            )}
                          </tr>
                        </Fragment>
                      )
                    })
                  })()}
                </tbody>
                <tfoot className="sticky bottom-0 z-10">
                  <tr className="border-t-2 border-border bg-card">
                    <td className="px-4 py-3 text-sm font-bold text-foreground sticky left-0 bg-card z-20">
                      Total ({allDates.length} days)
                    </td>
                    {gridLocationIds.map((locId) => (
                      <td key={locId} className="px-4 py-3 text-sm text-right font-bold text-foreground whitespace-nowrap tabular-nums">
                        {formatCurrency(locationTotals.get(locId) || 0, currency)}
                      </td>
                    ))}
                    {gridLocationIds.length > 1 && (
                      <td className="px-4 py-3 text-sm text-right font-bold text-primary whitespace-nowrap tabular-nums">
                        {formatCurrency(
                          gridLocationIds.reduce((sum, locId) => sum + (locationTotals.get(locId) || 0), 0),
                          currency
                        )}
                      </td>
                    )}
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No budgets have been uploaded yet. Use the upload section above to get started.
            </p>
          )}
        </CardContent>
      </Card>

      {/* CSV format help */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">CSV Format</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-muted/50 rounded-lg p-4 font-mono text-xs overflow-x-auto">
            <p>date,{(locations || []).slice(0, 3).map(l => l.name).join(',') || 'Location A,Location B,Location C'}</p>
            <p>2026-02-01,5000,4500,3000</p>
            <p>2026-02-02,5200,4600,3100</p>
            <p>2026-02-03,4800,4400,2900</p>
          </div>
          <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
            <li>&bull; First column must be <span className="font-medium text-foreground">date</span> in YYYY-MM-DD format</li>
            <li>&bull; Remaining columns are <span className="font-medium text-foreground">location names</span> (must match your Square locations exactly)</li>
            <li>&bull; Amounts are in <span className="font-medium text-foreground">pounds</span> (e.g. 5000 = five thousand pounds)</li>
            <li>&bull; Empty cells are skipped &mdash; existing budgets for the same date/location are updated</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
