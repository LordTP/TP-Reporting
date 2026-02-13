import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { useReportFilters } from './useReportFilters'
import ReportLayout from './ReportLayout'
import KPICard from '@/components/charts/KPICard'
import { Target, DollarSign, TrendingUp, MapPin } from 'lucide-react'
import ExportButton from '@/components/ExportButton'
import { exportToExcel, penceToPounds, formatDateForExcel } from './exportToExcel'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount / 100)
}

interface BudgetPerformance {
  location_id: string
  location_name: string
  date: string
  budget_amount: number
  actual_sales: number
  variance: number
  variance_percentage: number
  attainment_percentage: number
  currency: string
  status: string
}

interface BudgetReport {
  performances: BudgetPerformance[]
  summary: {
    total_budget: number
    total_sales: number
    overall_variance: number
    overall_attainment_percentage: number
    locations_on_target: number
    total_locations: number
  }
}

export default function BudgetVsActualReport() {
  const filters = useReportFilters()

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['report-budget', filters.datePreset, filters.customStartDate, filters.customEndDate, filters.selectedLocation, filters.selectedClient, filters.selectedClientGroup],
    queryFn: () => {
      const params = filters.buildQueryParams()
      return apiClient.get<BudgetReport>(`/budgets/performance/report?${params}`)
    },
    enabled: filters.isDateRangeReady,
  })

  const performances = data?.performances || []
  const summary = data?.summary

  const handleExport = () => {
    const headers = ['Location', 'Date', 'Budget', 'Actual', 'Variance', 'Attainment %', 'Status']
    const rows = performances.map(p => [
      p.location_name,
      formatDateForExcel(p.date),
      penceToPounds(p.budget_amount),
      penceToPounds(p.actual_sales),
      penceToPounds(p.variance),
      `${p.attainment_percentage}%`,
      p.status === 'exceeded' ? 'Exceeded' : p.status === 'on_track' ? 'On Track' : 'Below Target',
    ] as (string | number)[])
    exportToExcel([{ name: 'Budget vs Actual', headers, rows }], 'Budget_vs_Actual')
  }

  // Aggregate by location for the chart
  const locationMap = new Map<string, { name: string; budget: number; actual: number }>()
  for (const p of performances) {
    const existing = locationMap.get(p.location_id)
    if (existing) {
      existing.budget += p.budget_amount
      existing.actual += p.actual_sales
    } else {
      locationMap.set(p.location_id, { name: p.location_name, budget: p.budget_amount, actual: p.actual_sales })
    }
  }
  const chartData = Array.from(locationMap.values()).map(l => ({
    name: l.name.length > 20 ? l.name.substring(0, 18) + '...' : l.name,
    fullName: l.name,
    budget: l.budget,
    actual: l.actual,
  }))

  const statusColor = (status: string) => {
    if (status === 'exceeded') return 'text-green-600'
    if (status === 'on_track') return 'text-yellow-600'
    return 'text-red-600'
  }
  const statusLabel = (status: string) => {
    if (status === 'exceeded') return 'Exceeded'
    if (status === 'on_track') return 'On Track'
    return 'Below Target'
  }

  return (
    <ReportLayout
      title="Budget vs Actual"
      description={`Budget performance analysis - ${filters.dateRangeLabel}`}
      filters={filters}
      onRefresh={() => refetch()}
      isLoading={isLoading}
    >
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <KPICard
          title="Total Budget"
          value={summary?.total_budget || 0}
          format="currency"
          currency="GBP"
          icon={<Target className="h-4 w-4" />}
          description={filters.dateRangeLabel}
          accentColor="#f59e0b"
        />
        <KPICard
          title="Actual Sales"
          value={summary?.total_sales || 0}
          format="currency"
          currency="GBP"
          icon={<DollarSign className="h-4 w-4" />}
          description="Excl. tax & refunds"
          accentColor="#f59e0b"
        />
        <KPICard
          title="Attainment"
          value={`${summary?.overall_attainment_percentage || 0}%`}
          icon={<TrendingUp className="h-4 w-4" />}
          description={summary?.overall_variance
            ? `${summary.overall_variance >= 0 ? '+' : ''}${formatCurrency(summary.overall_variance, 'GBP')}`
            : 'No data'}
          accentColor={summary && summary.overall_attainment_percentage >= 90 ? '#10b981' : '#ef4444'}
        />
        <KPICard
          title="On Target"
          value={`${summary?.locations_on_target || 0} / ${summary?.total_locations || 0}`}
          icon={<MapPin className="h-4 w-4" />}
          description="Locations ≥90% attainment"
          accentColor="#6366f1"
        />
      </div>

      {chartData.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Budget vs Actual by Location</CardTitle>
            <CardDescription>Comparison across stores</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(300, chartData.length * 50)}>
              <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3A5C6E" />
                <XAxis type="number" tickFormatter={(v: number) => `£${(v / 100).toFixed(0)}`} tick={{ fontSize: 12, fill: '#B8CED9' }} stroke="#3A5C6E" />
                <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: '#B8CED9' }} stroke="#3A5C6E" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1E313B', border: '1px solid #3A5C6E', borderRadius: '8px', color: '#B8CED9' }}
                  labelStyle={{ color: '#B8CED9' }}
                  formatter={(value: number) => [formatCurrency(value, 'GBP')]}
                  labelFormatter={(_: string, payload: any[]) => payload?.[0]?.payload?.fullName || ''}
                />
                <Legend wrapperStyle={{ color: '#B8CED9' }} />
                <Bar dataKey="budget" fill="#94a3b8" radius={[0, 4, 4, 0]} name="Budget" />
                <Bar dataKey="actual" fill="#f59e0b" radius={[0, 4, 4, 0]} name="Actual" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">Budget Performance Detail</CardTitle>
            <ExportButton onClick={handleExport} />
          </div>
          <CardDescription>Per location and date</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {performances.length > 0 ? (
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Location</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Budget</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actual</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Variance</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Attainment</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {performances.map((p, i) => (
                    <tr key={`${p.location_id}-${p.date}-${i}`} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2.5 text-sm font-medium text-foreground">{p.location_name}</td>
                      <td className="px-4 py-2.5 text-sm text-muted-foreground">
                        {new Date(p.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-right text-muted-foreground">{formatCurrency(p.budget_amount, p.currency)}</td>
                      <td className="px-4 py-2.5 text-sm text-right font-semibold text-foreground">{formatCurrency(p.actual_sales, p.currency)}</td>
                      <td className={`px-4 py-2.5 text-sm text-right font-medium ${p.variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {p.variance >= 0 ? '+' : ''}{formatCurrency(p.variance, p.currency)}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-right text-foreground">{p.attainment_percentage}%</td>
                      <td className={`px-4 py-2.5 text-sm font-medium ${statusColor(p.status)}`}>{statusLabel(p.status)}</td>
                    </tr>
                  ))}
                </tbody>
                {summary && (
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted/40">
                      <td className="px-4 py-3 text-sm font-semibold text-foreground" colSpan={2}>Total</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-foreground">{formatCurrency(summary.total_budget, 'GBP')}</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-primary">{formatCurrency(summary.total_sales, 'GBP')}</td>
                      <td className={`px-4 py-3 text-sm text-right font-semibold ${summary.overall_variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {summary.overall_variance >= 0 ? '+' : ''}{formatCurrency(summary.overall_variance, 'GBP')}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-foreground">{summary.overall_attainment_percentage}%</td>
                      <td className="px-4 py-3" />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">No budget data for the selected period. Set budgets in the Admin panel to see comparisons.</p>
          )}
        </CardContent>
      </Card>
    </ReportLayout>
  )
}
