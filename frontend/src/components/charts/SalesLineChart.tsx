/**
 * Sales Line Chart Component
 * Displays sales trends over time
 */
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { format } from 'date-fns'

interface SalesLineChartProps {
  data: Array<{
    date: string
    sales: number
    transactions?: number
  }>
  title?: string
  description?: string
  currency?: string
}

export default function SalesLineChart({
  data,
  title = 'Sales Trend',
  description = 'Daily sales over time',
  currency = 'GBP',
}: SalesLineChartProps) {
  const currencySymbol = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency

  const formatCurrency = (value: number) => {
    const pounds = value / 100
    if (pounds >= 1000) return `${currencySymbol}${(pounds / 1000).toFixed(1)}k`
    return `${currencySymbol}${pounds.toFixed(0)}`
  }

  const formatCurrencyFull = (value: number) => {
    return `${currencySymbol}${(value / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'MMM dd')
    } catch {
      return dateString
    }
  }

  const hasTransactions = data[0]?.transactions !== undefined

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <AreaChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
            <defs>
              <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#FB731E" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#FB731E" stopOpacity={0} />
              </linearGradient>
              {hasTransactions && (
                <linearGradient id="transactionsGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              )}
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
              stroke="hsl(var(--border))"
              tickLine={false}
              axisLine={false}
              dy={8}
            />
            <YAxis
              yAxisId="left"
              tickFormatter={formatCurrency}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
              stroke="hsl(var(--border))"
              tickLine={false}
              axisLine={false}
              width={65}
              domain={[() => 0, 'auto']}
            />
            {hasTransactions && (
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                stroke="hsl(var(--border))"
                tickLine={false}
                axisLine={false}
                width={45}
                domain={[() => 0, 'auto']}
              />
            )}
            <Tooltip
              formatter={(value: number, name: string) => [
                name === 'Sales' ? formatCurrencyFull(value) : value.toLocaleString(),
                name,
              ]}
              labelFormatter={formatDate}
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                color: 'hsl(var(--foreground))',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              }}
              labelStyle={{ color: 'hsl(var(--muted-foreground))', marginBottom: 4 }}
            />
            <Legend wrapperStyle={{ color: 'hsl(var(--muted-foreground))', paddingTop: 16 }} />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="sales"
              stroke="#FB731E"
              strokeWidth={2.5}
              fill="url(#salesGradient)"
              dot={false}
              activeDot={{ r: 5, strokeWidth: 2, fill: '#FB731E' }}
              name="Sales"
            />
            {hasTransactions && (
              <Area
                yAxisId="right"
                type="monotone"
                dataKey="transactions"
                stroke="#10b981"
                strokeWidth={2}
                fill="url(#transactionsGradient)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, fill: '#10b981' }}
                name="Transactions"
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
