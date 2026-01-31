import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { useReportFilters } from './useReportFilters'
import ReportLayout from './ReportLayout'
import KPICard from '@/components/charts/KPICard'
import { Receipt, DollarSign, Percent, Hash, Download } from 'lucide-react'
import { exportToExcel, penceToPounds, formatDateForExcel } from './exportToExcel'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount / 100)
}

interface TaxData {
  total_tax: number
  total_sales: number
  total_transactions: number
  tax_rate: number
  daily: Array<{ date: string; tax: number; sales: number; transactions: number }>
  by_location: Array<{ location_name: string; tax: number; sales: number; transactions: number }>
  currency: string
}

export default function TaxReport() {
  const filters = useReportFilters()

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['report-tax', filters.datePreset, filters.selectedLocation, filters.selectedClient],
    queryFn: () => {
      const params = filters.buildDaysQueryParams()
      return apiClient.get<TaxData>(`/sales/analytics/tax-summary?${params}`)
    },
  })

  const currency = data?.currency || 'GBP'
  const currencySymbol = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : '$'
  const daily = data?.daily || []
  const byLocation = data?.by_location || []

  const handleExport = () => {
    const sheets: Array<{ name: string; headers: string[]; rows: (string | number)[][] }> = []
    sheets.push({
      name: 'Daily Tax',
      headers: ['Date', 'Sales', 'Tax', 'Rate'],
      rows: daily.map(d => [
        formatDateForExcel(d.date),
        penceToPounds(d.sales),
        penceToPounds(d.tax),
        d.sales > 0 ? `${((d.tax / d.sales) * 100).toFixed(1)}%` : '0%',
      ]),
    })
    sheets.push({
      name: 'Tax by Location',
      headers: ['Location', 'Sales', 'Tax', 'Rate'],
      rows: byLocation.map(loc => [
        loc.location_name,
        penceToPounds(loc.sales),
        penceToPounds(loc.tax),
        loc.sales > 0 ? `${((loc.tax / loc.sales) * 100).toFixed(1)}%` : '0%',
      ]),
    })
    exportToExcel(sheets, 'Tax_Report')
  }

  return (
    <ReportLayout
      title="Tax Report"
      description={`Tax collected breakdown - ${filters.dateRangeLabel}`}
      filters={filters}
      onRefresh={() => refetch()}
      isLoading={isLoading}
    >
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <KPICard
          title="Total Tax Collected"
          value={data?.total_tax || 0}
          format="currency"
          currency={currency}
          icon={<Receipt className="h-4 w-4" />}
          description={filters.dateRangeLabel}
          accentColor="#10b981"
        />
        <KPICard
          title="Total Sales"
          value={data?.total_sales || 0}
          format="currency"
          currency={currency}
          icon={<DollarSign className="h-4 w-4" />}
          description={filters.dateRangeLabel}
          accentColor="#10b981"
        />
        <KPICard
          title="Effective Tax Rate"
          value={`${data?.tax_rate || 0}%`}
          icon={<Percent className="h-4 w-4" />}
          description="Tax / Sales"
          accentColor="#6366f1"
        />
        <KPICard
          title="Transactions"
          value={data?.total_transactions || 0}
          format="number"
          icon={<Hash className="h-4 w-4" />}
          description={filters.dateRangeLabel}
          accentColor="#f59e0b"
        />
      </div>

      {daily.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Daily Tax Collected</CardTitle>
            <CardDescription>Tax collected per day</CardDescription>
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
                  formatter={(value: number) => [formatCurrency(value, currency), 'Tax']}
                  labelFormatter={(d: string) => new Date(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                />
                <Bar dataKey="tax" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Daily Table */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Daily Breakdown</CardTitle>
              <button onClick={handleExport} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
                <Download className="h-3.5 w-3.5" />
                Export Excel
              </button>
            </div>
            <CardDescription>Tax collected per day</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {daily.length > 0 ? (
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <table className="w-full">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sales</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tax</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {daily.map((day) => (
                      <tr key={day.date} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-2.5 text-sm font-medium text-foreground">
                          {new Date(day.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-right text-muted-foreground">{formatCurrency(day.sales, currency)}</td>
                        <td className="px-4 py-2.5 text-sm text-right font-semibold text-foreground">{formatCurrency(day.tax, currency)}</td>
                        <td className="px-4 py-2.5 text-sm text-right text-muted-foreground">
                          {day.sales > 0 ? `${((day.tax / day.sales) * 100).toFixed(1)}%` : '0%'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">No data for the selected period.</p>
            )}
          </CardContent>
        </Card>

        {/* By Location */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Tax by Location</CardTitle>
            <CardDescription>Tax collected per store</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {byLocation.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Location</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sales</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tax</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {byLocation.map((loc) => (
                      <tr key={loc.location_name} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-2.5 text-sm font-medium text-foreground">{loc.location_name}</td>
                        <td className="px-4 py-2.5 text-sm text-right text-muted-foreground">{formatCurrency(loc.sales, currency)}</td>
                        <td className="px-4 py-2.5 text-sm text-right font-semibold text-foreground">{formatCurrency(loc.tax, currency)}</td>
                        <td className="px-4 py-2.5 text-sm text-right text-muted-foreground">
                          {loc.sales > 0 ? `${((loc.tax / loc.sales) * 100).toFixed(1)}%` : '0%'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted/40">
                      <td className="px-4 py-3 text-sm font-semibold text-foreground">Total</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-foreground">{formatCurrency(data?.total_sales || 0, currency)}</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-primary">{formatCurrency(data?.total_tax || 0, currency)}</td>
                      <td className="px-4 py-3 text-sm text-right text-muted-foreground">{data?.tax_rate || 0}%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">No data for the selected period.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </ReportLayout>
  )
}
