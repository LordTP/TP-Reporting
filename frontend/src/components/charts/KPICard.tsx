/**
 * KPI Card Component
 * Displays key performance indicators
 */
import { Card, CardContent } from '@/components/ui/card'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { cn } from '@/lib/utils'

interface KPICardProps {
  title: string
  value: string | number
  description?: string
  icon?: React.ReactNode
  trend?: {
    value: number
    isPositive: boolean
    label: string
  }
  format?: 'currency' | 'number' | 'percentage'
  currency?: string
  accentColor?: string
  annotation?: React.ReactNode
}

export default function KPICard({
  title,
  value,
  description,
  icon,
  trend,
  format = 'number',
  currency = 'GBP',
  accentColor,
  annotation,
}: KPICardProps) {
  const currencySymbol = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency

  const formatValue = (val: string | number) => {
    if (typeof val === 'string') return val

    if (format === 'currency') {
      return `${currencySymbol}${(val / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    }

    if (format === 'percentage') {
      return `${val.toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
    }

    return val.toLocaleString()
  }

  return (
    <Card className="group relative overflow-hidden transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
      {accentColor && (
        <div
          className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg"
          style={{ backgroundColor: accentColor }}
        />
      )}
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center justify-between mb-2 sm:mb-3">
          <span className="text-xs sm:text-sm font-medium text-muted-foreground">{title}</span>
          {icon && (
            <div className="flex items-center justify-center h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-muted/60 text-muted-foreground">
              {icon}
            </div>
          )}
        </div>
        <div className="text-lg sm:text-2xl font-bold tracking-tight">{formatValue(value)}</div>
        {annotation}
        <div className="flex items-center justify-between mt-2">
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
          {trend && (
            <div className={cn(
              'flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5',
              trend.isPositive ? 'text-emerald-700 bg-emerald-50' : 'text-red-700 bg-red-50'
            )}>
              {trend.isPositive ? (
                <ArrowUp className="h-3 w-3" />
              ) : (
                <ArrowDown className="h-3 w-3" />
              )}
              <span>{Math.abs(trend.value).toFixed(1)}%</span>
              <span className="text-muted-foreground font-normal hidden sm:inline">{trend.label}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
