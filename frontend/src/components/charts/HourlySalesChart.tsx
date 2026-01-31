/**
 * Hourly Sales Chart Component
 * Shows peak selling hours throughout the day
 */
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
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
    return `${currencySymbol}${(value / 100).toFixed(0)}`
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
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(200 31% 33%)" />
            <XAxis dataKey="hourLabel" tick={{ fill: '#B8CED9' }} stroke="#3A5C6E" />
            <YAxis yAxisId="left" tickFormatter={formatCurrency} domain={['auto', 'auto']} tick={{ fill: '#B8CED9' }} stroke="#3A5C6E" />
            <YAxis yAxisId="right" orientation="right" domain={['auto', 'auto']} tick={{ fill: '#B8CED9' }} stroke="#3A5C6E" />
            <Tooltip
              formatter={(value: number, name: string) => {
                if (name === 'sales') return [formatCurrency(value), 'Sales']
                if (name === 'transactions') return [value, 'Transactions']
                if (name === 'items') return [value, 'Items Sold']
                return [value, name]
              }}
              contentStyle={{ backgroundColor: '#1E313B', border: '1px solid #3A5C6E', borderRadius: '8px', color: '#B8CED9' }}
              labelStyle={{ color: '#B8CED9' }}
            />
            <Legend wrapperStyle={{ color: '#B8CED9' }} />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="sales"
              stroke="#FB731E"
              strokeWidth={2}
              name="Sales"
              dot={{ r: 3 }}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="transactions"
              stroke="#10b981"
              strokeWidth={2}
              name="Transactions"
              dot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
