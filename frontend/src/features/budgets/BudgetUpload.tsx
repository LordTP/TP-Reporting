import { useState, useCallback, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Upload, Download, FileText, CheckCircle2, AlertTriangle, XCircle, Plus, ChevronDown, ChevronRight } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { usePermissionStore } from '@/store/permissionStore'
import BudgetOverview from './components/BudgetOverview'
import BudgetCalendar from './components/BudgetCalendar'
import BudgetDialog from './components/BudgetDialog'

const FULL_ACCESS_ROLES = ['admin', 'superadmin']

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

interface BudgetEntry {
  id: string
  location_id: string
  date: string
  budget_amount: number
  currency: string
  location_name?: string
}

interface CSVValidation {
  headers: string[]
  rows: string[][]
  dateRange: string
  matchedLocations: string[]
  unmatchedLocations: string[]
  invalidDateRows: number[]
  invalidAmountCells: Array<{ row: number; col: number }>
  duplicateDates: string[]
  totalBudgetEntries: number
  hasErrors: boolean
}

function isValidDate(str: string): boolean {
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const d = new Date(str + 'T00:00:00')
    return !isNaN(d.getTime())
  }
  // DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    const [day, month, year] = str.split('/')
    const d = new Date(`${year}-${month}-${day}T00:00:00`)
    return !isNaN(d.getTime())
  }
  return false
}

function validateCSV(text: string, knownLocations: LocationInfo[]): CSVValidation {
  const lines = text.trim().split(/\r?\n/)
  const empty: CSVValidation = {
    headers: [], rows: [], dateRange: '',
    matchedLocations: [], unmatchedLocations: [],
    invalidDateRows: [], invalidAmountCells: [],
    duplicateDates: [], totalBudgetEntries: 0, hasErrors: false,
  }
  if (lines.length < 2) return { ...empty, hasErrors: true }

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

  // Location matching (skip first column = "date")
  const locationNameLower = new Map(knownLocations.map(l => [l.name.trim().toLowerCase(), l.name]))
  const matchedLocations: string[] = []
  const unmatchedLocations: string[] = []
  for (let i = 1; i < headers.length; i++) {
    const match = locationNameLower.get(headers[i].trim().toLowerCase())
    if (match) matchedLocations.push(match)
    else unmatchedLocations.push(headers[i])
  }

  // Date validation
  const invalidDateRows: number[] = []
  const dateCounts = new Map<string, number>()
  for (let i = 0; i < rows.length; i++) {
    const dateStr = rows[i][0]
    if (!isValidDate(dateStr)) invalidDateRows.push(i)
    dateCounts.set(dateStr, (dateCounts.get(dateStr) || 0) + 1)
  }
  const duplicateDates = [...dateCounts.entries()].filter(([, c]) => c > 1).map(([d]) => d)

  // Amount validation
  const invalidAmountCells: Array<{ row: number; col: number }> = []
  let totalBudgetEntries = 0
  for (let ri = 0; ri < rows.length; ri++) {
    for (let ci = 1; ci < rows[ri].length; ci++) {
      const cell = rows[ri][ci]
      if (!cell || cell === '') continue // empty is fine
      const num = parseFloat(cell.replace(',', ''))
      if (isNaN(num) || num < 0) {
        invalidAmountCells.push({ row: ri, col: ci })
      } else {
        totalBudgetEntries++
      }
    }
  }

  const dateRange = dates.length > 0
    ? `${dates[0]} to ${dates[dates.length - 1]} (${dates.length} days)`
    : ''

  const hasErrors = invalidDateRows.length > 0 || invalidAmountCells.length > 0 || rows.length === 0

  return {
    headers, rows, dateRange,
    matchedLocations, unmatchedLocations,
    invalidDateRows, invalidAmountCells,
    duplicateDates, totalBudgetEntries, hasErrors,
  }
}

function getMonthRange(month: Date) {
  const year = month.getFullYear()
  const m = month.getMonth()
  const start = new Date(year, m, 1)
  const end = new Date(year, m + 1, 0)
  return {
    start_date: start.toISOString().split('T')[0],
    end_date: end.toISOString().split('T')[0],
  }
}

export default function BudgetUpload() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<CSVValidation | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [templateLocationId, setTemplateLocationId] = useState<string>('')
  const [templateYear, setTemplateYear] = useState<string>(new Date().getFullYear().toString())
  const fileInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  // Calendar state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editEntry, setEditEntry] = useState<BudgetEntry | null>(null)
  const [dialogDate, setDialogDate] = useState('')
  const [locationFilter, setLocationFilter] = useState('all')
  const [calMonth, setCalMonth] = useState(() => new Date())
  const [expandedCoverage, setExpandedCoverage] = useState<Set<string>>(new Set())

  const { user } = useAuthStore()
  const permHas = usePermissionStore((s) => s.hasPermission)
  const canManage = (!!user && FULL_ACCESS_ROLES.includes(user.role)) || permHas('feature:manage_budgets')

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

  // Build location name lookup
  const locationNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const loc of locations || []) {
      map.set(loc.id, loc.name)
    }
    return map
  }, [locations])

  // Fetch existing budgets (for CSV template pre-fill and BudgetOverview)
  const { data: existingBudgets, isLoading: budgetsLoading } = useQuery({
    queryKey: ['existing-budgets'],
    queryFn: () => apiClient.get<{ budgets: BudgetRecord[]; total: number }>('/budgets/?page_size=1000'),
    enabled: hasToken,
  })

  // Calendar: fetch budget entries for the viewed month
  const monthRange = getMonthRange(calMonth)
  const monthKey = `${calMonth.getFullYear()}-${calMonth.getMonth()}`
  const { data: calendarEntriesData, isLoading: calendarLoading } = useQuery({
    queryKey: ['budget-entries', locationFilter, monthKey],
    queryFn: () => {
      const params = new URLSearchParams()
      if (locationFilter !== 'all') params.set('location_ids', locationFilter)
      params.set('start_date', monthRange.start_date)
      params.set('end_date', monthRange.end_date)
      params.set('page_size', '1000')
      return apiClient.get<{ budgets: BudgetRecord[]; total: number }>(`/budgets/?${params.toString()}`)
    },
    enabled: hasToken,
  })

  // Enrich calendar entries with location names
  const calendarEntries: BudgetEntry[] = useMemo(() => {
    return (calendarEntriesData?.budgets || []).map((b) => ({
      id: b.id,
      location_id: b.location_id,
      date: b.date,
      budget_amount: b.budget_amount,
      currency: b.currency,
      location_name: locationNameMap.get(b.location_id) || undefined,
    }))
  }, [calendarEntriesData, locationNameMap])

  // Calendar: fetch budget coverage (days with sales but no budget)
  interface CoverageLocation {
    location_id: string
    location_name: string
    sales_days: number
    budget_days: number
    missing_days: string[]
  }
  interface CoverageResponse {
    locations: CoverageLocation[]
    start_date: string
    end_date: string
  }
  const { data: coverageData } = useQuery({
    queryKey: ['budget-coverage', monthKey],
    queryFn: () =>
      apiClient.get<CoverageResponse>(
        `/budgets/coverage?start_date=${monthRange.start_date}&end_date=${monthRange.end_date}`
      ),
    enabled: hasToken,
  })

  const coverageLocations = coverageData?.locations || []
  const locationsWithMissing = coverageLocations.filter(l => l.missing_days.length > 0)
  const totalMissingDays = locationsWithMissing.reduce((sum, l) => sum + l.missing_days.length, 0)

  // Calendar: delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/budgets/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-entries'] })
      queryClient.invalidateQueries({ queryKey: ['budget-coverage'] })
      queryClient.invalidateQueries({ queryKey: ['existing-budgets'] })
    },
  })

  // Calendar: day click handler
  const handleDayClick = (date: string, existingEntry?: BudgetEntry) => {
    if (existingEntry) {
      setEditEntry(existingEntry)
      setDialogDate('')
    } else {
      setEditEntry(null)
      setDialogDate(date)
    }
    setDialogOpen(true)
  }

  const handleAddBudget = () => {
    setEditEntry(null)
    setDialogDate(new Date().toISOString().split('T')[0])
    setDialogOpen(true)
  }

  // Build lookup of existing budget data: { "YYYY-MM-DD": { locationId: amountInPounds } }
  const budgetLookup = useMemo(() => {
    const lookup = new Map<string, Map<string, number>>()
    const budgets = existingBudgets?.budgets || []
    for (const b of budgets) {
      if (!lookup.has(b.date)) lookup.set(b.date, new Map())
      lookup.get(b.date)!.set(b.location_id, b.budget_amount / 100) // pence to pounds
    }
    return lookup
  }, [existingBudgets])

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: (csvFile: File) =>
      apiClient.postFile<UploadResult>('/budgets/upload-csv', csvFile, { currency: 'GBP' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['existing-budgets'] })
      queryClient.invalidateQueries({ queryKey: ['budget-entries'] })
      queryClient.invalidateQueries({ queryKey: ['budget-coverage'] })
    },
  })

  const handleFile = useCallback((selectedFile: File) => {
    setFile(selectedFile)
    uploadMutation.reset()

    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      setPreview(validateCSV(text, locations || []))
    }
    reader.readAsText(selectedFile)
  }, [uploadMutation, locations])

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
    const isAll = templateLocationId === '__all__'

    // Determine which locations to include
    const templateLocs = isAll
      ? [...locs].sort((a, b) => a.name.localeCompare(b.name))
      : [locs.find(l => l.id === templateLocationId)].filter(Boolean) as LocationInfo[]

    if (templateLocs.length === 0) return

    const header = ['date', ...templateLocs.map(l => l.name)].join(',')
    const rows: string[] = []
    const year = parseInt(templateYear)
    const startDate = new Date(year, 0, 1) // Jan 1
    const endDate = new Date(year, 11, 31) // Dec 31
    const totalDays = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1

    for (let i = 0; i < totalDays; i++) {
      const d = new Date(startDate)
      d.setDate(d.getDate() + i)
      const dateStr = d.toISOString().split('T')[0]
      const dayData = budgetLookup.get(dateStr)
      const amounts = templateLocs.map(loc => {
        const val = dayData?.get(loc.id)
        return val !== undefined ? val.toString() : ''
      })
      rows.push(`${dateStr},${amounts.join(',')}`)
    }

    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const fileName = isAll
      ? `budget_template_All_Locations_${templateYear}.csv`
      : `budget_template_${templateLocs[0].name.replace(/\s+/g, '_')}_${templateYear}.csv`
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
    setTemplateDialogOpen(false)
    setTemplateLocationId('')
    setTemplateYear(new Date().getFullYear().toString())
  }

  const result = uploadMutation.data

  // Build sets for quick cell-level error lookup in preview table
  const invalidAmountSet = useMemo(() => {
    if (!preview) return new Set<string>()
    return new Set(preview.invalidAmountCells.map(c => `${c.row}-${c.col}`))
  }, [preview])

  const invalidDateSet = useMemo(() => {
    if (!preview) return new Set<number>()
    return new Set(preview.invalidDateRows)
  }, [preview])

  const unmatchedColSet = useMemo(() => {
    if (!preview) return new Set<number>()
    const set = new Set<number>()
    const unmatchedLower = new Set(preview.unmatchedLocations.map(u => u.trim().toLowerCase()))
    preview.headers.forEach((h, i) => {
      if (i > 0 && unmatchedLower.has(h.trim().toLowerCase())) set.add(i)
    })
    return set
  }, [preview])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Budgets</h2>
          <p className="text-muted-foreground">
            {canManage ? 'Manage daily budget targets per location' : 'View budget targets per location'}
          </p>
        </div>
        {canManage && (
          <Button onClick={handleAddBudget}>
            <Plus className="mr-2 h-4 w-4" />
            Add Budget
          </Button>
        )}
      </div>

      {/* Location filter */}
      <div className="flex gap-4 flex-wrap items-center">
        <div className="w-full sm:w-56">
          <Select value={locationFilter} onValueChange={setLocationFilter}>
            <SelectTrigger>
              <SelectValue placeholder="All Locations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Locations</SelectItem>
              {(locations || []).map((loc) => (
                <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {calendarEntriesData && calendarEntriesData.total > 0 && (
          <span className="text-sm text-muted-foreground">
            {calendarEntriesData.total} {calendarEntriesData.total === 1 ? 'entry' : 'entries'} this month
          </span>
        )}
      </div>

      {/* Budget Coverage — missing days */}
      {coverageData && coverageLocations.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              {totalMissingDays > 0 ? (
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              )}
              <CardTitle className="text-base font-semibold">
                {totalMissingDays > 0
                  ? `${totalMissingDays} ${totalMissingDays === 1 ? 'day' : 'days'} missing budgets across ${locationsWithMissing.length} ${locationsWithMissing.length === 1 ? 'location' : 'locations'}`
                  : 'All locations have complete budget data this month'}
              </CardTitle>
            </div>
            <CardDescription>
              Days with sales but no budget entry &middot; {new Date(monthRange.start_date + 'T00:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
            </CardDescription>
          </CardHeader>
          {locationsWithMissing.length > 0 && (
            <CardContent className="pt-0 space-y-2">
              {locationsWithMissing.map((loc) => {
                const isExpanded = expandedCoverage.has(loc.location_id)
                return (
                  <div key={loc.location_id} className="border border-border rounded-lg overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/30 transition-colors text-left"
                      onClick={() => {
                        const next = new Set(expandedCoverage)
                        if (isExpanded) next.delete(loc.location_id)
                        else next.add(loc.location_id)
                        setExpandedCoverage(next)
                      }}
                    >
                      <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                        <span className="font-medium text-sm">{loc.location_name}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-muted-foreground">
                          {loc.budget_days}/{loc.sales_days} days covered
                        </span>
                        <span className="text-amber-600 font-medium">
                          {loc.missing_days.length} missing
                        </span>
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="px-3 pb-3 pt-1 border-t border-border/50">
                        <div className="flex flex-wrap gap-1.5">
                          {loc.missing_days.map((dateStr) => {
                            const d = new Date(dateStr + 'T00:00:00')
                            const label = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
                            return (
                              <button
                                key={dateStr}
                                onClick={() => {
                                  if (canManage) {
                                    setEditEntry(null)
                                    setDialogDate(dateStr)
                                    setLocationFilter(loc.location_id)
                                    setDialogOpen(true)
                                  }
                                }}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs border border-border bg-muted/30 transition-colors ${
                                  canManage ? 'hover:bg-amber-500/10 hover:border-amber-500/30 cursor-pointer' : ''
                                }`}
                              >
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                                {label}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </CardContent>
          )}
        </Card>
      )}

      {/* Budget Calendar */}
      <BudgetCalendar
        entries={calendarEntries}
        isLoading={calendarLoading}
        canManage={canManage}
        month={calMonth}
        onMonthChange={setCalMonth}
        onDayClick={handleDayClick}
        onDelete={(id) => deleteMutation.mutate(id)}
        locationFilter={locationFilter}
      />

      {/* Budget Dialog */}
      <BudgetDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        locations={locations || []}
        editEntry={editEntry}
        defaultDate={dialogDate}
        defaultLocationId={locationFilter !== 'all' ? locationFilter : undefined}
        onSuccess={() => {
          setDialogOpen(false)
          setEditEntry(null)
          setDialogDate('')
        }}
      />

      {/* Template Download Dialog */}
      {canManage && (
        <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Download Budget Template</DialogTitle>
              <DialogDescription>
                Select a location or download for all locations. Existing budget data will be pre-filled.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Location</label>
                <Select value={templateLocationId} onValueChange={setTemplateLocationId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a location" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Locations</SelectItem>
                    {(locations || []).map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Year</label>
                <Select value={templateYear} onValueChange={setTemplateYear}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 5 }, (_, i) => {
                      const y = new Date().getFullYear() - 3 + i
                      return <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                    })}
                  </SelectContent>
                </Select>
              </div>
              {templateLocationId && (
                <p className="text-sm text-muted-foreground">
                  {templateLocationId === '__all__'
                    ? `Template will include ${(locations || []).length} locations`
                    : 'Template will contain dates'
                  }
                  {' '}from{' '}
                  <span className="font-medium text-foreground">1 Jan {templateYear}</span>
                  {' '}to{' '}
                  <span className="font-medium text-foreground">31 Dec {templateYear}</span>.
                  {' '}Existing budgets will be pre-filled.
                </p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setTemplateDialogOpen(false); setTemplateLocationId(''); setTemplateYear(new Date().getFullYear().toString()) }}>
                Cancel
              </Button>
              <Button onClick={handleDownloadTemplate} disabled={!templateLocationId}>
                <Download className="mr-2 h-4 w-4" />
                Download
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Budget Overview — filters, monthly/daily views, export, delete */}
      <BudgetOverview
        budgets={existingBudgets?.budgets || []}
        locations={locations || []}
        isLoading={budgetsLoading}
        canManage={canManage}
        currency="GBP"
      />

      {/* Upload + CSV format — single card, split layout */}
      {canManage && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Upload Budget CSV</CardTitle>
              <Button variant="outline" size="sm" onClick={() => setTemplateDialogOpen(true)}>
                <Download className="mr-2 h-4 w-4" />
                Download Template
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col lg:flex-row lg:divide-x lg:divide-border gap-6 lg:gap-0">
              {/* Left: Upload zone */}
              <div className="lg:w-1/2 lg:pr-6">
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

                {/* Success result */}
                {result && (
                  <Alert className="mt-4">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <AlertDescription>
                      <p className="font-medium">{result.message}</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {result.rows_processed} rows &middot; {result.budgets_created} created &middot; {result.budgets_updated} updated
                      </p>
                      {result.unmatched_locations.length > 0 && (
                        <div className="mt-2 flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                          <p className="text-sm text-amber-700 dark:text-amber-300">
                            Unmatched: {result.unmatched_locations.join(', ')}
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
                      Upload failed: {(uploadMutation.error as any)?.response?.data?.detail || (uploadMutation.error as Error)?.message || 'Check the CSV format and try again.'}
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              {/* Right: CSV format reference */}
              <div className="lg:w-1/2 lg:pl-6">
                <p className="text-sm font-medium text-foreground mb-2">CSV Format</p>
                <div className="bg-muted/50 rounded-lg p-4 font-mono text-xs overflow-x-auto">
                  <p>date,{(locations || []).slice(0, 3).map(l => l.name).join(',') || 'Location A,Location B,Location C'}</p>
                  <p>2026-02-01,5000,4500,3000</p>
                  <p>2026-02-02,5200,4600,3100</p>
                  <p>2026-02-03,4800,4400,2900</p>
                </div>
                <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                  <li>&bull; First column: <span className="font-medium text-foreground">date</span> (YYYY-MM-DD)</li>
                  <li>&bull; Other columns: <span className="font-medium text-foreground">location names</span> (must match Square exactly)</li>
                  <li>&bull; Amounts in <span className="font-medium text-foreground">pounds</span> (e.g. 5000 = five thousand pounds)</li>
                  <li>&bull; Empty cells skipped &mdash; existing budgets updated</li>
                </ul>
              </div>
            </div>

            {/* Validation Preview — full width below the split when a file is selected */}
            {preview && preview.headers.length > 0 && (
              <div className="mt-6 pt-6 border-t border-border space-y-3">
                {/* Validation Summary */}
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Validation</p>
                  <div className="flex flex-wrap gap-2">
                    {preview.matchedLocations.length > 0 && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-green-50 border border-green-200 text-green-700 text-xs">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {preview.matchedLocations.length} location{preview.matchedLocations.length !== 1 ? 's' : ''} matched
                      </div>
                    )}
                    {preview.unmatchedLocations.length > 0 && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-700 text-xs">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {preview.unmatchedLocations.length} not recognised: {preview.unmatchedLocations.join(', ')}
                      </div>
                    )}
                    {preview.invalidDateRows.length > 0 && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-red-50 border border-red-200 text-red-700 text-xs">
                        <XCircle className="h-3.5 w-3.5" />
                        {preview.invalidDateRows.length} invalid date{preview.invalidDateRows.length !== 1 ? 's' : ''}
                      </div>
                    )}
                    {preview.invalidAmountCells.length > 0 && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-red-50 border border-red-200 text-red-700 text-xs">
                        <XCircle className="h-3.5 w-3.5" />
                        {preview.invalidAmountCells.length} invalid amount{preview.invalidAmountCells.length !== 1 ? 's' : ''}
                      </div>
                    )}
                    {preview.duplicateDates.length > 0 && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-700 text-xs">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Duplicate dates: {preview.duplicateDates.join(', ')}
                      </div>
                    )}
                    {!preview.hasErrors && preview.unmatchedLocations.length === 0 && preview.duplicateDates.length === 0 && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-green-50 border border-green-200 text-green-700 text-xs">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        All data valid &mdash; {preview.totalBudgetEntries} budget entries ready
                      </div>
                    )}
                  </div>
                </div>

                {/* Preview info bar */}
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">Preview</p>
                  <p className="text-xs text-muted-foreground">
                    {preview.matchedLocations.length} of {preview.headers.length - 1} locations &middot; {preview.dateRange} &middot; {preview.rows.length} rows
                  </p>
                </div>

                {/* Data table with validation highlights */}
                <div className="overflow-x-auto max-h-[300px] overflow-y-auto border border-border rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                      <tr>
                        {preview.headers.map((h, i) => (
                          <th
                            key={i}
                            className={`px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider whitespace-nowrap ${
                              i > 0 && unmatchedColSet.has(i)
                                ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                                : 'text-muted-foreground'
                            }`}
                          >
                            <span className="flex items-center gap-1">
                              {i > 0 && unmatchedColSet.has(i) && <AlertTriangle className="h-3 w-3" />}
                              {h}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {preview.rows.slice(0, 10).map((row, ri) => (
                        <tr key={ri} className="hover:bg-muted/30">
                          {row.map((cell, ci) => {
                            const isDateError = ci === 0 && invalidDateSet.has(ri)
                            const isAmountError = ci > 0 && invalidAmountSet.has(`${ri}-${ci}`)
                            const isUnmatchedCol = ci > 0 && unmatchedColSet.has(ci)
                            return (
                              <td
                                key={ci}
                                className={`px-3 py-1.5 whitespace-nowrap ${ci === 0 ? 'font-medium' : 'text-right'} ${
                                  isDateError || isAmountError
                                    ? 'text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-400'
                                    : isUnmatchedCol
                                    ? 'text-amber-600 bg-amber-50/50 dark:bg-amber-950/50 dark:text-amber-400'
                                    : ''
                                }`}
                              >
                                {ci > 0 && cell && !isAmountError
                                  ? parseFloat(cell.replace(',', '')).toLocaleString()
                                  : cell}
                              </td>
                            )
                          })}
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

                {/* Upload button with validation state */}
                <Button
                  onClick={handleUpload}
                  disabled={uploadMutation.isPending || preview.hasErrors || preview.matchedLocations.length === 0}
                  className="w-full"
                >
                  {uploadMutation.isPending
                    ? 'Uploading...'
                    : preview.hasErrors
                    ? 'Fix errors before uploading'
                    : preview.matchedLocations.length === 0
                    ? 'No matching locations found'
                    : preview.unmatchedLocations.length > 0
                    ? `Upload ${preview.totalBudgetEntries} entries (${preview.unmatchedLocations.length} column${preview.unmatchedLocations.length !== 1 ? 's' : ''} will be skipped)`
                    : `Upload ${preview.totalBudgetEntries} budget entries`
                  }
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
