import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { useReportFilters } from './useReportFilters'
import ReportLayout from './ReportLayout'
import KPICard from '@/components/charts/KPICard'
import { Clock, DollarSign, ShoppingCart, TrendingUp } from 'lucide-react'
import ExportButton from '@/components/ExportButton'
import { exportToExcel, penceToPounds } from './exportToExcel'
import { CurrencyBreakdownAnnotation, CurrencyBreakdownItem } from './CurrencyBreakdown'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount / 100)
}

function formatHour(hour: number) {
  if (hour === 0) return '12am'
  if (hour < 12) return `${hour}am`
  if (hour === 12) return '12pm'
  return `${hour - 12}pm`
}

export default function HourlySalesPatternReport() {
  const filters = useReportFilters()

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['report-hourly', filters.datePreset, filters.customStartDate, filters.customEndDate, filters.selectedLocation, filters.selectedClient],
    queryFn: () => {
      const params = filters.buildDaysQueryParams()
      return apiClient.get<{
        hours: Array<{
          hour: number
          sales: number
          transactions: number
          items: number
        }>
        by_currency?: CurrencyBreakdownItem[]
      }>(`/sales/analytics/hourly?${params}`)
    },
    enabled: filters.isDateRangeReady,
  })

  const hourlyData = data?.hours || []
  const totalSales = hourlyData.reduce((sum, h) => sum + h.sales, 0)
  const totalTransactions = hourlyData.reduce((sum, h) => sum + h.transactions, 0)
  const totalItems = hourlyData.reduce((sum, h) => sum + h.items, 0)

  const peakHour = hourlyData.length > 0
    ? hourlyData.reduce((best, h) => h.sales > best.sales ? h : best)
    : null
  const peakTransactionHour = hourlyData.length > 0
    ? hourlyData.reduce((best, h) => h.transactions > best.transactions ? h : best)
    : null

  const handleExport = () => {
    const headers = ['Hour', 'Transactions', 'Items', 'Sales', '% Share']
    const rows = hourlyData.filter(h => h.transactions > 0).map(h => [
      formatHour(h.hour),
      h.transactions,
      h.items,
      penceToPounds(h.sales),
      totalSales > 0 ? `${((h.sales / totalSales) * 100).toFixed(1)}%` : '0%',
    ] as (string | number)[])
    exportToExcel([{ name: 'Hourly Sales', headers, rows }], 'Hourly_Sales_Pattern')
  }

  // Only show hours with data for the chart
  const chartData = hourlyData.map(h => ({
    ...h,
    hourLabel: formatHour(h.hour),
  }))

  return (
    <ReportLayout
      title="Hourly Sales Pattern"
      description={`Peak hour analysis - ${filters.dateRangeLabel}`}
      filters={filters}
      onRefresh={() => refetch()}
      isLoading={isLoading}
    >
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <KPICard
          title="Peak Revenue Hour"
          value={peakHour ? formatHour(peakHour.hour) : 'N/A'}
          icon={<Clock className="h-4 w-4" />}
          description={peakHour ? formatCurrency(peakHour.sales, 'GBP') : 'No data'}
          accentColor="#f59e0b"
        />
        <KPICard
          title="Peak Transaction Hour"
          value={peakTransactionHour ? formatHour(peakTransactionHour.hour) : 'N/A'}
          icon={<TrendingUp className="h-4 w-4" />}
          description={peakTransactionHour ? `${peakTransactionHour.transactions} transactions` : 'No data'}
          accentColor="#FB731E"
        />
        <KPICard
          title="Total Sales"
          value={totalSales}
          format="currency"
          currency="GBP"
          icon={<DollarSign className="h-4 w-4" />}
          description={filters.dateRangeLabel}
          accentColor="#f59e0b"
          annotation={<CurrencyBreakdownAnnotation breakdown={data?.by_currency} />}
        />
        <KPICard
          title="Total Items"
          value={totalItems}
          format="number"
          icon={<ShoppingCart className="h-4 w-4" />}
          description={`${totalTransactions.toLocaleString()} transactions`}
          accentColor="#6366f1"
        />
      </div>

      {chartData.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Sales by Hour of Day</CardTitle>
            <CardDescription>Revenue distribution across hours</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3A5C6E" />
                <XAxis dataKey="hourLabel" tick={{ fontSize: 11, fill: '#B8CED9' }} stroke="#3A5C6E" />
                <YAxis tickFormatter={(v: number) => `£${(v / 100).toFixed(0)}`} tick={{ fontSize: 12, fill: '#B8CED9' }} stroke="#3A5C6E" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1E313B', border: '1px solid #3A5C6E', borderRadius: '8px', color: '#B8CED9' }}
                  labelStyle={{ color: '#B8CED9' }}
                  formatter={(value: number, name: string) => {
                    if (name === 'Sales') return [formatCurrency(value, 'GBP'), name]
                    return [value.toLocaleString(), name]
                  }}
                  labelFormatter={(label: string) => `Hour: ${label}`}
                />
                <Bar dataKey="sales" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Sales" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">Hourly Breakdown</CardTitle>
            <ExportButton onClick={handleExport} />
          </div>
          <CardDescription>Sales, transactions, and items per hour</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {hourlyData.some(h => h.transactions > 0) ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Hour</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Transactions</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Items</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sales</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">% Share</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-32">Bar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {hourlyData.filter(h => h.transactions > 0).map((h) => {
                    const pct = totalSales > 0 ? (h.sales / totalSales) * 100 : 0
                    return (
                      <tr key={h.hour} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-2.5 text-sm font-medium text-foreground">{formatHour(h.hour)}</td>
                        <td className="px-4 py-2.5 text-sm text-right text-foreground">{h.transactions.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-sm text-right text-foreground">{h.items.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-sm text-right font-semibold text-foreground">{formatCurrency(h.sales, 'GBP')}</td>
                        <td className="px-4 py-2.5 text-sm text-right text-muted-foreground">{pct.toFixed(1)}%</td>
                        <td className="px-4 py-2.5">
                          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: '#f59e0b' }} />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/40">
                    <td className="px-4 py-3 text-sm font-semibold text-foreground">Total</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-foreground">{totalTransactions.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-foreground">{totalItems.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-primary">{formatCurrency(totalSales, 'GBP')}</td>
                    <td className="px-4 py-3 text-sm text-right text-muted-foreground">100%</td>
                    <td className="px-4 py-3" />
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">No hourly data for the selected period.</p>
          )}
        </CardContent>
      </Card>
    </ReportLayout>
  )
}
