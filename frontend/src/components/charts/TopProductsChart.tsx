/**
 * Top Products List Component
 * Displays best-selling products by revenue in a list format
 */
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface TopProductsChartProps {
  data: Array<{
    product_name: string
    total_revenue: number
    total_quantity: number
    average_price: number
  }>
  title?: string
  description?: string
  currency?: string
  limit?: number
}

export default function TopProductsChart({
  data,
  title = 'Top Products by Revenue',
  description = 'Best-selling products',
  currency = 'GBP',
  limit = 10,
}: TopProductsChartProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currency,
    }).format(value / 100)
  }

  // Limit data
  const displayData = data.slice(0, limit)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {displayData.length > 0 ? (
          <div className="space-y-3">
            {displayData.map((item, index) => {
              const maxRevenue = displayData[0].total_revenue
              const widthPercent = (item.total_revenue / maxRevenue) * 100

              return (
                <div key={index} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-muted-foreground font-mono text-xs w-6 flex-shrink-0">#{index + 1}</span>
                      <span className="font-medium text-foreground truncate" title={item.product_name}>
                        {item.product_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                      <span className="text-muted-foreground text-xs">
                        {item.total_quantity} sold
                      </span>
                      <span className="font-semibold text-foreground min-w-[80px] text-right">
                        {formatCurrency(item.total_revenue)}
                      </span>
                    </div>
                  </div>
                  <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary to-primary/60 rounded-full transition-all"
                      style={{ width: `${widthPercent}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">No product data available</p>
        )}
      </CardContent>
    </Card>
  )
}
