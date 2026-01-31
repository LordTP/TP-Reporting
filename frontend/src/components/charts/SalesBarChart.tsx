/**
 * Sales Bar Chart Component
 * Displays sales comparison across locations or time periods
 */
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface SalesBarChartProps {
  data: Array<{
    name: string
    sales: number
    budget?: number
  }>
  title?: string
  description?: string
  currency?: string
}

export default function SalesBarChart({
  data,
  title = 'Sales by Location',
  description = 'Comparison across locations',
  currency = 'GBP',
}: SalesBarChartProps) {
  const currencySymbol = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency

  const formatCurrency = (value: number) => {
    return `${currencySymbol}${(value / 100).toFixed(0)}`
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(200 31% 33%)" />
            <XAxis dataKey="name" tick={{ fill: '#B8CED9' }} stroke="#3A5C6E" />
            <YAxis tickFormatter={formatCurrency} tick={{ fill: '#B8CED9' }} stroke="#3A5C6E" />
            <Tooltip
              formatter={(value: number, name: string) => [
                formatCurrency(value),
                name === 'sales' ? 'Sales' : 'Budget',
              ]}
              contentStyle={{ backgroundColor: '#1E313B', border: '1px solid #3A5C6E', borderRadius: '8px', color: '#B8CED9' }}
              labelStyle={{ color: '#B8CED9' }}
            />
            <Legend wrapperStyle={{ color: '#B8CED9' }} />
            <Bar dataKey="sales" fill="#FB731E" name="Sales" />
            {data[0]?.budget !== undefined && <Bar dataKey="budget" fill="#10b981" name="Budget" />}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
