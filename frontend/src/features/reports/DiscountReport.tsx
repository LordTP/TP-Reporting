import React, { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { useReportFilters } from './useReportFilters'
import ReportLayout from './ReportLayout'
import KPICard from '@/components/charts/KPICard'
import { Percent, DollarSign, Hash, TrendingDown, ChevronRight, ChevronDown } from 'lucide-react'
import ExportButton from '@/components/ExportButton'
import { exportToExcel, penceToPounds, formatDateForExcel } from './exportToExcel'
import { CurrencyBreakdownAnnotation, CurrencyBreakdownItem } from './CurrencyBreakdown'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount / 100)
}

interface DiscountCode {
  name: string
  type: string
  percentage: string | null
  total_amount: number
  usage_count: number
}

interface DiscountData {
  total_discounts: number
  total_sales: number
  total_transactions: number
  discount_rate: number
  daily: Array<{ date: string; discounts: number; sales: number; transactions: number }>
  by_location: Array<{ location_id: string; location_name: string; discounts: number; sales: number; transactions: number }>
  by_code: DiscountCode[]
  currency: string
  by_currency?: CurrencyBreakdownItem[]
}

export default function DiscountReport() {
  const filters = useReportFilters()

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['report-discounts', filters.datePreset, filters.customStartDate, filters.customEndDate, filters.selectedLocation, filters.selectedClient, filters.selectedClientGroup],
    queryFn: () => {
      const params = filters.buildDaysQueryParams()
      return apiClient.get<DiscountData>(`/sales/analytics/discount-summary?${params}`)
    },
    enabled: filters.isDateRangeReady,
  })

  // Fetch location groups
  const { data: locationGroupsData } = useQuery({
    queryKey: ['location-groups'],
    queryFn: () => apiClient.get<{ location_groups: Array<{ id: string; name: string; location_ids: string[] }> }>('/location-groups'),
  })

  const currency = data?.currency || 'GBP'
  const currencySymbol = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : '$'
  const daily = data?.daily || []
  const byLocation = data?.by_location || []
  const byCode = data?.by_code || []
  const topCode = byCode.length > 0 ? byCode[0] : null

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
  const processedLocations = useMemo(() => {
    if (!byLocation.length) return []
    const groups = locationGroupsData?.location_groups || []
    const result: any[] = []
    const groupedLocationIds = new Set<string>()

    for (const group of groups) {
      const children = byLocation.filter(loc => group.location_ids.includes(loc.location_id))
      if (children.length === 0) continue

      children.forEach(loc => groupedLocationIds.add(loc.location_id))

      const groupDiscounts = children.reduce((s, l) => s + l.discounts, 0)
      const groupSales = children.reduce((s, l) => s + l.sales, 0)

      result.push({
        id: group.id,
        isGroup: true,
        name: group.name,
        discounts: groupDiscounts,
        sales: groupSales,
        children: children.sort((a, b) => b.discounts - a.discounts),
      })
    }

    // Add ungrouped locations
    for (const loc of byLocation) {
      if (!groupedLocationIds.has(loc.location_id)) {
        result.push({
          id: loc.location_id,
          isGroup: false,
          name: loc.location_name,
          ...loc,
        })
      }
    }

    return result.sort((a, b) => b.discounts - a.discounts)
  }, [byLocation, locationGroupsData])

  const handleExport = () => {
    const sheets: Array<{ name: string; headers: string[]; rows: (string | number)[][] }> = []
    if (byCode.length > 0) {
      sheets.push({
        name: 'Discount Codes',
        headers: ['#', 'Name', 'Type', 'Times Used', 'Total Amount', '% of Discounts'],
        rows: byCode.map((c, i) => {
          const totalDiscAmount = byCode.reduce((s, x) => s + x.total_amount, 0)
          return [
            i + 1, c.name, c.type, c.usage_count, penceToPounds(c.total_amount),
            totalDiscAmount > 0 ? `${((c.total_amount / totalDiscAmount) * 100).toFixed(1)}%` : '0%',
          ]
        }),
      })
    }
    sheets.push({
      name: 'Daily Discounts',
      headers: ['Date', 'Sales', 'Discounts', 'Rate'],
      rows: daily.map(d => [
        formatDateForExcel(d.date),
        penceToPounds(d.sales),
        penceToPounds(d.discounts),
        d.sales > 0 ? `${((d.discounts / d.sales) * 100).toFixed(1)}%` : '0%',
      ]),
    })

    // Export by location — flattened with group headers and children
    const locRows: (string | number)[][] = []
    for (const item of processedLocations) {
      if (item.isGroup) {
        locRows.push([
          `${item.name} (Group)`,
          penceToPounds(item.sales),
          penceToPounds(item.discounts),
          item.sales > 0 ? `${((item.discounts / item.sales) * 100).toFixed(1)}%` : '0%',
        ])
        for (const child of item.children) {
          locRows.push([
            `  └ ${child.location_name}`,
            penceToPounds(child.sales),
            penceToPounds(child.discounts),
            child.sales > 0 ? `${((child.discounts / child.sales) * 100).toFixed(1)}%` : '0%',
          ])
        }
      } else {
        locRows.push([
          item.name,
          penceToPounds(item.sales),
          penceToPounds(item.discounts),
          item.sales > 0 ? `${((item.discounts / item.sales) * 100).toFixed(1)}%` : '0%',
        ])
      }
    }
    sheets.push({
      name: 'By Location',
      headers: ['Location', 'Sales', 'Discounts', 'Rate'],
      rows: locRows,
    })
    exportToExcel(sheets, 'Discount_Report')
  }

  return (
    <ReportLayout
      title="Discount Report"
      description={`Discounts applied breakdown - ${filters.dateRangeLabel}`}
      filters={filters}
      onRefresh={() => refetch()}
      isLoading={isLoading}
    >
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <KPICard
          title="Total Discounts"
          value={data?.total_discounts || 0}
          format="currency"
          currency={currency}
          icon={<Percent className="h-4 w-4" />}
          description={filters.dateRangeLabel}
          accentColor="#10b981"
          annotation={<CurrencyBreakdownAnnotation breakdown={data?.by_currency} />}
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
          title="Discount Rate"
          value={`${data?.discount_rate || 0}%`}
          icon={<TrendingDown className="h-4 w-4" />}
          description="Discounts / Sales"
          accentColor="#ef4444"
        />
        <KPICard
          title="Top Discount"
          value={topCode?.name || 'N/A'}
          icon={<Hash className="h-4 w-4" />}
          description={topCode ? `${topCode.usage_count} uses, ${formatCurrency(topCode.total_amount, currency)}` : 'No data'}
          accentColor="#f59e0b"
        />
      </div>

      {daily.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Daily Discounts</CardTitle>
            <CardDescription>Discounts applied per day</CardDescription>
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
                  formatter={(value: number) => [formatCurrency(value, currency), 'Discounts']}
                  labelFormatter={(d: string) => new Date(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                />
                <Bar dataKey="discounts" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Discount Codes Breakdown */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">Discount Codes / Names</CardTitle>
            <ExportButton onClick={handleExport} />
          </div>
          <CardDescription>Breakdown by discount code with usage count and total amount</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {byCode.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-8">#</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Discount Name</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Times Used</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Amount</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">% of Discounts</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-32">Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {byCode.map((code, index) => {
                    const totalDiscAmount = byCode.reduce((s, c) => s + c.total_amount, 0)
                    const pct = totalDiscAmount > 0 ? (code.total_amount / totalDiscAmount) * 100 : 0
                    const typeLabel = code.type === 'FIXED_PERCENTAGE' ? `${code.percentage}%` :
                                      code.type === 'FIXED_AMOUNT' ? 'Fixed' :
                                      code.type === 'VARIABLE_PERCENTAGE' ? 'Variable %' :
                                      code.type === 'VARIABLE_AMOUNT' ? 'Variable' : code.type
                    return (
                      <tr key={code.name} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-2.5 text-sm text-muted-foreground">{index + 1}</td>
                        <td className="px-4 py-2.5 text-sm font-medium text-foreground">{code.name}</td>
                        <td className="px-4 py-2.5 text-sm text-muted-foreground">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">
                            {typeLabel}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-sm text-right text-foreground">{code.usage_count.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-sm text-right font-semibold text-foreground">{formatCurrency(code.total_amount, currency)}</td>
                        <td className="px-4 py-2.5 text-sm text-right text-muted-foreground">{pct.toFixed(1)}%</td>
                        <td className="px-4 py-2.5">
                          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all bg-red-500" style={{ width: `${pct}%` }} />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/40">
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3 text-sm font-semibold text-foreground">Total</td>
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3 text-sm text-right font-semibold text-foreground">{byCode.reduce((s, c) => s + c.usage_count, 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-primary">{formatCurrency(byCode.reduce((s, c) => s + c.total_amount, 0), currency)}</td>
                    <td className="px-4 py-3 text-sm text-right text-muted-foreground">100%</td>
                    <td className="px-4 py-3" />
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">No discount code data available. Discount codes are extracted from Square order data.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Daily Breakdown</CardTitle>
            <CardDescription>Discounts per day</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {daily.length > 0 ? (
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <table className="w-full">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sales</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Discounts</th>
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
                        <td className="px-4 py-2.5 text-sm text-right font-semibold text-foreground">{formatCurrency(day.discounts, currency)}</td>
                        <td className="px-4 py-2.5 text-sm text-right text-muted-foreground">
                          {day.sales > 0 ? `${((day.discounts / day.sales) * 100).toFixed(1)}%` : '0%'}
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

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Discounts by Location</CardTitle>
            <CardDescription>Discounts per store</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {processedLocations.length > 0 ? (
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <table className="w-full">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-8" />
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Location</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sales</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Discounts</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {processedLocations.map((item: any) => (
                      <React.Fragment key={item.id}>
                        <tr
                          className={`transition-colors ${item.isGroup ? 'bg-muted/20 hover:bg-muted/40 cursor-pointer' : 'hover:bg-muted/30'}`}
                          onClick={item.isGroup ? () => toggleGroup(item.id) : undefined}
                        >
                          <td className="px-4 py-2.5 text-sm text-muted-foreground">
                            {item.isGroup ? (
                              expandedGroups.has(item.id)
                                ? <ChevronDown className="h-4 w-4 text-primary" />
                                : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            ) : null}
                          </td>
                          <td className="px-4 py-2.5 text-sm font-medium text-foreground">
                            <div className="flex items-center gap-2">
                              <span className={item.isGroup ? 'font-semibold' : ''}>{item.name}</span>
                              {item.isGroup && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary font-normal">
                                  {item.children.length} locations
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-sm text-right text-muted-foreground">{formatCurrency(item.sales, currency)}</td>
                          <td className="px-4 py-2.5 text-sm text-right font-semibold text-foreground">{formatCurrency(item.discounts, currency)}</td>
                          <td className="px-4 py-2.5 text-sm text-right text-muted-foreground">
                            {item.sales > 0 ? `${((item.discounts / item.sales) * 100).toFixed(1)}%` : '0%'}
                          </td>
                        </tr>

                        {/* Expanded child rows */}
                        {item.isGroup && expandedGroups.has(item.id) && item.children.map((child: any) => (
                          <tr key={child.location_id} className="bg-muted/5 hover:bg-muted/15 transition-colors">
                            <td className="px-4 py-2 text-sm text-muted-foreground" />
                            <td className="px-4 py-2 text-sm text-muted-foreground pl-10">
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground/50">└</span>
                                {child.location_name}
                              </div>
                            </td>
                            <td className="px-4 py-2 text-sm text-right text-muted-foreground/70">{formatCurrency(child.sales, currency)}</td>
                            <td className="px-4 py-2 text-sm text-right text-muted-foreground">{formatCurrency(child.discounts, currency)}</td>
                            <td className="px-4 py-2 text-sm text-right text-muted-foreground/70">
                              {child.sales > 0 ? `${((child.discounts / child.sales) * 100).toFixed(1)}%` : '0%'}
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
                      <td className="px-4 py-3 text-sm text-right font-semibold text-foreground">{formatCurrency(data?.total_sales || 0, currency)}</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-primary">{formatCurrency(data?.total_discounts || 0, currency)}</td>
                      <td className="px-4 py-3 text-sm text-right text-muted-foreground">{data?.discount_rate || 0}%</td>
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
