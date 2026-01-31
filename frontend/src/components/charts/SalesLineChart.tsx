/**
 * Sales Line Chart Component
 * Displays sales trends over time
 */
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
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
    return `${currencySymbol}${(value / 100).toFixed(2)}`
  }

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'MMM dd')
    } catch {
      return dateString
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(200 31% 33%)" />
            <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fill: '#B8CED9' }} stroke="#3A5C6E" />
            <YAxis tickFormatter={formatCurrency} domain={['auto', 'auto']} tick={{ fill: '#B8CED9' }} stroke="#3A5C6E" />
            <Tooltip
              formatter={(value: number, name: string) => [
                name === 'sales' ? formatCurrency(value) : value,
                name === 'sales' ? 'Sales' : 'Transactions',
              ]}
              labelFormatter={formatDate}
              contentStyle={{ backgroundColor: '#1E313B', border: '1px solid #3A5C6E', borderRadius: '8px', color: '#B8CED9' }}
              labelStyle={{ color: '#B8CED9' }}
            />
            <Legend wrapperStyle={{ color: '#B8CED9' }} />
            <Line type="monotone" dataKey="sales" stroke="#FB731E" strokeWidth={2} name="Sales" />
            {data[0]?.transactions !== undefined && (
              <Line type="monotone" dataKey="transactions" stroke="#10b981" strokeWidth={2} name="Transactions" />
            )}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
