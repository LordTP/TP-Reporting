import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { useReportFilters } from './useReportFilters'
import ReportLayout from './ReportLayout'
import KPICard from '@/components/charts/KPICard'
import { RotateCcw, DollarSign, Percent, Hash } from 'lucide-react'
import ExportButton from '@/components/ExportButton'
import { exportToExcel, penceToPounds, formatDateForExcel } from './exportToExcel'
import { CurrencyBreakdownAnnotation, CurrencyBreakdownItem } from './CurrencyBreakdown'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, ComposedChart } from 'recharts'

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount / 100)
}

export default function RefundReport() {
  const filters = useReportFilters()

  const { data: summaryData, isLoading: summaryLoading, refetch: refetchSummary } = useQuery({
    queryKey: ['report-refunds-summary', filters.datePreset, filters.selectedLocation, filters.selectedClient],
    queryFn: () => {
      const params = filters.buildDaysQueryParams()
      return apiClient.get<{
        total_refunds: number
        total_refund_amount: number
        refund_rate: number
        currency: string
        by_currency?: CurrencyBreakdownItem[]
      }>(`/sales/analytics/refunds?${params}`)
    },
  })

  const { data: dailyData, isLoading: dailyLoading } = useQuery({
    queryKey: ['report-refunds-daily', filters.datePreset, filters.selectedLocation, filters.selectedClient],
    queryFn: () => {
      const params = filters.buildDaysQueryParams()
      return apiClient.get<Array<{
        date: string
        total_orders: number
        total_sales: number
        refund_count: number
        refund_amount: number
        refund_rate: number
      }>>(`/sales/analytics/refunds-daily?${params}`)
    },
  })

  const isLoading = summaryLoading || dailyLoading

  const handleExport = () => {
    const daily = dailyData || []
    const headers = ['Date', 'Orders', 'Refunds', 'Refund Amount', 'Refund Rate']
    const rows = daily.map(d => [
      formatDateForExcel(d.date),
      d.total_orders,
      d.refund_count,
      penceToPounds(d.refund_amount),
      `${d.refund_rate}%`,
    ] as (string | number)[])
    exportToExcel([{ name: 'Refunds', headers, rows }], 'Refund_Report')
  }

  const currency = summaryData?.currency || 'GBP'
  const currencySymbol = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : '$'
  const daily = dailyData || []
  const daysWithRefunds = daily.filter(d => d.refund_count > 0).length

  return (
    <ReportLayout
      title="Refund Report"
      description={`Refund analysis - ${filters.dateRangeLabel}`}
      filters={filters}
      onRefresh={() => refetchSummary()}
      isLoading={isLoading}
    >
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <KPICard
          title="Total Refunds"
          value={summaryData?.total_refunds || 0}
          format="number"
          icon={<RotateCcw className="h-4 w-4" />}
          description={`${daysWithRefunds} days with refunds`}
          accentColor="#10b981"
        />
        <KPICard
          title="Refund Amount"
          value={summaryData?.total_refund_amount || 0}
          format="currency"
          currency={currency}
          icon={<DollarSign className="h-4 w-4" />}
          description={filters.dateRangeLabel}
          accentColor="#ef4444"
          annotation={<CurrencyBreakdownAnnotation breakdown={summaryData?.by_currency} />}
        />
        <KPICard
          title="Refund Rate"
          value={`${summaryData?.refund_rate || 0}%`}
          icon={<Percent className="h-4 w-4" />}
          description="Of all transactions"
          accentColor="#f59e0b"
        />
        <KPICard
          title="Avg Refund"
          value={summaryData?.total_refunds && summaryData.total_refunds > 0
            ? Math.round(summaryData.total_refund_amount / summaryData.total_refunds)
            : 0}
          format="currency"
          currency={currency}
          icon={<Hash className="h-4 w-4" />}
          description="Per refunded order"
          accentColor="#6366f1"
        />
      </div>

      {daily.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Refund Trends</CardTitle>
            <CardDescription>Refund amount and rate over time</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={daily} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3A5C6E" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#B8CED9' }} stroke="#3A5C6E" tickFormatter={(d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} />
                <YAxis yAxisId="amount" tickFormatter={(v: number) => `${currencySymbol}${(v / 100).toFixed(0)}`} tick={{ fontSize: 12, fill: '#B8CED9' }} stroke="#3A5C6E" />
                <YAxis yAxisId="rate" orientation="right" tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 12, fill: '#B8CED9' }} stroke="#3A5C6E" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1E313B', border: '1px solid #3A5C6E', borderRadius: '8px', color: '#B8CED9' }}
                  labelStyle={{ color: '#B8CED9' }}
                  formatter={(value: number, name: string) => {
                    if (name === 'Refund Amount') return [formatCurrency(value, currency), name]
                    return [`${value}%`, name]
                  }}
                  labelFormatter={(d: string) => new Date(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                />
                <Bar yAxisId="amount" dataKey="refund_amount" fill="#ef4444" radius={[4, 4, 0, 0]} name="Refund Amount" />
                <Line yAxisId="rate" dataKey="refund_rate" stroke="#f59e0b" strokeWidth={2} dot={false} name="Refund Rate" />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">Daily Refund Breakdown</CardTitle>
            <ExportButton onClick={handleExport} />
          </div>
          <CardDescription>Refunds per day</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {daily.length > 0 ? (
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Orders</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Refunds</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Amount</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {daily.map((day) => (
                    <tr key={day.date} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2.5 text-sm font-medium text-foreground">
                        {new Date(day.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-right text-foreground">{day.total_orders.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-sm text-right text-foreground">{day.refund_count}</td>
                      <td className="px-4 py-2.5 text-sm text-right font-semibold text-foreground">
                        {day.refund_amount > 0 ? formatCurrency(day.refund_amount, currency) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-right text-muted-foreground">{day.refund_rate}%</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/40">
                    <td className="px-4 py-3 text-sm font-semibold text-foreground">Total</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-foreground">{daily.reduce((s, d) => s + d.total_orders, 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-foreground">{summaryData?.total_refunds || 0}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-primary">{formatCurrency(summaryData?.total_refund_amount || 0, currency)}</td>
                    <td className="px-4 py-3 text-sm text-right text-muted-foreground">{summaryData?.refund_rate || 0}%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">No refund data for the selected period.</p>
          )}
        </CardContent>
      </Card>
    </ReportLayout>
  )
}
