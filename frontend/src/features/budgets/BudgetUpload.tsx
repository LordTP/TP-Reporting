import { useState, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Upload, Download, FileText, CheckCircle2, AlertTriangle } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { usePermissionStore } from '@/store/permissionStore'
import BudgetOverview from './components/BudgetOverview'

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

interface ParsedCSV {
  headers: string[]
  rows: string[][]
  dateRange: string
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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Budgets</h2>
          <p className="text-muted-foreground">
            {canManage ? 'Manage daily budget targets per location' : 'View budget targets per location'}
          </p>
        </div>
      </div>

      {/* Template Download Dialog */}
      {canManage && (
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

            {/* Preview — full width below the split when a file is selected */}
            {preview && preview.headers.length > 0 && (
              <div className="mt-6 pt-6 border-t border-border space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">Preview</p>
                  <p className="text-xs text-muted-foreground">
                    {preview.headers.length - 1} locations &middot; {preview.dateRange} &middot; {preview.rows.length} rows
                  </p>
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
          </CardContent>
        </Card>
      )}
    </div>
  )
}
