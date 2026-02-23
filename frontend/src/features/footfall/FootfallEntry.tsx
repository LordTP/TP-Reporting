import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, TrendingUp } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useAuthStore } from '@/store/authStore'
import { usePermissionStore } from '@/store/permissionStore'
import FootfallCalendar from './components/FootfallCalendar'
import FootfallDialog from './components/FootfallDialog'

const FULL_ACCESS_ROLES = ['admin', 'superadmin']

interface LocationInfo {
  id: string
  name: string
}

interface FootfallEntryData {
  id: string
  location_id: string
  date: string
  count: number
  location_name: string | null
  creator_name: string | null
  created_at: string
}

interface FootfallListResponse {
  entries: FootfallEntryData[]
  total: number
  page: number
  page_size: number
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

export default function FootfallEntry() {
  const { user } = useAuthStore()
  const permHas = usePermissionStore((s) => s.hasPermission)
  const canManage = (!!user && FULL_ACCESS_ROLES.includes(user.role)) || permHas('feature:manage_footfall')
  const queryClient = useQueryClient()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editEntry, setEditEntry] = useState<FootfallEntryData | null>(null)
  const [dialogDate, setDialogDate] = useState<string>('')
  const [locationFilter, setLocationFilter] = useState('all')
  const [month, setMonth] = useState(() => new Date())
  const hasToken = !!localStorage.getItem('access_token')

  // Fetch locations — same pattern as BudgetUpload
  const { data: locations } = useQuery({
    queryKey: ['locations-for-footfall'],
    queryFn: async () => {
      if (user && FULL_ACCESS_ROLES.includes(user.role)) {
        const accountsData = await apiClient.get<{ accounts: Array<{ id: string }> }>('/square/accounts')
        if (!accountsData.accounts || accountsData.accounts.length === 0) return []
        const locationPromises = accountsData.accounts.map((account) =>
          apiClient.get<{ locations: Array<{ id: string; name: string }> }>(`/square/accounts/${account.id}/locations`)
        )
        const results = await Promise.all(locationPromises)
        return results.flatMap((r) =>
          (r.locations || []).map((l) => ({ id: l.id, name: l.name }))
        ) as LocationInfo[]
      } else {
        const clientsData = await apiClient.get<{ clients: Array<{ id: string }> }>('/clients')
        if (!clientsData.clients || clientsData.clients.length === 0) return []
        const locationPromises = clientsData.clients.map((c) =>
          apiClient.get<{ locations: Array<{ id: string; name: string }> }>(`/clients/${c.id}/locations`)
        )
        const results = await Promise.all(locationPromises)
        const seen = new Set<string>()
        const locs: LocationInfo[] = []
        for (const r of results) {
          for (const l of r.locations || []) {
            if (!seen.has(l.id)) {
              seen.add(l.id)
              locs.push({ id: l.id, name: l.name })
            }
          }
        }
        return locs
      }
    },
    enabled: hasToken && !!user,
  })

  // Fetch footfall entries for the selected month
  const monthRange = getMonthRange(month)
  const monthKey = `${month.getFullYear()}-${month.getMonth()}`
  const { data: entriesData, isLoading } = useQuery({
    queryKey: ['footfall-entries', locationFilter, monthKey],
    queryFn: () => {
      const params = new URLSearchParams()
      if (locationFilter !== 'all') params.set('location_id', locationFilter)
      params.set('start_date', monthRange.start_date)
      params.set('end_date', monthRange.end_date)
      params.set('page_size', '500')
      return apiClient.get<FootfallListResponse>(`/footfall/?${params.toString()}`)
    },
    enabled: hasToken,
  })

  // Fetch footfall coverage (days with sales but no footfall) for the viewed month
  interface CoverageLocation {
    location_id: string
    location_name: string
    sales_days: number
    footfall_days: number
    missing_days: string[]
  }
  interface CoverageResponse {
    locations: CoverageLocation[]
    start_date: string
    end_date: string
  }
  const { data: coverageData } = useQuery({
    queryKey: ['footfall-coverage', monthKey],
    queryFn: () =>
      apiClient.get<CoverageResponse>(
        `/footfall/coverage?start_date=${monthRange.start_date}&end_date=${monthRange.end_date}`
      ),
    enabled: hasToken,
  })

  const [expandedCoverage, setExpandedCoverage] = useState<Set<string>>(new Set())
  const coverageLocations = coverageData?.locations || []
  const locationsWithMissing = coverageLocations.filter(l => l.missing_days.length > 0)
  const totalMissingDays = locationsWithMissing.reduce((sum, l) => sum + l.missing_days.length, 0)

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/footfall/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['footfall-entries'] })
      queryClient.invalidateQueries({ queryKey: ['footfall-coverage'] })
    },
  })

  const handleDayClick = (date: string, existingEntry?: FootfallEntryData) => {
    if (existingEntry) {
      setEditEntry(existingEntry)
      setDialogDate('')
    } else {
      setEditEntry(null)
      setDialogDate(date)
    }
    setDialogOpen(true)
  }

  const handleAdd = () => {
    setEditEntry(null)
    setDialogDate(new Date().toISOString().split('T')[0])
    setDialogOpen(true)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-light tracking-brand-heading uppercase">Footfall</h2>
          <p className="text-sm text-muted-foreground">
            {canManage ? 'Log and manage daily visitor counts per location' : 'View daily visitor counts per location'}
          </p>
        </div>
        {canManage && (
          <Button onClick={handleAdd}>
            <Plus className="mr-2 h-4 w-4" />
            Add Entry
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
        {entriesData && entriesData.total > 0 && (
          <span className="text-sm text-muted-foreground">
            {entriesData.total} {entriesData.total === 1 ? 'entry' : 'entries'} this month
          </span>
        )}
      </div>

      {/* Trend Chart */}
      {entriesData && entriesData.entries.length > 0 && (() => {
        // Aggregate by date
        const byDate = new Map<string, number>()
        for (const e of entriesData.entries) {
          byDate.set(e.date, (byDate.get(e.date) || 0) + e.count)
        }
        // Fill all days in the month
        const start = new Date(monthRange.start_date + 'T00:00:00')
        const end = new Date(monthRange.end_date + 'T00:00:00')
        const chartData: Array<{ date: string; label: string; count: number }> = []
        const today = new Date().toISOString().split('T')[0]
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const iso = d.toISOString().split('T')[0]
          if (iso > today) break
          chartData.push({
            date: iso,
            label: d.getDate().toString(),
            count: byDate.get(iso) || 0,
          })
        }
        const total = chartData.reduce((s, d) => s + d.count, 0)
        const daysWithData = chartData.filter(d => d.count > 0).length
        const avg = daysWithData > 0 ? Math.round(total / daysWithData) : 0

        return (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  <CardTitle className="text-base font-semibold">Daily Footfall Trend</CardTitle>
                </div>
                <div className="flex gap-4 text-sm text-muted-foreground">
                  <span>Total: <strong className="text-foreground">{total.toLocaleString()}</strong></span>
                  <span>Avg: <strong className="text-foreground">{avg.toLocaleString()}</strong>/day</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.[0]) return null
                        const d = payload[0].payload
                        const dateObj = new Date(d.date + 'T00:00:00')
                        return (
                          <div className="rounded-lg border bg-background px-3 py-2 shadow-md text-sm">
                            <p className="font-medium">{dateObj.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</p>
                            <p className="text-muted-foreground">{d.count.toLocaleString()} visitors</p>
                          </div>
                        )
                      }}
                    />
                    <Bar
                      dataKey="count"
                      fill="hsl(var(--primary))"
                      radius={[3, 3, 0, 0]}
                      maxBarSize={24}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )
      })()}

      {/* Footfall Coverage — missing days */}
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
                  ? `${totalMissingDays} ${totalMissingDays === 1 ? 'day' : 'days'} missing footfall across ${locationsWithMissing.length} ${locationsWithMissing.length === 1 ? 'location' : 'locations'}`
                  : 'All locations have complete footfall data this month'}
              </CardTitle>
            </div>
            <CardDescription>
              Days with sales but no footfall entry recorded &middot; {new Date(monthRange.start_date + 'T00:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
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
                          {loc.footfall_days}/{loc.sales_days} days covered
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

      {/* Calendar */}
      <FootfallCalendar
        entries={entriesData?.entries || []}
        isLoading={isLoading}
        canManage={canManage}
        month={month}
        onMonthChange={setMonth}
        onDayClick={handleDayClick}
        onDelete={(id) => deleteMutation.mutate(id)}
        locationFilter={locationFilter}
      />

      {/* Dialog */}
      <FootfallDialog
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
    </div>
  )
}
