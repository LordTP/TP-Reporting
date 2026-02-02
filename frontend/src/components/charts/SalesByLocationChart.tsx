/**
 * Sales by Location Chart Component
 * Displays revenue breakdown across locations with horizontal bars
 */
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface SalesByLocationChartProps {
  data: Array<{
    location_id: string
    location_name: string
    total_sales: number
    converted_total_sales: number
    total_transactions: number
    average_transaction: number
    currency: string
    rate_to_gbp: number
  }>
  title?: string
  description?: string
  currency?: string
}

export default function SalesByLocationChart({
  data,
  title = 'Sales by Location',
  description = 'Revenue breakdown by location',
  currency = 'GBP',
}: SalesByLocationChartProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currency,
    }).format(value / 100)
  }

  // Sort by converted sales descending
  const sorted = [...data].sort((a, b) => b.converted_total_sales - a.converted_total_sales)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {sorted.length > 0 ? (
          <div className="space-y-3">
            {sorted.map((location, index) => {
              const maxSales = sorted[0].converted_total_sales
              const widthPercent = maxSales > 0 ? (location.converted_total_sales / maxSales) * 100 : 0

              return (
                <div key={location.location_id} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-muted-foreground font-mono text-xs w-6 flex-shrink-0">#{index + 1}</span>
                      <span className="font-medium text-foreground truncate" title={location.location_name}>
                        {location.location_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 ml-2">
                      <span className="text-muted-foreground text-xs hidden sm:inline">
                        {location.total_transactions.toLocaleString()} txns
                      </span>
                      <span className="font-semibold text-foreground text-sm sm:text-base text-right">
                        {formatCurrency(location.converted_total_sales)}
                      </span>
                    </div>
                  </div>
                  <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full transition-all"
                      style={{
                        width: `${widthPercent}%`,
                        background: 'linear-gradient(to right, #FB731E, #FB731Eaa)',
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">No location data available</p>
        )}
      </CardContent>
    </Card>
  )
}
