import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import KPICard from '@/components/charts/KPICard'
import ExportButton from '@/components/ExportButton'
import { exportToExcel, penceToPounds, formatDateForExcel } from '@/features/reports/exportToExcel'
import { DollarSign, TrendingUp, Calendar, MapPin, Trash2 } from 'lucide-react'

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

interface LocationInfo {
  id: string
  name: string
}

interface BudgetOverviewProps {
  budgets: BudgetRecord[]
  locations: LocationInfo[]
  isLoading: boolean
  canManage: boolean
  currency: string
}

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount / 100)
}

type ViewMode = 'monthly' | 'daily'

export default function BudgetOverview({ budgets, locations, isLoading, canManage, currency }: BudgetOverviewProps) {
  const queryClient = useQueryClient()

  // Default to current month
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [selectedLocationId, setSelectedLocationId] = useState<string>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('monthly')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Location map
  const locationMap = new Map(locations.map(l => [l.id, l.name]))

  // Available months from budget data + current month
  const currentMonthKey = (() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })()
  const monthsFromData = new Set(budgets.map(b => b.date.substring(0, 7)))
  monthsFromData.add(currentMonthKey)
  const availableMonths = Array.from(monthsFromData).sort().reverse()

  // Locations that have budget data
  const locationIdsWithBudgets = new Set(budgets.map(b => b.location_id))
  const locationsWithBudgets = locations.filter(l => locationIdsWithBudgets.has(l.id))

  // Filter budgets by selected month + location
  const [filterYear, filterMonth] = selectedMonth.split('-').map(Number)
  const filteredBudgets = budgets.filter(b => {
    const d = new Date(b.date)
    const matchesMonth = d.getFullYear() === filterYear && d.getMonth() + 1 === filterMonth
    const matchesLocation = selectedLocationId === 'all' || b.location_id === selectedLocationId
    return matchesMonth && matchesLocation
  })

  // Monthly aggregates per location
  const locationAggregates = new Map<string, { total: number; days: number }>()
  for (const b of filteredBudgets) {
    const agg = locationAggregates.get(b.location_id) || { total: 0, days: 0 }
    agg.total += b.budget_amount
    agg.days += 1
    locationAggregates.set(b.location_id, agg)
  }

  // KPI computations
  const grandTotal = filteredBudgets.reduce((sum, b) => sum + b.budget_amount, 0)
  const totalDays = new Set(filteredBudgets.map(b => b.date)).size
  const dailyAverage = totalDays > 0 ? Math.round(grandTotal / totalDays) : 0
  const locationCount = locationAggregates.size
  const daysInMonth = new Date(filterYear, filterMonth, 0).getDate()

  const monthLabel = new Date(filterYear, filterMonth - 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  // For daily detail view: pivot grid
  const budgetGrid = new Map<string, Map<string, number>>()
  const gridLocationIds: string[] = []
  const gridLocationIdSet = new Set<string>()
  for (const b of filteredBudgets) {
    if (!gridLocationIdSet.has(b.location_id)) {
      gridLocationIdSet.add(b.location_id)
      gridLocationIds.push(b.location_id)
    }
    if (!budgetGrid.has(b.date)) budgetGrid.set(b.date, new Map())
    budgetGrid.get(b.date)!.set(b.location_id, b.budget_amount)
  }
  const allDates = Array.from(budgetGrid.keys()).sort()
  const gridLocationNames = gridLocationIds.map(id => locationMap.get(id) || 'Unknown')

  // Location totals for daily view footer
  const locationTotals = new Map<string, number>()
  for (const [, dateMap] of budgetGrid) {
    for (const [locId, amount] of dateMap) {
      locationTotals.set(locId, (locationTotals.get(locId) || 0) + amount)
    }
  }

  // Bulk delete
  const handleBulkDelete = async () => {
    setIsDeleting(true)
    try {
      const idsToDelete = filteredBudgets.map(b => b.id)
      const chunkSize = 10
      for (let i = 0; i < idsToDelete.length; i += chunkSize) {
        const chunk = idsToDelete.slice(i, i + chunkSize)
        await Promise.allSettled(chunk.map(id => apiClient.delete(`/budgets/${id}`)))
      }
      queryClient.invalidateQueries({ queryKey: ['existing-budgets'] })
      setDeleteDialogOpen(false)
    } finally {
      setIsDeleting(false)
    }
  }

  // Export
  const handleExport = () => {
    if (viewMode === 'monthly') {
      const headers = ['Location', 'Monthly Total', 'Daily Average', 'Days with Budget', '% of Total']
      const rows = Array.from(locationAggregates.entries())
        .sort((a, b) => b[1].total - a[1].total)
        .map(([locId, agg]) => [
          locationMap.get(locId) || 'Unknown',
          penceToPounds(agg.total),
          penceToPounds(Math.round(agg.total / agg.days)),
          agg.days,
          grandTotal > 0 ? `${((agg.total / grandTotal) * 100).toFixed(1)}%` : '0%',
        ] as (string | number)[])
      exportToExcel([{ name: 'Monthly Summary', headers, rows }], `Budget_${selectedMonth}_Summary`)
    } else {
      const headers = ['Date', ...gridLocationIds.map(id => locationMap.get(id) || 'Unknown')]
      if (gridLocationIds.length > 1) headers.push('Day Total')
      const rows = allDates.map(dateStr => {
        const dm = budgetGrid.get(dateStr)!
        const locAmounts = gridLocationIds.map(id => penceToPounds(dm.get(id) || 0))
        const row: (string | number)[] = [formatDateForExcel(dateStr), ...locAmounts]
        if (gridLocationIds.length > 1) {
          row.push(penceToPounds(gridLocationIds.reduce((s, id) => s + (dm.get(id) || 0), 0)))
        }
        return row
      })
      exportToExcel([{ name: 'Daily Detail', headers, rows }], `Budget_${selectedMonth}_Daily`)
    }
  }

  // Empty state message
  const emptyMessage = budgets.length === 0
    ? (canManage ? 'No budgets have been uploaded yet. Use the upload section above to get started.' : 'No budgets have been uploaded yet.')
    : `No budget data for ${monthLabel}.`

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 bg-card/80 backdrop-blur-sm border border-border/50 rounded-xl px-4 py-3">
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availableMonths.map(m => {
              const [y, mo] = m.split('-').map(Number)
              const label = new Date(y, mo - 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
              return <SelectItem key={m} value={m}>{label}</SelectItem>
            })}
          </SelectContent>
        </Select>

        {locationsWithBudgets.length > 1 && (
          <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Locations</SelectItem>
              {locationsWithBudgets.map(loc => (
                <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="flex gap-1 ml-auto">
          <button
            onClick={() => setViewMode('monthly')}
            className={`px-4 py-2 text-sm rounded-lg transition-colors ${
              viewMode === 'monthly'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            Monthly Summary
          </button>
          <button
            onClick={() => setViewMode('daily')}
            className={`px-4 py-2 text-sm rounded-lg transition-colors ${
              viewMode === 'daily'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            Daily Detail
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Month Total"
          value={grandTotal}
          format="currency"
          currency={currency}
          icon={<DollarSign className="h-4 w-4" />}
          description={monthLabel}
          accentColor="#8b5cf6"
        />
        <KPICard
          title="Daily Average"
          value={dailyAverage}
          format="currency"
          currency={currency}
          icon={<TrendingUp className="h-4 w-4" />}
          description="Per day"
          accentColor="#6366f1"
        />
        <KPICard
          title="Days Budgeted"
          value={totalDays}
          format="number"
          icon={<Calendar className="h-4 w-4" />}
          description={`of ${daysInMonth} days`}
          accentColor="#10b981"
        />
        <KPICard
          title="Locations"
          value={locationCount}
          format="number"
          icon={<MapPin className="h-4 w-4" />}
          description="With budgets set"
          accentColor="#f59e0b"
        />
      </div>

      {/* Main content card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold">
                {viewMode === 'monthly' ? 'Monthly Summary' : 'Daily Detail'}
              </CardTitle>
              <CardDescription>
                {monthLabel}{selectedLocationId !== 'all' ? ` \u2014 ${locationMap.get(selectedLocationId)}` : ''}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {filteredBudgets.length > 0 && (
                <ExportButton onClick={handleExport} />
              )}
              {canManage && filteredBudgets.length > 0 && (
                <button
                  onClick={() => setDeleteDialogOpen(true)}
                  className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/80 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear Month
                </button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading budgets...</p>
          ) : filteredBudgets.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">{emptyMessage}</p>
          ) : viewMode === 'monthly' ? (
            /* Monthly Summary Table */
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Location</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Monthly Total</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Daily Avg</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Days</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">% of Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {Array.from(locationAggregates.entries())
                    .sort((a, b) => b[1].total - a[1].total)
                    .map(([locId, agg]) => {
                      const pct = grandTotal > 0 ? (agg.total / grandTotal) * 100 : 0
                      return (
                        <tr key={locId} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-2.5 text-sm font-medium text-foreground">{locationMap.get(locId) || 'Unknown'}</td>
                          <td className="px-4 py-2.5 text-sm text-right font-semibold text-foreground tabular-nums">{formatCurrency(agg.total, currency)}</td>
                          <td className="px-4 py-2.5 text-sm text-right text-muted-foreground tabular-nums">{formatCurrency(Math.round(agg.total / agg.days), currency)}</td>
                          <td className="px-4 py-2.5 text-sm text-right text-foreground">{agg.days}</td>
                          <td className="px-4 py-2.5 text-sm text-right text-muted-foreground">{pct.toFixed(1)}%</td>
                        </tr>
                      )
                    })}
                </tbody>
                {locationAggregates.size > 1 && (
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted/40">
                      <td className="px-4 py-3 text-sm font-semibold text-foreground">Total</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-primary tabular-nums">{formatCurrency(grandTotal, currency)}</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-muted-foreground tabular-nums">{formatCurrency(dailyAverage, currency)}</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-foreground">{totalDays}</td>
                      <td className="px-4 py-3 text-sm text-right text-muted-foreground">100%</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          ) : (
            /* Daily Detail Grid */
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
                    return allDates.map((dateStr) => {
                      const dateObj = new Date(dateStr)
                      const dateMap = budgetGrid.get(dateStr)!
                      const dayOfWeek = dateObj.getDay()
                      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
                      const isToday = dateStr === todayStr

                      return (
                        <tr
                          key={dateStr}
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
          )}
        </CardContent>
      </Card>

      {/* Bulk delete confirmation dialog */}
      {canManage && (
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Clear Budgets for {monthLabel}</DialogTitle>
              <DialogDescription>
                This will permanently delete {filteredBudgets.length} budget {filteredBudgets.length === 1 ? 'record' : 'records'} for {monthLabel}
                {selectedLocationId !== 'all' ? ` at ${locationMap.get(selectedLocationId)}` : ''}.
                This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={isDeleting}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleBulkDelete} disabled={isDeleting}>
                {isDeleting ? `Deleting...` : `Delete ${filteredBudgets.length} Records`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
