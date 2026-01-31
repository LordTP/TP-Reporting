import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, AlertTriangle, CheckCircle2, Filter } from 'lucide-react'
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
  const [onlyWithSales, setOnlyWithSales] = useState(true)

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

  // Fetch yesterday's entries to find missing stores
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().split('T')[0]

  const { data: yesterdayData } = useQuery({
    queryKey: ['footfall-entries-yesterday', yesterdayStr],
    queryFn: () => {
      const params = new URLSearchParams()
      params.set('start_date', yesterdayStr)
      params.set('end_date', yesterdayStr)
      params.set('page_size', '500')
      return apiClient.get<FootfallListResponse>(`/footfall/?${params.toString()}`)
    },
    enabled: hasToken && !!locations && locations.length > 0,
  })

  // Fetch yesterday's sales by location (for "only with sales" filter)
  interface SalesByLocationResponse {
    locations: Array<{ location_id: string; location_name: string; total_transactions: number }>
  }
  const { data: yesterdaySalesData } = useQuery({
    queryKey: ['sales-by-location-yesterday', yesterdayStr],
    queryFn: () =>
      apiClient.get<SalesByLocationResponse>(
        `/sales/analytics/sales-by-location?start_date=${yesterdayStr}&end_date=${yesterdayStr}`
      ),
    enabled: hasToken && onlyWithSales,
  })

  const yesterdayLocationIds = new Set((yesterdayData?.entries || []).map((e) => e.location_id))
  const locationsWithSalesYesterday = new Set(
    (yesterdaySalesData?.locations || [])
      .filter((l) => l.total_transactions > 0)
      .map((l) => l.location_id)
  )
  const missingLocations = (locations || []).filter((loc) => {
    if (yesterdayLocationIds.has(loc.id)) return false
    if (onlyWithSales && !locationsWithSalesYesterday.has(loc.id)) return false
    return true
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/footfall/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['footfall-entries'] })
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
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Footfall</h2>
          <p className="text-muted-foreground">
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
        <div className="w-56">
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

      {/* Missing footfall yesterday */}
      {locations && locations.length > 0 && yesterdayData && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {missingLocations.length > 0 ? (
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                )}
                <CardTitle className="text-base font-semibold">
                  {missingLocations.length > 0
                    ? `${missingLocations.length} ${missingLocations.length === 1 ? 'store' : 'stores'} missing footfall yesterday`
                    : 'All stores have footfall data for yesterday'}
                </CardTitle>
              </div>
              <button
                onClick={() => setOnlyWithSales(!onlyWithSales)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                  onlyWithSales
                    ? 'bg-primary/10 border-primary/30 text-primary'
                    : 'bg-muted/30 border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                <Filter className="h-3 w-3" />
                Only with sales
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {new Date(yesterdayStr + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              {onlyWithSales && <span className="ml-2 text-primary">&middot; Filtered to stores with sales yesterday</span>}
            </p>
          </CardHeader>
          {missingLocations.length > 0 && (
            <CardContent className="pt-0">
              <div className="flex flex-wrap gap-2">
                {missingLocations.map((loc) => (
                  <button
                    key={loc.id}
                    onClick={() => {
                      if (canManage) {
                        setEditEntry(null)
                        setDialogDate(yesterdayStr)
                        setLocationFilter(loc.id)
                        setDialogOpen(true)
                      }
                    }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border border-border bg-muted/30 transition-colors ${
                      canManage ? 'hover:bg-amber-500/10 hover:border-amber-500/30 cursor-pointer' : ''
                    }`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    {loc.name}
                  </button>
                ))}
              </div>
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
