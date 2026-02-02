/**
 * Sales by Client Chart Component
 * Displays revenue breakdown across clients with horizontal bars
 */
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface SalesByClientChartProps {
  data: Array<{
    client_id: string
    client_name: string
    total_sales: number
    total_transactions: number
    location_count: number
    average_transaction: number
  }>
  title?: string
  description?: string
  currency?: string
}

export default function SalesByClientChart({
  data,
  title = 'Sales by Client',
  description = 'Revenue breakdown by client',
  currency = 'GBP',
}: SalesByClientChartProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currency,
    }).format(value / 100)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {data.length > 0 ? (
          <div className="space-y-3">
            {data.map((client, index) => {
              const maxSales = data[0].total_sales
              const widthPercent = maxSales > 0 ? (client.total_sales / maxSales) * 100 : 0

              return (
                <div key={client.client_id} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-muted-foreground font-mono text-xs w-6 flex-shrink-0">#{index + 1}</span>
                      <span className="font-medium text-foreground truncate" title={client.client_name}>
                        {client.client_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 ml-2">
                      <span className="text-muted-foreground text-xs hidden sm:inline">
                        {client.total_transactions.toLocaleString()} txns
                      </span>
                      <span className="font-semibold text-foreground text-sm sm:text-base text-right">
                        {formatCurrency(client.total_sales)}
                      </span>
                    </div>
                  </div>
                  <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full transition-all"
                      style={{
                        width: `${widthPercent}%`,
                        background: 'linear-gradient(to right, #8b5cf6, #8b5cf6aa)',
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">No client data available</p>
        )}
      </CardContent>
    </Card>
  )
}
