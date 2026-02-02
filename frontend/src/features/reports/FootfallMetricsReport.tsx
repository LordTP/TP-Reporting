import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { useReportFilters } from './useReportFilters'
import ReportLayout from './ReportLayout'
import KPICard from '@/components/charts/KPICard'
import ExportButton from '@/components/ExportButton'
import { exportToExcel, penceToPounds } from './exportToExcel'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Footprints, TrendingUp, DollarSign, Percent } from 'lucide-react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'

interface FootfallEntry {
  id: string
  location_id: string
  date: string
  count: number
  location_name: string | null
}

interface FootfallListResponse {
  entries: FootfallEntry[]
  total: number
  page: number
  page_size: number
}

interface SalesLocationData {
  location_id: string
  location_name: string
  total_sales: number
  total_transactions: number
  average_transaction: number
  currency: string
}

/**
 * Convert report filter state into footfall API date params (YYYY-MM-DD strings).
 */
function buildFootfallDateParams(filters: ReturnType<typeof useReportFilters>): { start_date: string; end_date: string } {
  const today = new Date()
  const fmt = (d: Date) => d.toISOString().split('T')[0]

  if (filters.datePreset === 'custom' && filters.customStartDate && filters.customEndDate) {
    return { start_date: filters.customStartDate, end_date: filters.customEndDate }
  }

  if (filters.datePreset === 'today') {
    const s = fmt(today)
    return { start_date: s, end_date: s }
  }
  if (filters.datePreset === 'yesterday') {
    const yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)
    const s = fmt(yesterday)
    return { start_date: s, end_date: s }
  }
  if (filters.datePreset === 'this_week') {
    const day = today.getDay()
    const diff = day === 0 ? 6 : day - 1
    const start = new Date(today)
    start.setDate(today.getDate() - diff)
    return { start_date: fmt(start), end_date: fmt(today) }
  }
  if (filters.datePreset === 'this_month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1)
    return { start_date: fmt(start), end_date: fmt(today) }
  }
  if (filters.datePreset === 'this_year') {
    const start = new Date(today.getFullYear(), 0, 1)
    return { start_date: fmt(start), end_date: fmt(today) }
  }

  // Numeric days preset
  const days = parseInt(filters.datePreset, 10)
  if (!isNaN(days) && days > 0) {
    const start = new Date(today)
    start.setDate(today.getDate() - days)
    return { start_date: fmt(start), end_date: fmt(today) }
  }

  // Fallback: last 30 days
  const start = new Date(today)
  start.setDate(today.getDate() - 30)
  return { start_date: fmt(start), end_date: fmt(today) }
}

export default function FootfallMetricsReport() {
  const filters = useReportFilters()
  const dateParams = buildFootfallDateParams(filters)

  // Fetch footfall entries for date range
  const { data: footfallData, isLoading: footfallLoading, refetch: refetchFootfall } = useQuery({
    queryKey: ['report-footfall', filters.datePreset, filters.customStartDate, filters.customEndDate, filters.selectedLocation],
    queryFn: () => {
      const params = new URLSearchParams()
      params.set('start_date', dateParams.start_date)
      params.set('end_date', dateParams.end_date)
      params.set('page_size', '500')
      if (filters.selectedLocation !== 'all') params.set('location_id', filters.selectedLocation)
      return apiClient.get<FootfallListResponse>(`/footfall/?${params.toString()}`)
    },
    enabled: filters.isDateRangeReady,
  })

  // Fetch sales by location from fast-summary (uses DailySalesSummary, not raw transactions)
  const { data: summaryData, isLoading: salesLoading, refetch: refetchSales } = useQuery({
    queryKey: ['report-footfall-sales', filters.datePreset, filters.customStartDate, filters.customEndDate, filters.selectedLocation, filters.selectedClient],
    queryFn: () =>
      apiClient.get<{ sales_by_location: Array<{ location_id: string; location_name: string; total_sales: number; converted_total_sales: number; total_transactions: number; currency: string }> }>(
        `/sales/analytics/fast-summary?${filters.buildQueryParams()}`
      ),
    enabled: filters.isDateRangeReady,
  })

  const isLoading = footfallLoading || salesLoading
  const entries = footfallData?.entries || []
  const salesLocations: SalesLocationData[] = (summaryData?.sales_by_location || []).map(s => {
    const sales = s.converted_total_sales ?? s.total_sales
    return {
      location_id: s.location_id,
      location_name: s.location_name,
      total_sales: sales,
      total_transactions: s.total_transactions,
      average_transaction: s.total_transactions > 0 ? Math.round(sales / s.total_transactions) : 0,
      currency: 'GBP',
    }
  })

  // Build sales lookup by location_id
  const salesByLocationId = useMemo(() => {
    const map = new Map<string, SalesLocationData>()
    for (const s of salesLocations) map.set(s.location_id, s)
    return map
  }, [salesLocations])

  // Aggregate footfall by location
  const footfallByLocation = useMemo(() => {
    const map = new Map<string, { location_id: string; location_name: string; total_footfall: number }>()
    for (const e of entries) {
      const existing = map.get(e.location_id)
      if (existing) {
        existing.total_footfall += e.count
      } else {
        map.set(e.location_id, {
          location_id: e.location_id,
          location_name: e.location_name || e.location_id,
          total_footfall: e.count,
        })
      }
    }
    return map
  }, [entries])

  // Aggregate footfall by date (for trend chart)
  const footfallByDate = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of entries) {
      map.set(e.date, (map.get(e.date) || 0) + e.count)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, footfall: count }))
  }, [entries])

  // KPI calculations
  const totalFootfall = entries.reduce((sum, e) => sum + e.count, 0)
  const totalTransactions = salesLocations.reduce((sum, s) => sum + s.total_transactions, 0)
  const totalSales = salesLocations.reduce((sum, s) => sum + s.total_sales, 0)
  const conversionRate = totalFootfall > 0 ? (totalTransactions / totalFootfall) * 100 : 0
  const revenuePerVisitor = totalFootfall > 0 ? totalSales / totalFootfall : 0 // in pence
  const daysWithData = new Set(entries.map(e => e.date)).size

  // Location breakdown table data
  const locationRows = useMemo(() => {
    const allLocationIds = new Set([
      ...footfallByLocation.keys(),
      ...salesByLocationId.keys(),
    ])
    return Array.from(allLocationIds).map(locId => {
      const ff = footfallByLocation.get(locId)
      const sales = salesByLocationId.get(locId)
      const footfall = ff?.total_footfall || 0
      const transactions = sales?.total_transactions || 0
      const revenue = sales?.total_sales || 0
      const conversion = footfall > 0 ? (transactions / footfall) * 100 : 0
      const revPerVisitor = footfall > 0 ? revenue / footfall : 0
      return {
        location_id: locId,
        location_name: ff?.location_name || sales?.location_name || locId,
        footfall,
        transactions,
        revenue,
        conversion,
        revPerVisitor,
        avgTransaction: sales?.average_transaction || 0,
      }
    }).sort((a, b) => b.footfall - a.footfall)
  }, [footfallByLocation, salesByLocationId])

  // Chart data for location comparison
  const locationChartData = useMemo(() =>
    locationRows.filter(r => r.footfall > 0).slice(0, 12).map(r => ({
      name: r.location_name.length > 15 ? r.location_name.slice(0, 15) + '…' : r.location_name,
      footfall: r.footfall,
      conversion: parseFloat(r.conversion.toFixed(1)),
    })),
    [locationRows]
  )

  const handleExport = () => {
    exportToExcel(
      [
        {
          name: 'Footfall & Conversion',
          headers: ['Location', 'Footfall', 'Transactions', 'Conversion %', 'Revenue (£)', 'Rev/Visitor (£)', 'Avg Transaction (£)'],
          rows: locationRows.map(r => [
            r.location_name,
            r.footfall,
            r.transactions,
            parseFloat(r.conversion.toFixed(1)),
            penceToPounds(r.revenue),
            penceToPounds(r.revPerVisitor),
            penceToPounds(r.avgTransaction),
          ]),
        },
        {
          name: 'Daily Footfall',
          headers: ['Date', 'Footfall'],
          rows: footfallByDate.map(d => [d.date, d.footfall]),
        },
      ],
      `footfall-conversion-${dateParams.start_date}-to-${dateParams.end_date}`,
    )
  }

  const refetch = () => { refetchFootfall(); refetchSales() }

  return (
    <ReportLayout
      title="Footfall & Conversion"
      description={`Conversion rates and sales-per-visitor metrics — ${filters.dateRangeLabel}`}
      filters={filters}
      onRefresh={refetch}
      isLoading={isLoading}
    >
      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <KPICard
          title="Total Footfall"
          value={totalFootfall}
          format="number"
          description={`${daysWithData} ${daysWithData === 1 ? 'day' : 'days'} of data`}
          icon={<Footprints className="h-4 w-4" />}
        />
        <KPICard
          title="Conversion Rate"
          value={conversionRate}
          format="percentage"
          description={`${totalTransactions.toLocaleString()} transactions`}
          icon={<Percent className="h-4 w-4" />}
        />
        <KPICard
          title="Revenue per Visitor"
          value={revenuePerVisitor}
          format="currency"
          description="Sales ÷ Footfall"
          icon={<DollarSign className="h-4 w-4" />}
        />
        <KPICard
          title="Avg Transaction"
          value={totalTransactions > 0 ? Math.round(totalSales / totalTransactions) : 0}
          format="currency"
          description={`${totalTransactions.toLocaleString()} transactions`}
          icon={<TrendingUp className="h-4 w-4" />}
        />
      </div>

      {/* Daily Footfall Trend */}
      {footfallByDate.length > 1 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Daily Footfall Trend</CardTitle>
            <CardDescription>Visitor counts per day across the selected period</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={footfallByDate}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  className="text-muted-foreground"
                  tickFormatter={(d: string) => {
                    const date = new Date(d + 'T00:00:00')
                    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                  }}
                />
                <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
                <Tooltip
                  labelFormatter={(d: string) => {
                    const date = new Date(d + 'T00:00:00')
                    return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
                  }}
                  formatter={(val: number) => [val.toLocaleString(), 'Footfall']}
                  contentStyle={{ borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)' }}
                />
                <Line type="monotone" dataKey="footfall" stroke="hsl(var(--primary))" strokeWidth={2} dot={footfallByDate.length <= 31} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Location Comparison Chart */}
      {locationChartData.length > 1 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Footfall by Location</CardTitle>
            <CardDescription>Visitor counts and conversion rates per location</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(200, locationChartData.length * 40)}>
              <BarChart data={locationChartData} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} className="text-muted-foreground" width={120} />
                <Tooltip
                  formatter={(val: number, name: string) => {
                    if (name === 'Conversion %') return [`${val.toFixed(1)}%`, 'Conversion']
                    return [val.toLocaleString(), 'Footfall']
                  }}
                  contentStyle={{ borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)' }}
                />
                <Legend />
                <Bar dataKey="footfall" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="Footfall" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Location Breakdown Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Location Breakdown</CardTitle>
              <CardDescription>Footfall, transactions, conversion and revenue per visitor by location</CardDescription>
            </div>
            <ExportButton onClick={handleExport} />
          </div>
        </CardHeader>
        <CardContent>
          {locationRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-12">
              <Footprints className="h-8 w-8 text-muted-foreground mb-3" />
              <p className="text-sm font-medium text-foreground mb-1">No data for this period</p>
              <p className="text-sm text-muted-foreground">
                No footfall entries have been recorded for the selected date range and filters.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-3 font-semibold text-muted-foreground">Location</th>
                    <th className="pb-3 font-semibold text-muted-foreground text-right">Footfall</th>
                    <th className="pb-3 font-semibold text-muted-foreground text-right">Transactions</th>
                    <th className="pb-3 font-semibold text-muted-foreground text-right">Conversion</th>
                    <th className="pb-3 font-semibold text-muted-foreground text-right">Revenue</th>
                    <th className="pb-3 font-semibold text-muted-foreground text-right">Rev/Visitor</th>
                    <th className="pb-3 font-semibold text-muted-foreground text-right">Avg Txn</th>
                  </tr>
                </thead>
                <tbody>
                  {locationRows.map((row) => (
                    <tr key={row.location_id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-3 font-medium">{row.location_name}</td>
                      <td className="py-3 text-right tabular-nums">{row.footfall.toLocaleString()}</td>
                      <td className="py-3 text-right tabular-nums">{row.transactions.toLocaleString()}</td>
                      <td className="py-3 text-right tabular-nums">
                        {row.footfall > 0 ? (
                          <span className={row.conversion >= 5 ? 'text-emerald-600' : row.conversion >= 2 ? 'text-foreground' : 'text-amber-600'}>
                            {row.conversion.toFixed(1)}%
                          </span>
                        ) : '—'}
                      </td>
                      <td className="py-3 text-right tabular-nums">
                        £{(row.revenue / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 text-right tabular-nums">
                        {row.footfall > 0
                          ? `£${(row.revPerVisitor / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : '—'}
                      </td>
                      <td className="py-3 text-right tabular-nums">
                        {row.transactions > 0
                          ? `£${(row.avgTransaction / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                  {/* Totals row */}
                  {locationRows.length > 1 && (
                    <tr className="font-semibold bg-muted/20">
                      <td className="py-3">Total</td>
                      <td className="py-3 text-right tabular-nums">{totalFootfall.toLocaleString()}</td>
                      <td className="py-3 text-right tabular-nums">{totalTransactions.toLocaleString()}</td>
                      <td className="py-3 text-right tabular-nums">{conversionRate.toFixed(1)}%</td>
                      <td className="py-3 text-right tabular-nums">
                        £{(totalSales / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 text-right tabular-nums">
                        £{(revenuePerVisitor / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 text-right tabular-nums">
                        {totalTransactions > 0
                          ? `£${(totalSales / totalTransactions / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : '—'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </ReportLayout>
  )
}
