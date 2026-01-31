import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { useReportFilters } from './useReportFilters'
import ReportLayout from './ReportLayout'
import KPICard from '@/components/charts/KPICard'
import { CreditCard, DollarSign, Banknote, TrendingUp, Download } from 'lucide-react'
import { exportToExcel, penceToPounds } from './exportToExcel'
import { CurrencyBreakdownAnnotation, CurrencyBreakdownItem } from './CurrencyBreakdown'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount / 100)
}

const PIE_COLORS = ['#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#ec4899']

export default function SalesByPaymentMethodReport() {
  const filters = useReportFilters()

  const { data: summaryData, isLoading, refetch } = useQuery({
    queryKey: ['report-payment-methods', filters.datePreset, filters.selectedLocation, filters.selectedClient],
    queryFn: () => apiClient.get<{
      total_sales: number
      transaction_count: number
      average_transaction: number
      currency: string
      by_tender_type: Record<string, number>
      by_status: Record<string, number>
      by_currency?: CurrencyBreakdownItem[]
    }>(`/sales/summary?${filters.buildQueryParams()}`),
  })

  const currency = summaryData?.currency || 'GBP'

  const paymentData = useMemo(() => {
    if (!summaryData?.by_tender_type) return []
    return Object.entries(summaryData.by_tender_type)
      .map(([method, amount]) => ({ name: method, value: amount as number }))
      .sort((a, b) => b.value - a.value)
  }, [summaryData])

  const total = paymentData.reduce((sum, p) => sum + p.value, 0)
  const cardSales = paymentData.find(p => p.name === 'CARD' || p.name === 'CARD_PRESENT' || p.name === 'CNP')?.value || 0
  const cashSales = paymentData.find(p => p.name === 'CASH')?.value || 0
  const cardRatio = total > 0 ? ((cardSales / total) * 100).toFixed(0) : '0'

  const handleExport = () => {
    const headers = ['Method', 'Amount', '% Share']
    const rows = paymentData.map(m => [
      m.name,
      penceToPounds(m.value),
      total > 0 ? `${((m.value / total) * 100).toFixed(1)}%` : '0%',
    ] as (string | number)[])
    exportToExcel([{ name: 'Payment Methods', headers, rows }], 'Sales_by_Payment_Method')
  }

  return (
    <ReportLayout
      title="Sales by Payment Method"
      description={`Payment method breakdown - ${filters.dateRangeLabel}`}
      filters={filters}
      onRefresh={() => refetch()}
      isLoading={isLoading}
    >
      {/* KPIs */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <KPICard
          title="Total Sales"
          value={total}
          format="currency"
          currency={currency}
          icon={<DollarSign className="h-4 w-4" />}
          description={filters.dateRangeLabel}
          accentColor="#8b5cf6"
          annotation={<CurrencyBreakdownAnnotation breakdown={summaryData?.by_currency} />}
        />
        <KPICard
          title="Card Sales"
          value={cardSales}
          format="currency"
          currency={currency}
          icon={<CreditCard className="h-4 w-4" />}
          description={`${cardRatio}% of total`}
          accentColor="#6366f1"
        />
        <KPICard
          title="Cash Sales"
          value={cashSales}
          format="currency"
          currency={currency}
          icon={<Banknote className="h-4 w-4" />}
          description={total > 0 ? `${((cashSales / total) * 100).toFixed(0)}% of total` : '0%'}
          accentColor="#10b981"
        />
        <KPICard
          title="Payment Methods"
          value={paymentData.length}
          format="number"
          icon={<TrendingUp className="h-4 w-4" />}
          description="Tender types used"
          accentColor="#f59e0b"
        />
      </div>

      <div className="grid gap-6 md:grid-cols-3 mb-6">
        {/* Pie Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Distribution</CardTitle>
            <CardDescription>Payment method share</CardDescription>
          </CardHeader>
          <CardContent>
            {paymentData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={paymentData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {paymentData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value, currency)} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">No data</p>
            )}
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Payment Method Breakdown</CardTitle>
              <button onClick={handleExport} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
                <Download className="h-3.5 w-3.5" />
                Export Excel
              </button>
            </div>
            <CardDescription>Amount and share by tender type</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {paymentData.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Method</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Amount</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">% Share</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-40">Bar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {paymentData.map((method, index) => {
                      const pct = total > 0 ? (method.value / total) * 100 : 0
                      return (
                        <tr key={method.name} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 text-sm font-medium text-foreground">
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }} />
                              {method.name}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-right font-semibold text-foreground">
                            {formatCurrency(method.value, currency)}
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-muted-foreground">
                            {pct.toFixed(1)}%
                          </td>
                          <td className="px-4 py-3">
                            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{ width: `${pct}%`, backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
                              />
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted/40">
                      <td className="px-4 py-3 text-sm font-semibold text-foreground">Total</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-primary">{formatCurrency(total, currency)}</td>
                      <td className="px-4 py-3 text-sm text-right text-muted-foreground">100%</td>
                      <td className="px-4 py-3" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">No payment data for the selected period.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </ReportLayout>
  )
}
