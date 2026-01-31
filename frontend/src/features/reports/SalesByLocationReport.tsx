import React, { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { useReportFilters } from './useReportFilters'
import ReportLayout from './ReportLayout'
import KPICard from '@/components/charts/KPICard'
import { MapPin, DollarSign, TrendingUp, Hash, ChevronRight, ChevronDown } from 'lucide-react'
import ExportButton from '@/components/ExportButton'
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

  // Fetch location groups
  const { data: locationGroupsData } = useQuery({
    queryKey: ['location-groups'],
    queryFn: () => apiClient.get<{ location_groups: Array<{ id: string; name: string; location_ids: string[] }> }>('/location-groups'),
  })

  const locations = locationsData?.locations || []
  const totalSales = locations.reduce((sum, l) => sum + l.total_sales, 0)
  const totalTransactions = locations.reduce((sum, l) => sum + l.total_transactions, 0)
  const bestLocation = locations.length > 0 ? locations[0] : null
  const avgPerLocation = locations.length > 0 ? Math.round(totalSales / locations.length) : 0
  const currency = bestLocation?.currency || 'GBP'
  const currencySymbol = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency

  // Group expansion state
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  // Process locations into grouped + ungrouped rows
  const processedData = useMemo(() => {
    if (!locations.length) return []
    const groups = locationGroupsData?.location_groups || []
    const result: any[] = []
    const groupedLocationIds = new Set<string>()

    for (const group of groups) {
      const children = locations.filter(loc => group.location_ids.includes(loc.location_id))
      if (children.length === 0) continue

      children.forEach(loc => groupedLocationIds.add(loc.location_id))

      const groupTransactions = children.reduce((s, l) => s + l.total_transactions, 0)
      const groupSales = children.reduce((s, l) => s + l.total_sales, 0)

      result.push({
        id: group.id,
        isGroup: true,
        name: group.name,
        total_sales: groupSales,
        total_transactions: groupTransactions,
        average_transaction: groupTransactions > 0 ? Math.round(groupSales / groupTransactions) : 0,
        currency: 'GBP',
        children: children.sort((a, b) => b.total_sales - a.total_sales),
      })
    }

    // Add ungrouped locations
    for (const loc of locations) {
      if (!groupedLocationIds.has(loc.location_id)) {
        result.push({
          id: loc.location_id,
          isGroup: false,
          name: loc.location_name,
          ...loc,
        })
      }
    }

    return result.sort((a, b) => b.total_sales - a.total_sales)
  }, [locations, locationGroupsData])

  const handleExport = () => {
    const headers = ['#', 'Location', 'Currency', 'Transactions', 'Avg Transaction', 'Total Sales', '% Share']
    const rows: (string | number)[][] = []
    let idx = 1
    for (const item of processedData) {
      if (item.isGroup) {
        rows.push([
          idx++,
          `${item.name} (Group)`,
          'GBP',
          item.total_transactions,
          penceToPounds(item.total_transactions > 0 ? Math.round(item.total_sales / item.total_transactions) : 0),
          penceToPounds(item.total_sales),
          totalSales > 0 ? `${((item.total_sales / totalSales) * 100).toFixed(1)}%` : '0%',
        ])
        for (const child of item.children) {
          rows.push([
            '',
            `  └ ${child.location_name}`,
            child.currency,
            child.total_transactions,
            penceToPounds(child.average_transaction),
            penceToPounds(child.total_sales),
            totalSales > 0 ? `${((child.total_sales / totalSales) * 100).toFixed(1)}%` : '0%',
          ])
        }
      } else {
        rows.push([
          idx++,
          item.name,
          item.currency || 'GBP',
          item.total_transactions,
          penceToPounds(item.average_transaction),
          penceToPounds(item.total_sales),
          totalSales > 0 ? `${((item.total_sales / totalSales) * 100).toFixed(1)}%` : '0%',
        ])
      }
    }
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

      {/* Chart - keep using raw locations, no grouping */}
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

      {/* Table - grouped */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">Location Breakdown</CardTitle>
            <ExportButton onClick={handleExport} />
          </div>
          <CardDescription>Detailed performance per location</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {processedData.length > 0 ? (
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
                  {processedData.map((item: any, index: number) => (
                    <React.Fragment key={item.id}>
                      {/* Group row or ungrouped location row */}
                      <tr
                        className={`transition-colors ${item.isGroup ? 'bg-muted/20 hover:bg-muted/40 cursor-pointer' : 'hover:bg-muted/30'}`}
                        onClick={item.isGroup ? () => toggleGroup(item.id) : undefined}
                      >
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {item.isGroup ? (
                            expandedGroups.has(item.id)
                              ? <ChevronDown className="h-4 w-4 text-primary" />
                              : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            index + 1
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-foreground">
                          <div className="flex items-center gap-2">
                            <span className={item.isGroup ? 'font-semibold' : ''}>{item.name}</span>
                            {item.isGroup && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary font-normal">
                                {item.children.length} locations
                              </span>
                            )}
                            {!item.isGroup && item.currency && item.currency !== 'GBP' && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-normal">
                                {item.currency}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-foreground">{item.total_transactions.toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm text-right text-muted-foreground">
                          {formatCurrency(item.average_transaction, item.currency || 'GBP')}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-semibold text-foreground">
                          {formatCurrency(item.total_sales, item.isGroup ? 'GBP' : (item.currency || 'GBP'))}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-muted-foreground">
                          {totalSales > 0 ? `${((item.total_sales / totalSales) * 100).toFixed(1)}%` : '0%'}
                        </td>
                      </tr>

                      {/* Expanded child rows */}
                      {item.isGroup && expandedGroups.has(item.id) && item.children.map((child: any) => (
                        <tr key={child.location_id} className="bg-muted/5 hover:bg-muted/15 transition-colors">
                          <td className="px-4 py-2.5 text-sm text-muted-foreground" />
                          <td className="px-4 py-2.5 text-sm text-muted-foreground pl-10">
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground/50">└</span>
                              {child.location_name}
                              {child.currency !== 'GBP' && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-normal">
                                  {child.currency}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-sm text-right text-muted-foreground">{child.total_transactions.toLocaleString()}</td>
                          <td className="px-4 py-2.5 text-sm text-right text-muted-foreground/70">
                            {formatCurrency(child.average_transaction, child.currency)}
                          </td>
                          <td className="px-4 py-2.5 text-sm text-right text-muted-foreground">
                            {formatCurrency(child.total_sales, child.currency)}
                          </td>
                          <td className="px-4 py-2.5 text-sm text-right text-muted-foreground/70">
                            {totalSales > 0 ? `${((child.total_sales / totalSales) * 100).toFixed(1)}%` : '0%'}
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
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
