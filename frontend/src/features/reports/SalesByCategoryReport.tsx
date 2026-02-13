import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { useReportFilters } from './useReportFilters'
import ReportLayout from './ReportLayout'
import KPICard from '@/components/charts/KPICard'
import { Tag, DollarSign, Hash, TrendingUp } from 'lucide-react'
import ExportButton from '@/components/ExportButton'
import { exportToExcel, penceToPounds } from './exportToExcel'
import { CurrencyBreakdownAnnotation, CurrencyBreakdownItem } from './CurrencyBreakdown'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount / 100)
}

const PAGE_SIZE = 100

type SortKey = 'category' | 'quantity' | 'revenue' | 'transaction_count'
type VariantSortKey = 'variant' | 'product_name' | 'variation_name' | 'quantity' | 'revenue' | 'transaction_count'

type ViewMode = 'category' | 'product' | 'variant'

interface CategoryItem {
  category: string
  quantity: number
  revenue: number
  transaction_count: number
}

interface VariantItem {
  variant: string
  product_name: string
  variation_name: string
  quantity: number
  revenue: number
  transaction_count: number
}

export default function SalesByCategoryReport() {
  const filters = useReportFilters()
  const [sortKey, setSortKey] = useState<SortKey>('revenue')
  const [sortAsc, setSortAsc] = useState(false)
  const [variantSortKey, setVariantSortKey] = useState<VariantSortKey>('revenue')
  const [variantSortAsc, setVariantSortAsc] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('category')
  const [catProductPage, setCatProductPage] = useState(0)
  const [variantPage, setVariantPage] = useState(0)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['report-categories', filters.datePreset, filters.customStartDate, filters.customEndDate, filters.selectedLocation, filters.selectedClient, filters.selectedClientGroup],
    queryFn: () => {
      const params = filters.buildDaysQueryParams()
      return apiClient.get<{
        categories: CategoryItem[]
        products: CategoryItem[]
        variants: VariantItem[]
        total_items: number
        total_revenue: number
        by_currency?: CurrencyBreakdownItem[]
      }>(`/sales/products/categories?${params}`)
    },
    enabled: filters.isDateRangeReady,
  })

  const sortItems = (items: CategoryItem[]) =>
    items.slice().sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (typeof av === 'string' && typeof bv === 'string') return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av)
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number)
    })

  const categories = sortItems(data?.categories || [])
  const products = sortItems(data?.products || [])

  const variants = (data?.variants || []).slice().sort((a, b) => {
    const av = a[variantSortKey]
    const bv = b[variantSortKey]
    if (typeof av === 'string' && typeof bv === 'string') return variantSortAsc ? av.localeCompare(bv) : bv.localeCompare(av)
    return variantSortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number)
  })

  const totalRevenue = data?.total_revenue || 0
  const totalItems = data?.total_items || 0
  const topCategory = categories.length > 0 ? categories[0] : null

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(false) }
    setCatProductPage(0)
  }
  const sortIndicator = (key: SortKey) => sortKey === key ? (sortAsc ? ' \u2191' : ' \u2193') : ''

  const handleVariantSort = (key: VariantSortKey) => {
    if (variantSortKey === key) setVariantSortAsc(!variantSortAsc)
    else { setVariantSortKey(key); setVariantSortAsc(false) }
    setVariantPage(0)
  }
  const variantSortIndicator = (key: VariantSortKey) => variantSortKey === key ? (variantSortAsc ? ' \u2191' : ' \u2193') : ''

  const handleExportCategoryProduct = () => {
    const label = viewMode === 'category' ? 'Category' : 'Product'
    const items = viewMode === 'category' ? categories : products
    const headers = ['#', label, 'Units Sold', 'Transactions', 'Revenue', '% Share']
    const rows = items.map((c, i) => [
      i + 1, c.category, c.quantity, c.transaction_count, penceToPounds(c.revenue),
      totalRevenue > 0 ? `${((c.revenue / totalRevenue) * 100).toFixed(1)}%` : '0%',
    ] as (string | number)[])
    exportToExcel([{ name: `Sales by ${label}`, headers, rows }], `Sales_by_${label}`)
  }

  const handleExportVariants = () => {
    const headers = ['#', 'Product', 'Variant', 'Units', 'Transactions', 'Revenue', '% Share']
    const rows = variants.map((v, i) => [
      i + 1, v.product_name, v.variation_name, v.quantity, v.transaction_count, penceToPounds(v.revenue),
      totalRevenue > 0 ? `${((v.revenue / totalRevenue) * 100).toFixed(1)}%` : '0%',
    ] as (string | number)[])
    exportToExcel([{ name: 'Variants', headers, rows }], 'Sales_by_Variant')
  }

  // Chart data based on current view
  const chartSource = viewMode === 'category' ? categories : products
  const chartData = chartSource.slice(0, 15).map(c => ({
    name: c.category.length > 25 ? c.category.substring(0, 23) + '...' : c.category,
    fullName: c.category,
    revenue: c.revenue,
  }))

  // Active table items for category/product views
  const activeItems = viewMode === 'category' ? categories : products
  const catProductTotalPages = Math.ceil(activeItems.length / PAGE_SIZE)
  const paginatedCatProducts = activeItems.slice(catProductPage * PAGE_SIZE, (catProductPage + 1) * PAGE_SIZE)
  const variantTotalPages = Math.ceil(variants.length / PAGE_SIZE)
  const paginatedVariants = variants.slice(variantPage * PAGE_SIZE, (variantPage + 1) * PAGE_SIZE)
  const hasUncategorized = categories.some(c => c.category === 'Uncategorized')

  return (
    <ReportLayout
      title="Sales by Category"
      description={`Category & product performance - ${filters.dateRangeLabel}`}
      filters={filters}
      onRefresh={() => refetch()}
      isLoading={isLoading}
    >
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <KPICard
          title="Categories"
          value={categories.length}
          format="number"
          icon={<Tag className="h-4 w-4" />}
          description="Reporting categories"
          accentColor="#FB731E"
        />
        <KPICard
          title="Total Revenue"
          value={totalRevenue}
          format="currency"
          currency="GBP"
          icon={<DollarSign className="h-4 w-4" />}
          description={filters.dateRangeLabel}
          accentColor="#FB731E"
          annotation={<CurrencyBreakdownAnnotation breakdown={data?.by_currency} />}
        />
        <KPICard
          title="Total Items Sold"
          value={totalItems}
          format="number"
          icon={<Hash className="h-4 w-4" />}
          description={filters.dateRangeLabel}
          accentColor="#6366f1"
        />
        <KPICard
          title="Top Category"
          value={topCategory?.category || 'N/A'}
          icon={<TrendingUp className="h-4 w-4" />}
          description={topCategory ? formatCurrency(topCategory.revenue, 'GBP') : 'No data'}
          accentColor="#10b981"
        />
      </div>

      {hasUncategorized && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-200">
          Some items show as "Uncategorized" because their reporting categories haven't been synced yet.
          Ask an admin to sync the catalog from the Square Accounts page.
        </div>
      )}

      {chartData.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">
              Top {viewMode === 'category' ? 'Categories' : 'Products'} by Revenue
            </CardTitle>
            <CardDescription>Top 15 {viewMode === 'category' ? 'reporting categories' : 'products'}</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(280, chartData.length * 40)}>
              <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3A5C6E" />
                <XAxis type="number" tickFormatter={(v: number) => `\u00A3${(v / 100).toFixed(0)}`} tick={{ fontSize: 12, fill: '#B8CED9' }} stroke="#3A5C6E" />
                <YAxis type="category" dataKey="name" width={180} tick={{ fontSize: 11, fill: '#B8CED9' }} stroke="#3A5C6E" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1E313B', border: '1px solid #3A5C6E', borderRadius: '8px', color: '#B8CED9' }}
                  labelStyle={{ color: '#B8CED9' }}
                  formatter={(value: number) => [formatCurrency(value, 'GBP'), 'Revenue']}
                  labelFormatter={(_: string, payload: any[]) => payload?.[0]?.payload?.fullName || ''}
                />
                <Bar dataKey="revenue" fill="#FB731E" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Toggle between Category, Product and Variant views */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => { setViewMode('category'); setCatProductPage(0) }}
          className={`px-4 py-2 text-sm rounded-lg transition-colors ${
            viewMode === 'category'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:text-foreground'
          }`}
        >
          By Category ({categories.length})
        </button>
        <button
          onClick={() => { setViewMode('product'); setCatProductPage(0) }}
          className={`px-4 py-2 text-sm rounded-lg transition-colors ${
            viewMode === 'product'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:text-foreground'
          }`}
        >
          By Product ({products.length})
        </button>
        <button
          onClick={() => { setViewMode('variant'); setVariantPage(0) }}
          className={`px-4 py-2 text-sm rounded-lg transition-colors ${
            viewMode === 'variant'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:text-foreground'
          }`}
        >
          By Size / Variant ({variants.length})
        </button>
      </div>

      {/* Category / Product Table */}
      {viewMode !== 'variant' && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">
                {viewMode === 'category' ? 'Category Performance' : 'Product Performance'}
              </CardTitle>
              <ExportButton onClick={handleExportCategoryProduct} />
            </div>
            <CardDescription>
              {viewMode === 'category'
                ? 'Square reporting categories. Click column headers to sort.'
                : 'Individual products. Click column headers to sort.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {activeItems.length > 0 ? (
              <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-8">#</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground" onClick={() => handleSort('category')}>
                        {viewMode === 'category' ? 'Category' : 'Product'}{sortIndicator('category')}
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground" onClick={() => handleSort('quantity')}>
                        Units Sold{sortIndicator('quantity')}
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground" onClick={() => handleSort('transaction_count')}>
                        Transactions{sortIndicator('transaction_count')}
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground" onClick={() => handleSort('revenue')}>
                        Revenue{sortIndicator('revenue')}
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">% Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {paginatedCatProducts.map((cat, index) => (
                      <tr key={cat.category} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 text-sm text-muted-foreground">{catProductPage * PAGE_SIZE + index + 1}</td>
                        <td className="px-4 py-3 text-sm font-medium text-foreground">{cat.category}</td>
                        <td className="px-4 py-3 text-sm text-right text-foreground">{cat.quantity.toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm text-right text-foreground">{cat.transaction_count.toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm text-right font-semibold text-foreground">{formatCurrency(cat.revenue, 'GBP')}</td>
                        <td className="px-4 py-3 text-sm text-right text-muted-foreground">
                          {totalRevenue > 0 ? `${((cat.revenue / totalRevenue) * 100).toFixed(1)}%` : '0%'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted/40">
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3 text-sm font-semibold text-foreground">Total</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-foreground">{totalItems.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-right text-muted-foreground">&mdash;</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-primary">{formatCurrency(totalRevenue, 'GBP')}</td>
                      <td className="px-4 py-3 text-sm text-right text-muted-foreground">100%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {catProductTotalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                  <p className="text-xs text-muted-foreground">
                    Showing {catProductPage * PAGE_SIZE + 1}–{Math.min((catProductPage + 1) * PAGE_SIZE, activeItems.length)} of {activeItems.length}
                  </p>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setCatProductPage(p => Math.max(0, p - 1))}
                      disabled={catProductPage === 0}
                      className="px-3 py-1.5 text-xs rounded-md bg-muted text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Previous
                    </button>
                    <span className="px-3 py-1.5 text-xs text-muted-foreground">
                      Page {catProductPage + 1} of {catProductTotalPages}
                    </span>
                    <button
                      onClick={() => setCatProductPage(p => Math.min(catProductTotalPages - 1, p + 1))}
                      disabled={catProductPage >= catProductTotalPages - 1}
                      className="px-3 py-1.5 text-xs rounded-md bg-muted text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">
                {viewMode === 'category'
                  ? 'No category data. Sync the catalog from Square Accounts to populate reporting categories.'
                  : 'No product data for the selected period.'}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Variant Table */}
      {viewMode === 'variant' && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Size / Variant Breakdown</CardTitle>
              <ExportButton onClick={handleExportVariants} />
            </div>
            <CardDescription>Click column headers to sort. Shows each size/variant separately.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {variants.length > 0 ? (
              <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-8">#</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground" onClick={() => handleVariantSort('product_name')}>
                        Product{variantSortIndicator('product_name')}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground" onClick={() => handleVariantSort('variation_name')}>
                        Variant{variantSortIndicator('variation_name')}
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground" onClick={() => handleVariantSort('quantity')}>
                        Units{variantSortIndicator('quantity')}
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground" onClick={() => handleVariantSort('transaction_count')}>
                        Txns{variantSortIndicator('transaction_count')}
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground" onClick={() => handleVariantSort('revenue')}>
                        Revenue{variantSortIndicator('revenue')}
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">% Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {paginatedVariants.map((v, index) => (
                      <tr key={v.variant} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 text-sm text-muted-foreground">{variantPage * PAGE_SIZE + index + 1}</td>
                        <td className="px-4 py-3 text-sm font-medium text-foreground">{v.product_name}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted">
                            {v.variation_name}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-foreground">{v.quantity.toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm text-right text-foreground">{v.transaction_count.toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm text-right font-semibold text-foreground">{formatCurrency(v.revenue, 'GBP')}</td>
                        <td className="px-4 py-3 text-sm text-right text-muted-foreground">
                          {totalRevenue > 0 ? `${((v.revenue / totalRevenue) * 100).toFixed(1)}%` : '0%'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted/40">
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3 text-sm font-semibold text-foreground" colSpan={2}>Total</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-foreground">{totalItems.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-right text-muted-foreground">&mdash;</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-primary">{formatCurrency(totalRevenue, 'GBP')}</td>
                      <td className="px-4 py-3 text-sm text-right text-muted-foreground">100%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {variantTotalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                  <p className="text-xs text-muted-foreground">
                    Showing {variantPage * PAGE_SIZE + 1}–{Math.min((variantPage + 1) * PAGE_SIZE, variants.length)} of {variants.length}
                  </p>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setVariantPage(p => Math.max(0, p - 1))}
                      disabled={variantPage === 0}
                      className="px-3 py-1.5 text-xs rounded-md bg-muted text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Previous
                    </button>
                    <span className="px-3 py-1.5 text-xs text-muted-foreground">
                      Page {variantPage + 1} of {variantTotalPages}
                    </span>
                    <button
                      onClick={() => setVariantPage(p => Math.min(variantTotalPages - 1, p + 1))}
                      disabled={variantPage >= variantTotalPages - 1}
                      className="px-3 py-1.5 text-xs rounded-md bg-muted text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">No variant data for the selected period.</p>
            )}
          </CardContent>
        </Card>
      )}
    </ReportLayout>
  )
}
