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
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
            <XAxis dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} stroke="hsl(var(--border))" tickLine={false} axisLine={false} />
            <YAxis tickFormatter={formatCurrency} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} stroke="hsl(var(--border))" tickLine={false} axisLine={false} width={50} />
            <Tooltip
              formatter={(value: number, name: string) => [
                formatCurrency(value),
                name === 'sales' ? 'Sales' : 'Budget',
              ]}
              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
              labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
            />
            <Legend wrapperStyle={{ color: 'hsl(var(--muted-foreground))' }} />
            <Bar dataKey="sales" fill="#FB731E" name="Sales" />
            {data[0]?.budget !== undefined && <Bar dataKey="budget" fill="#10b981" name="Budget" />}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
