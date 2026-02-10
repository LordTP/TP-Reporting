import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { useReportFilters } from './useReportFilters'
import ReportLayout from './ReportLayout'
import KPICard from '@/components/charts/KPICard'
import { ShoppingBag, DollarSign, TrendingUp, Hash } from 'lucide-react'
import ExportButton from '@/components/ExportButton'
import { exportToExcel, penceToPounds } from './exportToExcel'
import { CurrencyBreakdownItem } from './CurrencyBreakdown'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount / 100)
}

type ProductSortKey = 'product_name' | 'total_quantity' | 'total_revenue' | 'average_price' | 'transaction_count'
type SkuSortKey = 'product_name' | 'variation_name' | 'quantity' | 'revenue' | 'transaction_count'
type ViewMode = 'product' | 'sku'

interface VariantItem {
  variant: string
  product_name: string
  variation_name: string
  quantity: number
  revenue: number
  transaction_count: number
  original_amounts?: Record<string, number>
  converted_amounts?: Record<string, number>
}

const PAGE_SIZE = 100

export default function SalesByProductReport() {
  const filters = useReportFilters()
  const [viewMode, setViewMode] = useState<ViewMode>('product')
  const [sortKey, setSortKey] = useState<ProductSortKey>('total_revenue')
  const [sortAsc, setSortAsc] = useState(false)
  const [skuSortKey, setSkuSortKey] = useState<SkuSortKey>('revenue')
  const [skuSortAsc, setSkuSortAsc] = useState(false)
  const [productPage, setProductPage] = useState(0)
  const [skuPage, setSkuPage] = useState(0)

  const { data: productsData, isLoading: productsLoading, refetch: refetchProducts } = useQuery({
    queryKey: ['report-products', filters.datePreset, filters.customStartDate, filters.customEndDate, filters.selectedLocation, filters.selectedClient],
    queryFn: () => {
      const params = filters.buildDaysQueryParams()
      return apiClient.get<{
        products: Array<{
          product_name: string
          total_quantity: number
          total_revenue: number
          transaction_count: number
          average_price: number
          original_amounts?: Record<string, number>
          converted_amounts?: Record<string, number>
        }>
        total_unique_products: number
      }>(`/sales/products/top?${params}`)
    },
    enabled: filters.isDateRangeReady,
  })

  const { data: categoryData, isLoading: categoryLoading } = useQuery({
    queryKey: ['report-categories-for-sku', filters.datePreset, filters.customStartDate, filters.customEndDate, filters.selectedLocation, filters.selectedClient],
    queryFn: () => {
      const params = filters.buildDaysQueryParams()
      return apiClient.get<{
        variants: VariantItem[]
        total_items: number
        total_revenue: number
        by_currency?: CurrencyBreakdownItem[]
      }>(`/sales/products/categories?${params}`)
    },
    enabled: filters.isDateRangeReady && viewMode === 'sku',
  })

  const isLoading = productsLoading || (viewMode === 'sku' && categoryLoading)

  // Product view sorting
  const products = (productsData?.products || []).slice().sort((a, b) => {
    const av = a[sortKey]
    const bv = b[sortKey]
    if (typeof av === 'string' && typeof bv === 'string') return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av)
    return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number)
  })

  // SKU view sorting
  const variants = (categoryData?.variants || []).slice().sort((a, b) => {
    const av = a[skuSortKey]
    const bv = b[skuSortKey]
    if (typeof av === 'string' && typeof bv === 'string') return skuSortAsc ? av.localeCompare(bv) : bv.localeCompare(av)
    return skuSortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number)
  })

  const totalRevenue = viewMode === 'product'
    ? products.reduce((sum, p) => sum + p.total_revenue, 0)
    : variants.reduce((sum, v) => sum + v.revenue, 0)
  const totalUnits = viewMode === 'product'
    ? products.reduce((sum, p) => sum + p.total_quantity, 0)
    : variants.reduce((sum, v) => sum + v.quantity, 0)
  const topProduct = (productsData?.products || []).length > 0
    ? (productsData?.products || []).reduce((best, p) => p.total_revenue > best.total_revenue ? p : best)
    : null

  // Aggregate original + converted amounts across all products/variants for KPI annotation
  const totalOrigByCurrency: Record<string, { original: number; converted: number }> = {}
  if (viewMode === 'product') {
    for (const p of products) {
      if (p.original_amounts && p.converted_amounts) {
        for (const [cur, amt] of Object.entries(p.original_amounts)) {
          if (!totalOrigByCurrency[cur]) totalOrigByCurrency[cur] = { original: 0, converted: 0 }
          totalOrigByCurrency[cur].original += amt
          totalOrigByCurrency[cur].converted += (p.converted_amounts[cur] || 0)
        }
      }
    }
  } else {
    for (const v of variants) {
      if (v.original_amounts && v.converted_amounts) {
        for (const [cur, amt] of Object.entries(v.original_amounts)) {
          if (!totalOrigByCurrency[cur]) totalOrigByCurrency[cur] = { original: 0, converted: 0 }
          totalOrigByCurrency[cur].original += amt
          totalOrigByCurrency[cur].converted += (v.converted_amounts[cur] || 0)
        }
      }
    }
  }
  const hasMultiCurrency = Object.keys(totalOrigByCurrency).length > 0

  const handleSort = (key: ProductSortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(false) }
    setProductPage(0)
  }
  const sortIndicator = (key: ProductSortKey) => sortKey === key ? (sortAsc ? ' ↑' : ' ↓') : ''

  const handleSkuSort = (key: SkuSortKey) => {
    if (skuSortKey === key) setSkuSortAsc(!skuSortAsc)
    else { setSkuSortKey(key); setSkuSortAsc(false) }
    setSkuPage(0)
  }
  const skuSortIndicator = (key: SkuSortKey) => skuSortKey === key ? (skuSortAsc ? ' ↑' : ' ↓') : ''

  // Pagination
  const productTotalPages = Math.ceil(products.length / PAGE_SIZE)
  const paginatedProducts = products.slice(productPage * PAGE_SIZE, (productPage + 1) * PAGE_SIZE)
  const skuTotalPages = Math.ceil(variants.length / PAGE_SIZE)
  const paginatedVariants = variants.slice(skuPage * PAGE_SIZE, (skuPage + 1) * PAGE_SIZE)

  const handleExportProducts = () => {
    const headers = ['#', 'Product', 'Units Sold', 'Avg Price', 'Transactions', 'Revenue', '% Share']
    const rows = products.map((p, i) => [
      i + 1,
      p.product_name,
      p.total_quantity,
      penceToPounds(p.average_price),
      p.transaction_count,
      penceToPounds(p.total_revenue),
      totalRevenue > 0 ? `${((p.total_revenue / totalRevenue) * 100).toFixed(1)}%` : '0%',
    ] as (string | number)[])
    exportToExcel([{ name: 'Sales by Product', headers, rows }], 'Sales_by_Product')
  }

  const handleExportSku = () => {
    const headers = ['#', 'Product', 'Size / Variant', 'Units Sold', 'Transactions', 'Revenue', '% Share']
    const rows = variants.map((v, i) => [
      i + 1,
      v.product_name,
      v.variation_name,
      v.quantity,
      v.transaction_count,
      penceToPounds(v.revenue),
      totalRevenue > 0 ? `${((v.revenue / totalRevenue) * 100).toFixed(1)}%` : '0%',
    ] as (string | number)[])
    exportToExcel([{ name: 'Sales by SKU', headers, rows }], 'Sales_by_SKU')
  }

  return (
    <ReportLayout
      title="Sales by Product / SKU"
      description={`Product performance breakdown - ${filters.dateRangeLabel}`}
      filters={filters}
      onRefresh={() => refetchProducts()}
      isLoading={isLoading}
    >
      {/* KPIs */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <KPICard
          title={viewMode === 'product' ? 'Total Products' : 'Total SKUs'}
          value={viewMode === 'product' ? (productsData?.total_unique_products ?? products.length) : variants.length}
          format="number"
          icon={<ShoppingBag className="h-4 w-4" />}
          description={viewMode === 'product' ? 'Unique products sold' : 'Unique size/variants sold'}
          accentColor="#8b5cf6"
        />
        <KPICard
          title="Total Revenue"
          value={totalRevenue}
          format="currency"
          currency="GBP"
          icon={<DollarSign className="h-4 w-4" />}
          description={filters.dateRangeLabel}
          accentColor="#8b5cf6"
          annotation={hasMultiCurrency ? (
            <div className="mt-1 space-y-0.5">
              {Object.entries(totalOrigByCurrency).map(([cur, { original, converted }]) => (
                <div key={cur} className="text-[10px] text-muted-foreground/70">
                  Includes {formatCurrency(original, cur)} → {formatCurrency(converted, 'GBP')}
                </div>
              ))}
            </div>
          ) : undefined}
        />
        <KPICard
          title="Total Units Sold"
          value={totalUnits}
          format="number"
          icon={<Hash className="h-4 w-4" />}
          description={filters.dateRangeLabel}
          accentColor="#6366f1"
        />
        <KPICard
          title="Top Seller"
          value={topProduct?.product_name || 'N/A'}
          icon={<TrendingUp className="h-4 w-4" />}
          description={topProduct ? `${topProduct.total_quantity} units` : 'No data'}
          accentColor="#10b981"
        />
      </div>

      {/* View toggle */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => { setViewMode('product'); setProductPage(0) }}
          className={`px-4 py-2 text-sm rounded-lg transition-colors ${
            viewMode === 'product'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:text-foreground'
          }`}
        >
          By Product ({productsData?.total_unique_products ?? products.length})
        </button>
        <button
          onClick={() => { setViewMode('sku'); setSkuPage(0) }}
          className={`px-4 py-2 text-sm rounded-lg transition-colors ${
            viewMode === 'sku'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:text-foreground'
          }`}
        >
          By SKU / Size ({variants.length})
        </button>
      </div>

      {/* Product Table */}
      {viewMode === 'product' && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Product Performance</CardTitle>
              <ExportButton onClick={handleExportProducts} />
            </div>
            <CardDescription>Click column headers to sort</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {products.length > 0 ? (
              <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-8">#</th>
                      <th
                        className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground"
                        onClick={() => handleSort('product_name')}
                      >
                        Product{sortIndicator('product_name')}
                      </th>
                      <th
                        className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground"
                        onClick={() => handleSort('total_quantity')}
                      >
                        Units Sold{sortIndicator('total_quantity')}
                      </th>
                      <th
                        className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground"
                        onClick={() => handleSort('average_price')}
                      >
                        Avg Price{sortIndicator('average_price')}
                      </th>
                      <th
                        className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground"
                        onClick={() => handleSort('transaction_count')}
                      >
                        Transactions{sortIndicator('transaction_count')}
                      </th>
                      <th
                        className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground"
                        onClick={() => handleSort('total_revenue')}
                      >
                        Revenue{sortIndicator('total_revenue')}
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        % Share
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {paginatedProducts.map((product, index) => (
                      <tr key={product.product_name} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 text-sm text-muted-foreground">{productPage * PAGE_SIZE + index + 1}</td>
                        <td className="px-4 py-3 text-sm font-medium text-foreground">{product.product_name}</td>
                        <td className="px-4 py-3 text-sm text-right text-foreground">{product.total_quantity.toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm text-right text-muted-foreground">
                          {formatCurrency(product.average_price, 'GBP')}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-foreground">{product.transaction_count.toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm text-right font-semibold text-foreground">
                          {formatCurrency(product.total_revenue, 'GBP')}
                          {product.original_amounts && product.converted_amounts && Object.entries(product.original_amounts).map(([cur, amt]) => (
                            <div key={cur} className="text-[10px] font-normal text-muted-foreground/60">
                              {formatCurrency(amt, cur)} → {formatCurrency(product.converted_amounts![cur] || 0, 'GBP')}
                            </div>
                          ))}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-muted-foreground">
                          {totalRevenue > 0 ? `${((product.total_revenue / totalRevenue) * 100).toFixed(1)}%` : '0%'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted/40">
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3 text-sm font-semibold text-foreground">Total</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-foreground">{totalUnits.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-right text-muted-foreground">—</td>
                      <td className="px-4 py-3 text-sm text-right text-muted-foreground">—</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-primary">{formatCurrency(totalRevenue, 'GBP')}</td>
                      <td className="px-4 py-3 text-sm text-right text-muted-foreground">100%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {productTotalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                  <p className="text-xs text-muted-foreground">
                    Showing {productPage * PAGE_SIZE + 1}–{Math.min((productPage + 1) * PAGE_SIZE, products.length)} of {products.length}
                  </p>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setProductPage(p => Math.max(0, p - 1))}
                      disabled={productPage === 0}
                      className="px-3 py-1.5 text-xs rounded-md bg-muted text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Previous
                    </button>
                    <span className="px-3 py-1.5 text-xs text-muted-foreground">
                      Page {productPage + 1} of {productTotalPages}
                    </span>
                    <button
                      onClick={() => setProductPage(p => Math.min(productTotalPages - 1, p + 1))}
                      disabled={productPage >= productTotalPages - 1}
                      className="px-3 py-1.5 text-xs rounded-md bg-muted text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">No product data for the selected period.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* SKU / Size Table */}
      {viewMode === 'sku' && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">SKU / Size Breakdown</CardTitle>
              <ExportButton onClick={handleExportSku} />
            </div>
            <CardDescription>Each product broken down by size/variant. Click column headers to sort.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {variants.length > 0 ? (
              <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-8">#</th>
                      <th
                        className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground"
                        onClick={() => handleSkuSort('product_name')}
                      >
                        Product{skuSortIndicator('product_name')}
                      </th>
                      <th
                        className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground"
                        onClick={() => handleSkuSort('variation_name')}
                      >
                        Size / Variant{skuSortIndicator('variation_name')}
                      </th>
                      <th
                        className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground"
                        onClick={() => handleSkuSort('quantity')}
                      >
                        Units Sold{skuSortIndicator('quantity')}
                      </th>
                      <th
                        className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground"
                        onClick={() => handleSkuSort('transaction_count')}
                      >
                        Transactions{skuSortIndicator('transaction_count')}
                      </th>
                      <th
                        className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground"
                        onClick={() => handleSkuSort('revenue')}
                      >
                        Revenue{skuSortIndicator('revenue')}
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        % Share
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {paginatedVariants.map((v, index) => (
                      <tr key={v.variant} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 text-sm text-muted-foreground">{skuPage * PAGE_SIZE + index + 1}</td>
                        <td className="px-4 py-3 text-sm font-medium text-foreground">{v.product_name}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted">
                            {v.variation_name}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-foreground">{v.quantity.toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm text-right text-foreground">{v.transaction_count.toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm text-right font-semibold text-foreground">
                          {formatCurrency(v.revenue, 'GBP')}
                          {v.original_amounts && v.converted_amounts && Object.entries(v.original_amounts).map(([cur, amt]) => (
                            <div key={cur} className="text-[10px] font-normal text-muted-foreground/60">
                              {formatCurrency(amt, cur)} → {formatCurrency(v.converted_amounts![cur] || 0, 'GBP')}
                            </div>
                          ))}
                        </td>
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
                      <td className="px-4 py-3 text-sm text-right font-semibold text-foreground">{totalUnits.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-right text-muted-foreground">—</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-primary">{formatCurrency(totalRevenue, 'GBP')}</td>
                      <td className="px-4 py-3 text-sm text-right text-muted-foreground">100%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {skuTotalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                  <p className="text-xs text-muted-foreground">
                    Showing {skuPage * PAGE_SIZE + 1}–{Math.min((skuPage + 1) * PAGE_SIZE, variants.length)} of {variants.length}
                  </p>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setSkuPage(p => Math.max(0, p - 1))}
                      disabled={skuPage === 0}
                      className="px-3 py-1.5 text-xs rounded-md bg-muted text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Previous
                    </button>
                    <span className="px-3 py-1.5 text-xs text-muted-foreground">
                      Page {skuPage + 1} of {skuTotalPages}
                    </span>
                    <button
                      onClick={() => setSkuPage(p => Math.min(skuTotalPages - 1, p + 1))}
                      disabled={skuPage >= skuTotalPages - 1}
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
                {categoryLoading ? 'Loading SKU data...' : 'No SKU/size data for the selected period.'}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </ReportLayout>
  )
}
