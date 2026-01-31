import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { useReportFilters } from './useReportFilters'
import ReportLayout from './ReportLayout'
import KPICard from '@/components/charts/KPICard'
import { MapPin, DollarSign, TrendingUp, Hash, Download } from 'lucide-react'
import { exportToExcel, penceToPounds } from './exportToExcel'
import { CurrencyBreakdownAnnotation, CurrencyBreakdownItem } from './CurrencyBreakdown'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount / 100)
}

export default function SalesByLocationReport() {
  const filters = useReportFilters()

  const { data: locationsData, isLoading, refetch } = useQuery({
    queryKey: ['report-locations', filters.datePreset, filters.selectedLocation, filters.selectedClient],
    queryFn: () => apiClient.get<{
      locations: Array<{
        location_id: string
        location_name: string
        total_sales: number
        total_transactions: number
        average_transaction: number
        currency: string
      }>
      by_currency?: CurrencyBreakdownItem[]
    }>(`/sales/analytics/sales-by-location?${filters.buildQueryParams()}`),
  })

  const locations = locationsData?.locations || []
  const totalSales = locations.reduce((sum, l) => sum + l.total_sales, 0)
  const totalTransactions = locations.reduce((sum, l) => sum + l.total_transactions, 0)
  const bestLocation = locations.length > 0 ? locations[0] : null
  const avgPerLocation = locations.length > 0 ? Math.round(totalSales / locations.length) : 0
  const currency = bestLocation?.currency || 'GBP'
  const currencySymbol = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency

  const handleExport = () => {
    const headers = ['#', 'Location', 'Currency', 'Transactions', 'Avg Transaction', 'Total Sales', '% Share']
    const rows = locations.map((loc, i) => [
      i + 1,
      loc.location_name,
      loc.currency,
      loc.total_transactions,
      penceToPounds(loc.average_transaction),
      penceToPounds(loc.total_sales),
      totalSales > 0 ? `${((loc.total_sales / totalSales) * 100).toFixed(1)}%` : '0%',
    ] as (string | number)[])
    exportToExcel([{ name: 'Sales by Location', headers, rows }], 'Sales_by_Location')
  }

  const chartData = locations.map(l => ({
    name: l.location_name.length > 20 ? l.location_name.substring(0, 18) + '...' : l.location_name,
    fullName: l.location_name,
    sales: l.total_sales,
  }))

  return (
    <ReportLayout
      title="Sales by Location"
      description={`Location performance comparison - ${filters.dateRangeLabel}`}
      filters={filters}
      onRefresh={() => refetch()}
      isLoading={isLoading}
    >
      {/* KPIs */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <KPICard
          title="Locations"
          value={locations.length}
          format="number"
          icon={<MapPin className="h-4 w-4" />}
          description="With sales data"
          accentColor="#FB731E"
        />
        <KPICard
          title="Total Sales"
          value={totalSales}
          format="currency"
          currency={currency}
          icon={<DollarSign className="h-4 w-4" />}
          description={filters.dateRangeLabel}
          accentColor="#FB731E"
          annotation={<CurrencyBreakdownAnnotation breakdown={locationsData?.by_currency} />}
        />
        <KPICard
          title="Best Performer"
          value={bestLocation?.location_name || 'N/A'}
          icon={<TrendingUp className="h-4 w-4" />}
          description={bestLocation ? formatCurrency(bestLocation.total_sales, currency) : 'No data'}
          accentColor="#10b981"
        />
        <KPICard
          title="Avg per Location"
          value={avgPerLocation}
          format="currency"
          currency={currency}
          icon={<Hash className="h-4 w-4" />}
          description={filters.dateRangeLabel}
          accentColor="#6366f1"
        />
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Sales Comparison</CardTitle>
            <CardDescription>Total sales by location</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(280, chartData.length * 45)}>
              <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3A5C6E" />
                <XAxis type="number" tickFormatter={(v: number) => `${currencySymbol}${(v / 100).toFixed(0)}`} tick={{ fontSize: 12, fill: '#B8CED9' }} stroke="#3A5C6E" />
                <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: '#B8CED9' }} stroke="#3A5C6E" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1E313B', border: '1px solid #3A5C6E', borderRadius: '8px', color: '#B8CED9' }}
                  labelStyle={{ color: '#B8CED9' }}
                  formatter={(value: number) => [formatCurrency(value, currency), 'Sales']}
                  labelFormatter={(_: string, payload: any[]) => payload?.[0]?.payload?.fullName || ''}
                />
                <Bar dataKey="sales" fill="#FB731E" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">Location Breakdown</CardTitle>
            <button onClick={handleExport} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
              <Download className="h-3.5 w-3.5" />
              Export Excel
            </button>
          </div>
          <CardDescription>Detailed performance per location</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {locations.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-8">#</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Location</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Transactions</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Avg Transaction</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Sales</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">% Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {locations.map((location, index) => (
                    <tr key={location.location_id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 text-sm text-muted-foreground">{index + 1}</td>
                      <td className="px-4 py-3 text-sm font-medium text-foreground">
                        <div className="flex items-center gap-2">
                          {location.location_name}
                          {location.currency !== 'GBP' && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-normal">
                              {location.currency}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-foreground">{location.total_transactions.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-right text-muted-foreground">
                        {formatCurrency(location.average_transaction, location.currency)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-foreground">
                        {formatCurrency(location.total_sales, location.currency)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-muted-foreground">
                        {totalSales > 0 ? `${((location.total_sales / totalSales) * 100).toFixed(1)}%` : '0%'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/40">
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3 text-sm font-semibold text-foreground">Total</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-foreground">{totalTransactions.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-right text-muted-foreground">—</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-primary">{formatCurrency(totalSales, currency)}</td>
                    <td className="px-4 py-3 text-sm text-right text-muted-foreground">100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">No location data for the selected period.</p>
          )}
        </CardContent>
      </Card>
    </ReportLayout>
  )
}
