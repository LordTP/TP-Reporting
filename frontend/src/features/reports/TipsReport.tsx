import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { useReportFilters } from './useReportFilters'
import ReportLayout from './ReportLayout'
import KPICard from '@/components/charts/KPICard'
import { Coins, DollarSign, Percent, Hash } from 'lucide-react'
import ExportButton from '@/components/ExportButton'
import { exportToExcel, penceToPounds, formatDateForExcel } from './exportToExcel'
import { CurrencyBreakdownAnnotation, CurrencyBreakdownItem } from './CurrencyBreakdown'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount / 100)
}

interface TipsData {
  total_tips: number
  total_sales: number
  total_transactions: number
  tipped_transactions: number
  tip_rate: number
  daily: Array<{ date: string; tips: number; sales: number; tipped_count: number }>
  by_location: Array<{ location_name: string; tips: number; sales: number; tipped_count: number }>
  by_method: Array<{ method: string; tips: number; tipped_count: number }>
  currency: string
  by_currency?: CurrencyBreakdownItem[]
}

export default function TipsReport() {
  const filters = useReportFilters()

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['report-tips', filters.datePreset, filters.customStartDate, filters.customEndDate, filters.selectedLocation, filters.selectedClient, filters.selectedClientGroup],
    queryFn: () => {
      const params = filters.buildDaysQueryParams()
      return apiClient.get<TipsData>(`/sales/analytics/tips-summary?${params}`)
    },
    enabled: filters.isDateRangeReady,
  })

  const currency = data?.currency || 'GBP'
  const currencySymbol = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : '$'
  const daily = data?.daily || []
  const byLocation = data?.by_location || []
  const byMethod = data?.by_method || []
  const handleExport = () => {
    const sheets: Array<{ name: string; headers: string[]; rows: (string | number)[][] }> = []
    sheets.push({
      name: 'Daily Tips',
      headers: ['Date', 'Tips', 'Sales', 'Tipped Orders', 'Tip Rate'],
      rows: daily.map(d => [
        formatDateForExcel(d.date),
        penceToPounds(d.tips),
        penceToPounds(d.sales),
        d.tipped_count,
        d.sales > 0 ? `${((d.tips / d.sales) * 100).toFixed(1)}%` : '0%',
      ]),
    })
    sheets.push({
      name: 'Tips by Location',
      headers: ['Location', 'Tips', 'Tipped Orders', 'Tip Rate'],
      rows: byLocation.map(loc => [
        loc.location_name,
        penceToPounds(loc.tips),
        loc.tipped_count,
        loc.sales > 0 ? `${((loc.tips / loc.sales) * 100).toFixed(1)}%` : '0%',
      ]),
    })
    if (byMethod.length > 0) {
      sheets.push({
        name: 'Tips by Method',
        headers: ['Method', 'Tips', 'Count'],
        rows: byMethod.map(m => [m.method, penceToPounds(m.tips), m.tipped_count]),
      })
    }
    exportToExcel(sheets, 'Tips_Report')
  }

  const tipPercentage = data?.total_transactions && data.total_transactions > 0
    ? ((data.tipped_transactions / data.total_transactions) * 100).toFixed(1)
    : '0'

  return (
    <ReportLayout
      title="Tips Report"
      description={`Tips received breakdown - ${filters.dateRangeLabel}`}
      filters={filters}
      onRefresh={() => refetch()}
      isLoading={isLoading}
    >
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <KPICard
          title="Total Tips"
          value={data?.total_tips || 0}
          format="currency"
          currency={currency}
          icon={<Coins className="h-4 w-4" />}
          description={filters.dateRangeLabel}
          accentColor="#10b981"
          annotation={<CurrencyBreakdownAnnotation breakdown={data?.by_currency} />}
        />
        <KPICard
          title="Tip Rate"
          value={`${data?.tip_rate || 0}%`}
          icon={<Percent className="h-4 w-4" />}
          description="Tips / Sales"
          accentColor="#FB731E"
        />
        <KPICard
          title="Tipped Orders"
          value={data?.tipped_transactions || 0}
          format="number"
          icon={<Hash className="h-4 w-4" />}
          description={`${tipPercentage}% of orders`}
          accentColor="#6366f1"
        />
        <KPICard
          title="Avg Tip"
          value={data?.tipped_transactions && data.tipped_transactions > 0
            ? Math.round(data.total_tips / data.tipped_transactions)
            : 0}
          format="currency"
          currency={currency}
          icon={<DollarSign className="h-4 w-4" />}
          description="Per tipped order"
          accentColor="#f59e0b"
        />
      </div>

      {daily.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Daily Tips</CardTitle>
            <CardDescription>Tips received per day</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={daily} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3A5C6E" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#B8CED9' }} stroke="#3A5C6E" tickFormatter={(d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} />
                <YAxis tickFormatter={(v: number) => `${currencySymbol}${(v / 100).toFixed(0)}`} tick={{ fontSize: 12, fill: '#B8CED9' }} stroke="#3A5C6E" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1E313B', border: '1px solid #3A5C6E', borderRadius: '8px', color: '#B8CED9' }}
                  labelStyle={{ color: '#B8CED9' }}
                  formatter={(value: number) => [formatCurrency(value, currency), 'Tips']}
                  labelFormatter={(d: string) => new Date(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                />
                <Bar dataKey="tips" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* By Location */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Tips by Location</CardTitle>
              <ExportButton onClick={handleExport} />
            </div>
            <CardDescription>Tips received per store</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {byLocation.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Location</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tips</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tipped Orders</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tip Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {byLocation.map((loc) => (
                      <tr key={loc.location_name} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-2.5 text-sm font-medium text-foreground">{loc.location_name}</td>
                        <td className="px-4 py-2.5 text-sm text-right font-semibold text-foreground">{formatCurrency(loc.tips, currency)}</td>
                        <td className="px-4 py-2.5 text-sm text-right text-foreground">{loc.tipped_count}</td>
                        <td className="px-4 py-2.5 text-sm text-right text-muted-foreground">
                          {loc.sales > 0 ? `${((loc.tips / loc.sales) * 100).toFixed(1)}%` : '0%'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted/40">
                      <td className="px-4 py-3 text-sm font-semibold text-foreground">Total</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-primary">{formatCurrency(data?.total_tips || 0, currency)}</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-foreground">{data?.tipped_transactions || 0}</td>
                      <td className="px-4 py-3 text-sm text-right text-muted-foreground">{data?.tip_rate || 0}%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">No data for the selected period.</p>
            )}
          </CardContent>
        </Card>

        {/* By Payment Method */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Tips by Method</CardTitle>
            <CardDescription>By payment type</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {byMethod.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Method</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tips</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Count</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {byMethod.map((m) => (
                      <tr key={m.method} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-2.5 text-sm font-medium text-foreground">{m.method}</td>
                        <td className="px-4 py-2.5 text-sm text-right font-semibold text-foreground">{formatCurrency(m.tips, currency)}</td>
                        <td className="px-4 py-2.5 text-sm text-right text-muted-foreground">{m.tipped_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">No data</p>
            )}
          </CardContent>
        </Card>
      </div>
    </ReportLayout>
  )
}
