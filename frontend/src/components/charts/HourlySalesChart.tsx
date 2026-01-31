/**
 * Hourly Sales Chart Component
 * Shows peak selling hours throughout the day
 */
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface HourlySalesChartProps {
  data: Array<{
    hour: number
    sales: number
    transactions: number
    items: number
  }>
  title?: string
  description?: string
  currency?: string
}

export default function HourlySalesChart({
  data,
  title = 'Hourly Sales Trends',
  description = 'Peak selling hours',
  currency = 'GBP',
}: HourlySalesChartProps) {
  const currencySymbol = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency

  const formatCurrency = (value: number) => {
    const pounds = value / 100
    if (pounds >= 1000) return `${currencySymbol}${(pounds / 1000).toFixed(1)}k`
    return `${currencySymbol}${pounds.toFixed(0)}`
  }

  const formatCurrencyFull = (value: number) => {
    return `${currencySymbol}${(value / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const formatHour = (hour: number) => {
    if (hour === 0) return '12am'
    if (hour === 12) return '12pm'
    if (hour < 12) return `${hour}am`
    return `${hour - 12}pm`
  }

  // Add formatted hour labels to data
  const chartData = data.map((item) => ({
    ...item,
    hourLabel: formatHour(item.hour),
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
            <defs>
              <linearGradient id="hourlySalesGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#FB731E" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#FB731E" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="hourlyTransactionsGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
            <XAxis
              dataKey="hourLabel"
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
            <Tooltip
              formatter={(value: number, name: string) => {
                if (name === 'Sales') return [formatCurrencyFull(value), 'Sales']
                if (name === 'Transactions') return [value.toLocaleString(), 'Transactions']
                return [value.toLocaleString(), name]
              }}
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
              fill="url(#hourlySalesGradient)"
              dot={false}
              activeDot={{ r: 5, strokeWidth: 2, fill: '#FB731E' }}
              name="Sales"
            />
            <Area
              yAxisId="right"
              type="monotone"
              dataKey="transactions"
              stroke="#10b981"
              strokeWidth={2}
              fill="url(#hourlyTransactionsGradient)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, fill: '#10b981' }}
              name="Transactions"
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
