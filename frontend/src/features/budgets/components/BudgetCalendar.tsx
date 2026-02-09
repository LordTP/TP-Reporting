import { useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { ChevronLeft, ChevronRight, PoundSterling, Trash2 } from 'lucide-react'

interface BudgetEntry {
  id: string
  location_id: string
  date: string
  budget_amount: number
  currency: string
  location_name?: string
}

interface BudgetCalendarProps {
  entries: BudgetEntry[]
  isLoading: boolean
  canManage: boolean
  month: Date
  onMonthChange: (month: Date) => void
  onDayClick: (date: string, existingEntry?: BudgetEntry) => void
  onDelete: (id: string) => void
  locationFilter: string
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfWeek(year: number, month: number) {
  const day = new Date(year, month, 1).getDay()
  return day === 0 ? 6 : day - 1
}

function formatDateStr(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function formatCurrency(amountPence: number): string {
  const pounds = amountPence / 100
  if (pounds >= 1000) {
    return `£${(pounds / 1000).toFixed(pounds % 1000 === 0 ? 0 : 1)}k`
  }
  return `£${pounds.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function formatCurrencyFull(amountPence: number): string {
  const pounds = amountPence / 100
  return `£${pounds.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

export default function BudgetCalendar({
  entries,
  isLoading,
  canManage,
  month,
  onMonthChange,
  onDayClick,
  onDelete,
  locationFilter,
}: BudgetCalendarProps) {
  const [deleteEntry, setDeleteEntry] = useState<BudgetEntry | null>(null)

  const year = month.getFullYear()
  const monthIdx = month.getMonth()
  const daysInMonth = getDaysInMonth(year, monthIdx)
  const firstDay = getFirstDayOfWeek(year, monthIdx)
  const today = new Date().toISOString().split('T')[0]

  const monthLabel = month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const currentYear = new Date().getFullYear()
  const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - 5 + i)

  // Build lookup: date string -> entries
  const entryMap = new Map<string, BudgetEntry[]>()
  for (const e of entries) {
    const existing = entryMap.get(e.date) || []
    existing.push(e)
    entryMap.set(e.date, existing)
  }

  const handlePrev = () => onMonthChange(new Date(year, monthIdx - 1, 1))
  const handleNext = () => onMonthChange(new Date(year, monthIdx + 1, 1))
  const handleToday = () => onMonthChange(new Date())

  // Calculate month totals
  const totalBudget = entries.reduce((sum, e) => sum + e.budget_amount, 0)
  const daysWithData = new Set(entries.map(e => e.date)).size
  const avgBudget = daysWithData > 0 ? Math.round(totalBudget / daysWithData) : 0

  // Build grid cells
  const cells: Array<{ day: number | null; dateStr: string; isToday: boolean; isWeekend: boolean }> = []

  for (let i = 0; i < firstDay; i++) {
    cells.push({ day: null, dateStr: '', isToday: false, isWeekend: false })
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = formatDateStr(year, monthIdx, d)
    const dayOfWeek = (firstDay + d - 1) % 7
    cells.push({
      day: d,
      dateStr,
      isToday: dateStr === today,
      isWeekend: dayOfWeek >= 5,
    })
  }

  while (cells.length % 7 !== 0) {
    cells.push({ day: null, dateStr: '', isToday: false, isWeekend: false })
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button onClick={handlePrev} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-1.5">
                <Select value={String(monthIdx)} onValueChange={(v) => onMonthChange(new Date(year, parseInt(v), 1))}>
                  <SelectTrigger className="w-[120px] h-8 text-sm font-semibold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => (
                      <SelectItem key={i} value={String(i)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={String(year)} onValueChange={(v) => onMonthChange(new Date(parseInt(v), monthIdx, 1))}>
                  <SelectTrigger className="w-[80px] h-8 text-sm font-semibold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {yearOptions.map((y) => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <button onClick={handleNext} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                <ChevronRight className="h-4 w-4" />
              </button>
              <Button variant="outline" size="sm" onClick={handleToday} className="text-xs h-7 ml-1">
                Today
              </Button>
            </div>
          </div>
          {/* Month summary */}
          {!isLoading && entries.length > 0 && (
            <div className="flex gap-6 text-sm text-muted-foreground mt-1">
              <span>Total: <span className="font-medium text-foreground">{formatCurrencyFull(totalBudget)}</span></span>
              <span>Avg/day: <span className="font-medium text-foreground">{formatCurrencyFull(avgBudget)}</span></span>
              <span>{daysWithData} of {daysInMonth} days budgeted</span>
            </div>
          )}
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
              <span className="text-sm">Loading...</span>
            </div>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden">
              {/* Weekday header */}
              <div className="grid grid-cols-7 bg-muted/40 border-b border-border">
                {WEEKDAYS.map((wd) => (
                  <div key={wd} className="px-2 py-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {wd}
                  </div>
                ))}
              </div>

              {/* Day grid */}
              <div className="grid grid-cols-7">
                {cells.map((cell, i) => {
                  if (cell.day === null) {
                    return <div key={i} className="min-h-[80px] bg-muted/10 border-b border-r border-border last:border-r-0" />
                  }

                  const dayEntries = entryMap.get(cell.dateStr) || []
                  const hasData = dayEntries.length > 0
                  const totalAmount = dayEntries.reduce((s, e) => s + e.budget_amount, 0)
                  const isSingleLocation = locationFilter !== 'all'

                  return (
                    <div
                      key={i}
                      onClick={() => {
                        if (canManage) {
                          onDayClick(cell.dateStr, undefined)
                        }
                      }}
                      className={`min-h-[80px] p-2 border-b border-r border-border transition-colors relative ${
                        canManage ? 'cursor-pointer hover:bg-muted/30' : ''
                      } ${cell.isWeekend ? 'bg-muted/15' : ''} ${cell.isToday ? 'ring-2 ring-inset ring-primary/40' : ''}`}
                    >
                      {/* Day number */}
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs font-medium ${cell.isToday ? 'text-primary font-bold' : 'text-muted-foreground'}`}>
                          {cell.day}
                        </span>
                        {hasData && canManage && dayEntries.length === 1 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setDeleteEntry(dayEntries[0])
                            }}
                            className="p-0.5 rounded text-muted-foreground/40 hover:text-destructive transition-colors"
                            style={{ opacity: 0 }}
                            title="Delete"
                            onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                            onMouseLeave={(e) => (e.currentTarget.style.opacity = '0')}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>

                      {/* Budget data */}
                      {hasData ? (
                        <div className="space-y-0.5">
                          {isSingleLocation ? (
                            <div
                              className={`text-center rounded px-1 py-0.5 ${canManage ? 'hover:bg-primary/10 cursor-pointer' : ''}`}
                              onClick={(e) => {
                                if (canManage && dayEntries.length === 1) {
                                  e.stopPropagation()
                                  onDayClick(cell.dateStr, dayEntries[0])
                                }
                              }}
                            >
                              <span className="text-lg font-bold text-foreground tabular-nums">{formatCurrency(totalAmount)}</span>
                            </div>
                          ) : (
                            dayEntries.slice(0, 3).map((entry) => (
                              <div
                                key={entry.id}
                                onClick={(e) => {
                                  if (canManage) {
                                    e.stopPropagation()
                                    onDayClick(cell.dateStr, entry)
                                  }
                                }}
                                className={`flex items-center justify-between gap-1 text-[10px] leading-tight rounded px-1 py-0.5 bg-primary/10 ${
                                  canManage ? 'hover:bg-primary/20 cursor-pointer' : ''
                                }`}
                              >
                                <span className="text-muted-foreground truncate max-w-[60%]">
                                  {entry.location_name?.split(' ')[0] || '—'}
                                </span>
                                <span className="font-semibold text-foreground tabular-nums">{formatCurrency(entry.budget_amount)}</span>
                              </div>
                            ))
                          )}
                          {!isSingleLocation && dayEntries.length > 3 && (
                            <p className="text-[9px] text-muted-foreground text-center">+{dayEntries.length - 3} more</p>
                          )}
                        </div>
                      ) : canManage ? (
                        <div className="flex items-center justify-center h-8 opacity-0 hover:opacity-40 transition-opacity">
                          <PoundSterling className="h-4 w-4 text-muted-foreground" />
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && entries.length === 0 && (
            <div className="flex flex-col items-center justify-center text-center py-8">
              <PoundSterling className="h-8 w-8 text-muted-foreground mb-3" />
              <p className="text-sm font-medium text-foreground mb-1">No budgets for {monthLabel}</p>
              <p className="text-sm text-muted-foreground">
                {canManage ? 'Click on any day to add a budget.' : 'No budget data for this month.'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation */}
      <Dialog open={!!deleteEntry} onOpenChange={() => setDeleteEntry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Budget Entry</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the budget of{' '}
              <span className="font-medium text-foreground">{deleteEntry ? formatCurrencyFull(deleteEntry.budget_amount) : ''}</span> for{' '}
              <span className="font-medium text-foreground">{deleteEntry?.location_name}</span> on{' '}
              <span className="font-medium text-foreground">{deleteEntry ? formatDate(deleteEntry.date) : ''}</span>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteEntry(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteEntry) {
                  onDelete(deleteEntry.id)
                  setDeleteEntry(null)
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
