import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { useReportFilters } from './useReportFilters'
import ReportLayout from './ReportLayout'
import KPICard from '@/components/charts/KPICard'
import { ShoppingCart, DollarSign, Hash, Package } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount / 100)
}

interface BasketData {
  average_order_value: number
  average_items_per_order: number
  total_orders: number
  total_items: number
  currency: string
}

export default function BasketAnalysisReport() {
  const filters = useReportFilters()

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['report-basket', filters.datePreset, filters.selectedLocation, filters.selectedClient],
    queryFn: () => {
      const params = filters.buildDaysQueryParams()
      return apiClient.get<BasketData>(`/sales/analytics/basket?${params}`)
    },
  })

  const currency = data?.currency || 'GBP'

  return (
    <ReportLayout
      title="Basket Analysis"
      description={`Order size and basket metrics - ${filters.dateRangeLabel}`}
      filters={filters}
      onRefresh={() => refetch()}
      isLoading={isLoading}
    >
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <KPICard
          title="Avg Order Value"
          value={data?.average_order_value || 0}
          format="currency"
          currency={currency}
          icon={<DollarSign className="h-4 w-4" />}
          description={filters.dateRangeLabel}
          accentColor="#f59e0b"
        />
        <KPICard
          title="Avg Items / Order"
          value={data?.average_items_per_order || 0}
          format="number"
          icon={<Package className="h-4 w-4" />}
          description="Items per basket"
          accentColor="#8b5cf6"
        />
        <KPICard
          title="Total Orders"
          value={data?.total_orders || 0}
          format="number"
          icon={<ShoppingCart className="h-4 w-4" />}
          description={filters.dateRangeLabel}
          accentColor="#f59e0b"
        />
        <KPICard
          title="Total Items Sold"
          value={data?.total_items || 0}
          format="number"
          icon={<Hash className="h-4 w-4" />}
          description={filters.dateRangeLabel}
          accentColor="#6366f1"
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Basket Metrics Summary</CardTitle>
          <CardDescription>Key basket metrics for the selected period</CardDescription>
        </CardHeader>
        <CardContent>
          {data && data.total_orders > 0 ? (
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <div className="flex justify-between items-center py-3 border-b border-border">
                  <span className="text-sm text-muted-foreground">Average Order Value</span>
                  <span className="text-sm font-semibold text-foreground">{formatCurrency(data.average_order_value, currency)}</span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-border">
                  <span className="text-sm text-muted-foreground">Average Items per Order</span>
                  <span className="text-sm font-semibold text-foreground">{data.average_items_per_order}</span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-border">
                  <span className="text-sm text-muted-foreground">Total Orders</span>
                  <span className="text-sm font-semibold text-foreground">{data.total_orders.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-border">
                  <span className="text-sm text-muted-foreground">Total Items Sold</span>
                  <span className="text-sm font-semibold text-foreground">{data.total_items.toLocaleString()}</span>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex justify-between items-center py-3 border-b border-border">
                  <span className="text-sm text-muted-foreground">Total Revenue</span>
                  <span className="text-sm font-semibold text-foreground">
                    {formatCurrency(data.average_order_value * data.total_orders, currency)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-border">
                  <span className="text-sm text-muted-foreground">Revenue per Item</span>
                  <span className="text-sm font-semibold text-foreground">
                    {data.total_items > 0
                      ? formatCurrency(Math.round((data.average_order_value * data.total_orders) / data.total_items), currency)
                      : '—'}
                  </span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-border">
                  <span className="text-sm text-muted-foreground">Currency</span>
                  <span className="text-sm font-semibold text-foreground">{currency}</span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">No basket data for the selected period.</p>
          )}
        </CardContent>
      </Card>
    </ReportLayout>
  )
}
