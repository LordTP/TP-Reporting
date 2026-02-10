import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { useReportFilters } from './useReportFilters'
import ReportLayout from './ReportLayout'
import KPICard from '@/components/charts/KPICard'
import { DollarSign, ShoppingCart, TrendingUp, Calendar } from 'lucide-react'
import ExportButton from '@/components/ExportButton'
import { CurrencyBreakdownAnnotation, CurrencyBreakdownItem } from './CurrencyBreakdown'
import { exportToExcel, penceToPounds, formatDateForExcel } from './exportToExcel'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount / 100)
}

export default function DailySalesSummaryReport() {
  const filters = useReportFilters()

  const { data: summaryData, isLoading, refetch } = useQuery({
    queryKey: ['report-daily-summary', filters.datePreset, filters.customStartDate, filters.customEndDate, filters.selectedLocation, filters.selectedClient],
    queryFn: () => apiClient.get<{
      total_sales: number
      transaction_count: number
      average_transaction: number
      currency: string
      top_days: Array<{ date: string; total_sales: number; transaction_count: number; location_id?: string; location_name?: string }>
    }>(`/sales/summary?${filters.buildQueryParams()}`),
    enabled: filters.isDateRangeReady,
  })

  const { data: aggregationData } = useQuery({
    queryKey: ['report-daily-aggregation', filters.datePreset, filters.customStartDate, filters.customEndDate, filters.selectedLocation, filters.selectedClient],
    queryFn: () => apiClient.get<{
      total_sales: number
      total_transactions: number
      average_transaction: number
      currency: string
      by_currency?: CurrencyBreakdownItem[]
    }>(`/sales/aggregation?${filters.buildQueryParams()}`),
    enabled: filters.isDateRangeReady,
  })

  const currency = aggregationData?.currency || 'GBP'
  const currencySymbol = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency

  // Raw rows from backend (date + location granularity)
  const rawRows = (summaryData?.top_days || [])
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || (a.location_name || '').localeCompare(b.location_name || ''))

  // Build sorted list of unique locations
  const locationMap = new Map<string, string>()
  rawRows.forEach(r => { if (r.location_id) locationMap.set(r.location_id, r.location_name || 'Unknown') })
  const locationList = Array.from(locationMap.entries())
    .sort((a, b) => a[1].localeCompare(b[1]))
  const isMultiLocation = locationList.length > 1

  // Pivot: build { date -> { locationId -> { sales, txns } } }
  const pivotMap: Record<string, Record<string, { sales: number; txns: number }>> = {}
  rawRows.forEach(row => {
    if (!pivotMap[row.date]) pivotMap[row.date] = {}
    const locId = row.location_id || '_all'
    pivotMap[row.date][locId] = { sales: row.total_sales, txns: row.transaction_count }
  })

  // Aggregate by date for the chart (always show daily totals)
  const dailyData = Object.values(
    rawRows.reduce<Record<string, { date: string; total_sales: number; transaction_count: number }>>((acc, row) => {
      if (!acc[row.date]) acc[row.date] = { date: row.date, total_sales: 0, transaction_count: 0 }
      acc[row.date].total_sales += row.total_sales
      acc[row.date].transaction_count += row.transaction_count
      return acc
    }, {})
  ).sort((a, b) => a.date.localeCompare(b.date))

  const bestDay = dailyData.length > 0
    ? dailyData.reduce((best, d) => d.total_sales > best.total_sales ? d : best)
    : null

  // Sorted dates for pivot table
  const sortedDates = Object.keys(pivotMap).sort()

  const handleExport = () => {
    if (isMultiLocation) {
      const headers = ['Date', ...locationList.map(([, name]) => name), 'Total']
      const rows = sortedDates.map(date => {
        const locData = pivotMap[date] || {}
        const dayTotal = Object.values(locData).reduce((s, d) => s + d.sales, 0)
        return [
          formatDateForExcel(date),
          ...locationList.map(([locId]) => locData[locId] ? penceToPounds(locData[locId].sales) : 0),
          penceToPounds(dayTotal),
        ] as (string | number)[]
      })
      exportToExcel([{ name: 'Daily Sales', headers, rows }], 'Daily_Sales_Summary')
    } else {
      const headers = ['Date', 'Transactions', 'Avg Transaction', 'Total Sales']
      const rows = rawRows.map(row => [
        formatDateForExcel(row.date),
        row.transaction_count,
        penceToPounds(row.transaction_count > 0 ? row.total_sales / row.transaction_count : 0),
        penceToPounds(row.total_sales),
      ] as (string | number)[])
      exportToExcel([{ name: 'Daily Sales', headers, rows }], 'Daily_Sales_Summary')
    }
  }

  return (
    <ReportLayout
      title="Daily Sales Summary"
      description={`Day-by-day sales breakdown - ${filters.dateRangeLabel}`}
      filters={filters}
      onRefresh={() => refetch()}
      isLoading={isLoading}
    >
      {/* KPIs */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <KPICard
          title="Total Sales"
          value={aggregationData?.total_sales || 0}
          format="currency"
          currency={currency}
          icon={<DollarSign className="h-4 w-4" />}
          description={filters.dateRangeLabel}
          accentColor="#FB731E"
          annotation={<CurrencyBreakdownAnnotation breakdown={aggregationData?.by_currency} />}
        />
        <KPICard
          title="Transactions"
          value={aggregationData?.total_transactions || 0}
          format="number"
          icon={<ShoppingCart className="h-4 w-4" />}
          description={filters.dateRangeLabel}
          accentColor="#FB731E"
        />
        <KPICard
          title="Avg Transaction"
          value={aggregationData?.average_transaction || 0}
          format="currency"
          currency={currency}
          icon={<TrendingUp className="h-4 w-4" />}
          description="Per transaction"
          accentColor="#FB731E"
        />
        <KPICard
          title="Best Day"
          value={bestDay ? new Date(bestDay.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'N/A'}
          icon={<Calendar className="h-4 w-4" />}
          description={bestDay ? formatCurrency(bestDay.total_sales, currency) : 'No data'}
          accentColor="#10b981"
        />
      </div>

      {/* Chart */}
      {dailyData.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Sales by Day</CardTitle>
            <CardDescription>Top selling days in the selected period</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={dailyData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3A5C6E" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#B8CED9' }}
                  stroke="#3A5C6E"
                  tickFormatter={(d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                />
                <YAxis tickFormatter={(v: number) => `${currencySymbol}${(v / 100).toFixed(0)}`} tick={{ fontSize: 12, fill: '#B8CED9' }} stroke="#3A5C6E" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1E313B', border: '1px solid #3A5C6E', borderRadius: '8px', color: '#B8CED9' }}
                  labelStyle={{ color: '#B8CED9' }}
                  formatter={(value: number) => [formatCurrency(value, currency), 'Sales']}
                  labelFormatter={(d: string) => new Date(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                />
                <Bar dataKey="total_sales" fill="#FB731E" radius={[4, 4, 0, 0]} name="Sales" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">Daily Breakdown</CardTitle>
            <ExportButton onClick={handleExport} />
          </div>
          <CardDescription>{isMultiLocation ? 'Sales per day across all locations' : 'Sales figures per day'}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {rawRows.length > 0 ? (
            isMultiLocation ? (
              /* ── Pivot table: dates as rows, locations as columns ── */
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full border-collapse text-xs">
                  <thead className="sticky top-0 z-20">
                    <tr className="border-b border-border bg-muted">
                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground uppercase tracking-wider sticky left-0 bg-muted z-30 whitespace-nowrap min-w-[100px]">Date</th>
                      {locationList.map(([locId, locName]) => (
                        <th key={locId} className="px-3 py-2 text-right font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{locName}</th>
                      ))}
                      <th className="px-3 py-2 text-right font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {sortedDates.map((date, i) => {
                      const locData = pivotMap[date] || {}
                      const dayTotal = Object.values(locData).reduce((s, d) => s + d.sales, 0)
                      return (
                        <tr key={date} className={`hover:bg-muted/30 transition-colors ${i % 2 === 0 ? '' : 'bg-muted/10'}`}>
                          <td className={`px-3 py-1.5 font-medium text-foreground sticky left-0 z-10 whitespace-nowrap ${i % 2 === 0 ? 'bg-background' : 'bg-muted/10'}`}>
                            {new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                          </td>
                          {locationList.map(([locId]) => {
                            const cell = locData[locId]
                            return (
                              <td key={locId} className="px-3 py-1.5 text-right text-foreground whitespace-nowrap tabular-nums">
                                {cell ? formatCurrency(cell.sales, currency) : <span className="text-muted-foreground/50">—</span>}
                              </td>
                            )
                          })}
                          <td className="px-3 py-1.5 text-right font-semibold text-foreground whitespace-nowrap tabular-nums">
                            {formatCurrency(dayTotal, currency)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot className="sticky bottom-0 z-20">
                    <tr className="border-t-2 border-border bg-muted">
                      <td className="px-3 py-2 font-semibold text-foreground sticky left-0 bg-muted z-30">Total</td>
                      {locationList.map(([locId]) => {
                        const locTotal = sortedDates.reduce((s, d) => s + (pivotMap[d]?.[locId]?.sales || 0), 0)
                        return (
                          <td key={locId} className="px-3 py-2 text-right font-semibold text-foreground whitespace-nowrap tabular-nums">
                            {formatCurrency(locTotal, currency)}
                          </td>
                        )
                      })}
                      <td className="px-3 py-2 text-right font-semibold text-primary whitespace-nowrap tabular-nums">
                        {formatCurrency(rawRows.reduce((sum, d) => sum + d.total_sales, 0), currency)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              /* ── Single location: simple date rows ── */
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full border-collapse text-xs">
                  <thead className="sticky top-0 z-20">
                    <tr className="border-b border-border bg-muted">
                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Date</th>
                      <th className="px-3 py-2 text-right font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Transactions</th>
                      <th className="px-3 py-2 text-right font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Avg Transaction</th>
                      <th className="px-3 py-2 text-right font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Total Sales</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {rawRows.map((row, idx) => {
                      const avg = row.transaction_count > 0 ? row.total_sales / row.transaction_count : 0
                      return (
                        <tr key={`${row.date}-${idx}`} className={`hover:bg-muted/30 transition-colors ${idx % 2 === 0 ? '' : 'bg-muted/10'}`}>
                          <td className="px-3 py-1.5 font-medium text-foreground whitespace-nowrap">
                            {new Date(row.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                          </td>
                          <td className="px-3 py-1.5 text-right text-foreground tabular-nums">
                            {row.transaction_count.toLocaleString()}
                          </td>
                          <td className="px-3 py-1.5 text-right text-muted-foreground tabular-nums">
                            {formatCurrency(avg, currency)}
                          </td>
                          <td className="px-3 py-1.5 text-right font-semibold text-foreground tabular-nums">
                            {formatCurrency(row.total_sales, currency)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot className="sticky bottom-0 z-20">
                    <tr className="border-t-2 border-border bg-muted">
                      <td className="px-3 py-2 font-semibold text-foreground">Total</td>
                      <td className="px-3 py-2 text-right font-semibold text-foreground tabular-nums">
                        {rawRows.reduce((sum, d) => sum + d.transaction_count, 0).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right text-muted-foreground">—</td>
                      <td className="px-3 py-2 text-right font-semibold text-primary tabular-nums">
                        {formatCurrency(rawRows.reduce((sum, d) => sum + d.total_sales, 0), currency)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">No sales data for the selected period.</p>
          )}
        </CardContent>
      </Card>
    </ReportLayout>
  )
}
