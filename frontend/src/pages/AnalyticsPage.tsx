/**
 * Analytics Page
 * Comprehensive analytics hub with sales performance, budget tracking, and location insights
 */
import { useAuthStore } from '@/store/authStore'
import { usePermissionStore } from '@/store/permissionStore'
import AppNav from '@/components/layout/AppNav'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import SalesLineChart from '@/components/charts/SalesLineChart'
import TopProductsChart from '@/components/charts/TopProductsChart'
import HourlySalesChart from '@/components/charts/HourlySalesChart'
import SalesByClientChart from '@/components/charts/SalesByClientChart'
import KPICard from '@/components/charts/KPICard'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DollarSign, TrendingUp, ShoppingCart, Package, Filter,
  RefreshCw, Target, BarChart3, CreditCard, Banknote, Wallet, AlertTriangle,
  ChevronDown, ChevronRight, ChevronUp, Receipt, Calculator,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import React, { useMemo, useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  Cell, PieChart, Pie,
} from 'recharts'

// --- Types ---

interface CurrencyBreakdown {
  currency: string
  amount: number
  converted_amount: number
  rate: number
}

interface SalesAggregation {
  total_sales: number
  total_transactions: number
  average_transaction: number
  currency: string
  start_date: string
  end_date: string
  by_currency?: CurrencyBreakdown[]
}

interface BudgetPerformanceItem {
  location_id: string
  location_name: string
  date: string
  budget_amount: number
  actual_sales: number
  variance: number
  variance_percentage: number
  attainment_percentage: number
  currency: string
  status: 'exceeded' | 'on_track' | 'below_target'
}

interface BudgetPerformanceReport {
  performances: BudgetPerformanceItem[]
  summary: {
    total_budget: number
    total_sales: number
    overall_variance: number
    overall_attainment_percentage: number
    locations_on_target: number
    total_locations: number
    budget_by_currency?: CurrencyBreakdown[]
    sales_by_currency?: CurrencyBreakdown[]
    exchange_rates?: Record<string, number>
    rates_warning?: string
  }
}

// --- Helpers ---

const SMART_PRESETS = ['today', 'tomorrow', 'yesterday', 'this_week', 'this_month', 'this_year'] as const

const PRESET_LABELS: Record<string, string> = {
  today: 'Today',
  tomorrow: 'Tomorrow',
  yesterday: 'Yesterday',
  this_week: 'This Week',
  this_month: 'This Month',
  this_year: 'This Year',
  '7': 'Last 7 Days',
  '30': 'Last 30 Days',
  '60': 'Last 60 Days',
  '90': 'Last 90 Days',
  '180': 'Last 6 Months',
  '365': 'Last Year',
  custom: 'Custom Range',
}

const PIE_COLORS = ['#FB731E', '#F68846', '#DD6532', '#3A5C6E', '#22395D', '#67818F']

const PAYMENT_ICONS: Record<string, React.ReactNode> = {
  CARD: <CreditCard className="h-4 w-4" />,
  CASH: <Banknote className="h-4 w-4" />,
  OTHER: <Wallet className="h-4 w-4" />,
}

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount / 100)
}

function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex items-center gap-3 mb-5 mt-2">
      <div>
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="flex-1 h-px bg-border/60" />
    </div>
  )
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  GBP: '£', EUR: '€', USD: '$', AUD: 'A$', CAD: 'C$', JPY: '¥',
}

function CurrencyBreakdownAnnotation({ breakdown }: { breakdown?: CurrencyBreakdown[] }) {
  if (!breakdown) return null
  const foreign = breakdown.filter(b => b.currency !== 'GBP')
  if (foreign.length === 0) return null

  return (
    <div className="mt-1 space-y-0.5">
      {foreign.map(b => {
        const sym = CURRENCY_SYMBOLS[b.currency] || b.currency + ' '
        return (
          <p key={b.currency} className="text-[11px] text-muted-foreground leading-tight">
            {sym}{(b.amount / 100).toLocaleString('en-GB', { minimumFractionDigits: 2 })} {b.currency}
            {' \u2192 '}
            £{(b.converted_amount / 100).toLocaleString('en-GB', { minimumFractionDigits: 2 })} GBP
            <span className="opacity-60"> at {b.rate.toFixed(4)}</span>
          </p>
        )
      })}
    </div>
  )
}

// --- Date Comparison Helpers ---

function resolveCurrentDates(
  preset: string,
  customStart: string,
  customEnd: string,
): { start: string; end: string } | null {
  const today = new Date()
  const fmt = (d: Date) => d.toISOString().split('T')[0]

  switch (preset) {
    case 'today':
      return { start: fmt(today), end: fmt(today) }
    case 'tomorrow': {
      const t = new Date(today); t.setDate(t.getDate() + 1)
      return { start: fmt(t), end: fmt(t) }
    }
    case 'yesterday': {
      const y = new Date(today); y.setDate(y.getDate() - 1)
      return { start: fmt(y), end: fmt(y) }
    }
    case 'this_week': {
      const day = today.getDay()
      const mon = new Date(today); mon.setDate(mon.getDate() - ((day + 6) % 7))
      return { start: fmt(mon), end: fmt(today) }
    }
    case 'this_month':
      return { start: fmt(new Date(today.getFullYear(), today.getMonth(), 1)), end: fmt(today) }
    case 'this_year':
      return { start: fmt(new Date(today.getFullYear(), 0, 1)), end: fmt(today) }
    case 'custom':
      return customStart && customEnd ? { start: customStart, end: customEnd } : null
    default: {
      const days = parseInt(preset, 10)
      if (!isNaN(days) && days > 0) {
        const s = new Date(today); s.setDate(s.getDate() - days)
        return { start: fmt(s), end: fmt(today) }
      }
      return null
    }
  }
}

function getComparisonRange(
  curStart: string, curEnd: string, mode: string,
  custStart?: string, custEnd?: string,
): { start: string; end: string } | null {
  if (mode === 'none') return null
  if (mode === 'custom') return custStart && custEnd ? { start: custStart, end: custEnd } : null

  const s = new Date(curStart), e = new Date(curEnd)
  const durationDays = Math.round((e.getTime() - s.getTime()) / 86400000)
  const fmt = (d: Date) => d.toISOString().split('T')[0]

  if (mode === 'previous_period') {
    const ce = new Date(s); ce.setDate(ce.getDate() - 1)
    const cs = new Date(ce); cs.setDate(cs.getDate() - durationDays)
    return { start: fmt(cs), end: fmt(ce) }
  }
  if (mode === 'previous_year') {
    const cs = new Date(s); cs.setFullYear(cs.getFullYear() - 1)
    const ce = new Date(e); ce.setFullYear(ce.getFullYear() - 1)
    return { start: fmt(cs), end: fmt(ce) }
  }
  return null
}

function computeTrend(
  current: number, comparison: number, invertPositive = false,
): { value: number; isPositive: boolean; label: string } | undefined {
  if (comparison === 0 && current === 0) return undefined
  if (comparison === 0) return { value: 100, isPositive: !invertPositive, label: 'vs prior' }
  const pct = ((current - comparison) / Math.abs(comparison)) * 100
  return {
    value: Math.abs(Math.round(pct * 10) / 10),
    isPositive: invertPositive ? pct < 0 : pct >= 0,
    label: 'vs prior',
  }
}

function formatCompLabel(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
  const s = new Date(start + 'T00:00:00'), e = new Date(end + 'T00:00:00')
  if (start === end) return `vs ${s.toLocaleDateString('en-GB', opts)}`
  return `vs ${s.toLocaleDateString('en-GB', opts)} – ${e.toLocaleDateString('en-GB', opts)}`
}

// --- Main Component ---

export default function AnalyticsPage() {
  const { user } = useAuthStore()
  const { hasPermission } = usePermissionStore()
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'
  const isClientRole = user?.role === 'client'
  const hasMultipleClients = (user?.client_ids?.length ?? 0) > 1
  const showClientFilter = isAdmin || hasMultipleClients

  // Filter state
  const [datePreset, setDatePreset] = useState('today')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')
  const [selectedLocation, setSelectedLocation] = useState<string>('all')
  const [selectedClient, setSelectedClient] = useState<string>(
    isClientRole ? (user?.client_id || 'all') : 'all'
  )
  const [selectedClientGroup, setSelectedClientGroup] = useState<string>('all')
  const [filtersOpen, setFiltersOpen] = useState(false)

  // Comparison state
  const [compareMode, setCompareMode] = useState<string>('none')
  const [compareStartDate, setCompareStartDate] = useState('')
  const [compareEndDate, setCompareEndDate] = useState('')

  // Count active (non-default) filters for the mobile badge
  const activeFilterCount = [
    datePreset !== 'today',
    selectedLocation !== 'all',
    selectedClient !== 'all' && selectedClient !== user?.client_id,
    selectedClientGroup !== 'all',
    compareMode !== 'none',
  ].filter(Boolean).length

  // Don't fire queries until both custom dates are filled in
  const isDateRangeReady = datePreset !== 'custom' || (!!customStartDate && !!customEndDate)

  // --- Locations & Clients ---

  // Admins: fetch all locations via square accounts
  const { data: adminLocations } = useQuery({
    queryKey: ['all-locations'],
    queryFn: async () => {
      const accountsData = await apiClient.get('/square/accounts')
      if (!accountsData.accounts || accountsData.accounts.length === 0) return []
      const locationPromises = accountsData.accounts.map((account: any) =>
        apiClient.get(`/square/accounts/${account.id}/locations`)
      )
      const locationResults = await Promise.all(locationPromises)
      return locationResults.flatMap((result: any) => result.locations || [])
    },
    enabled: isAdmin,
  })

  // Non-admins with multiple clients: fetch locations only for their assigned clients
  const { data: scopedLocations } = useQuery({
    queryKey: ['scoped-locations', user?.client_ids],
    queryFn: async () => {
      const ids = user?.client_ids || []
      if (ids.length === 0) return []
      const results = await Promise.all(
        ids.map((cid: string) => apiClient.get(`/clients/${cid}/locations`))
      )
      return results.flatMap((r: any) => r.locations || [])
    },
    enabled: !isAdmin && hasMultipleClients,
  })

  const allLocations = isAdmin ? adminLocations : scopedLocations

  const { data: clientsData } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => apiClient.get('/clients'),
    enabled: showClientFilter,
  })

  const { data: clientGroupsData } = useQuery({
    queryKey: ['client-groups'],
    queryFn: () => apiClient.get<{ client_groups: Array<{ id: string; name: string; client_ids: string[] }> }>('/client-groups'),
    enabled: showClientFilter,
  })

  const { data: clientLocationsData } = useQuery({
    queryKey: ['client-locations', selectedClient],
    queryFn: async () => {
      if (selectedClient === 'all') return null
      return await apiClient.get(`/clients/${selectedClient}/locations`)
    },
    enabled: showClientFilter && selectedClient !== 'all',
  })

  const filteredLocations = selectedClient !== 'all' && clientLocationsData?.locations
    ? clientLocationsData.locations
    : allLocations || []

  // --- Query Param Builders ---

  /** Builds params with date_preset OR start_date/end_date for aggregation-style endpoints */
  const buildQueryParams = () => {
    const params = new URLSearchParams()
    if (selectedClientGroup !== 'all') params.append('client_group_id', selectedClientGroup)
    if (selectedClient !== 'all') params.append('client_id', selectedClient)
    if (selectedLocation !== 'all') params.append('location_ids', selectedLocation)

    if (datePreset === 'custom') {
      if (customStartDate) params.append('start_date', customStartDate)
      if (customEndDate) params.append('end_date', customEndDate)
    } else if ((SMART_PRESETS as readonly string[]).includes(datePreset)) {
      params.append('date_preset', datePreset)
    } else {
      // Numeric day values: calculate explicit date range
      const days = parseInt(datePreset, 10)
      if (!isNaN(days) && days > 0) {
        const end = new Date()
        const start = new Date()
        start.setDate(start.getDate() - days)
        params.append('start_date', start.toISOString().split('T')[0])
        params.append('end_date', end.toISOString().split('T')[0])
      }
    }
    return params
  }

  // --- Data Fetching (single fast endpoint instead of 8 separate calls) ---

  const { data: fastData, isLoading: aggregationLoading, refetch } = useQuery({
    queryKey: ['fast-analytics', datePreset, customStartDate, customEndDate, selectedLocation, selectedClient, selectedClientGroup],
    queryFn: () => apiClient.get<{
      aggregation: SalesAggregation
      summary: {
        total_sales: number; transaction_count: number; average_transaction: number
        currency: string; by_tender_type: Record<string, number>
        by_status: Record<string, number>
        top_days: Array<{ date: string; total_sales: number; transaction_count: number }>
      }
      basket: { average_order_value: number; average_items_per_order: number; total_orders: number; total_items: number; currency: string }
      hourly: Array<{ hour: number; sales: number; transactions: number; items: number }>
      top_products: Array<{ product_name: string; total_quantity: number; total_revenue: number; transaction_count: number; average_price: number }>
      refunds: { total_refunds: number; total_refund_amount: number; refund_rate: number; currency: string; by_currency?: CurrencyBreakdown[] }
      discounts?: { total_discounts: number; currency: string; by_currency?: CurrencyBreakdown[] }
      tax?: { total_tax: number; total_tips: number; currency: string; by_currency?: CurrencyBreakdown[] }
      sales_by_location: Array<{ location_id: string; location_name: string; total_sales: number; converted_total_sales: number; total_transactions: number; average_transaction: number; currency: string; rate_to_gbp: number }>
      sales_by_client?: Array<{ client_id: string; client_name: string; total_sales: number; total_transactions: number; location_count: number; average_transaction: number }>
      by_artist?: Array<{ artist_name: string; revenue: number; quantity: number; transaction_count: number }>
      exchange_rates?: Record<string, number>
      rates_warning?: string
      category_filtered?: boolean
    }>(`/sales/analytics/fast-summary?${buildQueryParams()}`),
    enabled: isDateRangeReady,
  })

  // --- Comparison Period ---
  const currentDates = resolveCurrentDates(datePreset, customStartDate, customEndDate)
  const comparisonDates = currentDates && compareMode !== 'none'
    ? getComparisonRange(currentDates.start, currentDates.end, compareMode, compareStartDate, compareEndDate)
    : null

  const { data: comparisonFastData } = useQuery({
    queryKey: ['fast-analytics-comparison', compareMode, comparisonDates?.start, comparisonDates?.end, selectedLocation, selectedClient, selectedClientGroup],
    queryFn: () => {
      const params = new URLSearchParams()
      if (selectedClientGroup !== 'all') params.append('client_group_id', selectedClientGroup)
      if (selectedClient !== 'all') params.append('client_id', selectedClient)
      if (selectedLocation !== 'all') params.append('location_ids', selectedLocation)
      params.append('start_date', comparisonDates!.start)
      params.append('end_date', comparisonDates!.end)
      return apiClient.get<any>(`/sales/analytics/fast-summary?${params}`)
    },
    enabled: isDateRangeReady && !!comparisonDates,
  })

  // Compute comparison values with partial-day adjustment for "today"
  const compValues = useMemo(() => {
    if (!comparisonFastData) return null
    const comp = comparisonFastData
    const isPartialDay = datePreset === 'today'
    const currentHour = new Date().getHours()

    let totalSales = comp.aggregation?.total_sales || 0
    let totalTransactions = comp.aggregation?.total_transactions || 0
    let totalItems = comp.basket?.total_items || 0

    if (isPartialDay && comp.hourly && currentHour > 0) {
      totalSales = comp.hourly.filter((h: any) => h.hour < currentHour).reduce((s: number, h: any) => s + h.sales, 0)
      totalTransactions = comp.hourly.filter((h: any) => h.hour < currentHour).reduce((s: number, h: any) => s + h.transactions, 0)
      totalItems = comp.hourly.filter((h: any) => h.hour < currentHour).reduce((s: number, h: any) => s + h.items, 0)
    }

    const fullSales = comp.aggregation?.total_sales || 1
    const ratio = isPartialDay && currentHour > 0 ? totalSales / fullSales : 1
    const tax = Math.round((comp.tax?.total_tax || 0) * ratio)

    return {
      totalSales,
      totalTransactions,
      totalItems,
      avgTransaction: totalTransactions > 0 ? Math.round(totalSales / totalTransactions) : 0,
      avgItemsPerOrder: totalTransactions > 0 ? Math.round((totalItems / totalTransactions) * 100) / 100 : 0,
      tax,
      discounts: Math.round((comp.discounts?.total_discounts || 0) * ratio),
      refundAmount: Math.round((comp.refunds?.total_refund_amount || 0) * ratio),
      netSales: totalSales - tax,
    }
  }, [comparisonFastData, datePreset])

  const compLabel = comparisonDates ? formatCompLabel(comparisonDates.start, comparisonDates.end) : ''

  // Budget performance data (admin only)
  const { data: budgetPerformanceData } = useQuery({
    queryKey: ['budget-performance', datePreset, customStartDate, customEndDate, selectedLocation, selectedClient, selectedClientGroup],
    queryFn: () => apiClient.get<BudgetPerformanceReport>(
      `/budgets/performance/report?${buildQueryParams()}`
    ),
    enabled: isDateRangeReady && (isAdmin || hasPermission('report:budget_vs_actual')),
  })

  // Location groups for aggregated view
  const { data: locationGroupsData } = useQuery({
    queryKey: ['location-groups'],
    queryFn: () => apiClient.get<{ location_groups: Array<{ id: string; name: string; location_ids: string[] }> }>('/location-groups'),
    enabled: isDateRangeReady,
  })

  // --- Derived from fast endpoint ---

  const aggregationData = fastData?.aggregation
  const summaryData = fastData?.summary
  const topProductsData = fastData?.top_products
  const basketData = fastData?.basket
  const hourlyData = fastData?.hourly
  const refundsData = fastData?.refunds
  const discountsData = fastData?.discounts
  const taxData = fastData?.tax
  const salesByLocationData = fastData?.sales_by_location
  const salesByClientData = fastData?.sales_by_client

  const byArtistData = fastData?.by_artist
  const isCategoryFiltered = fastData?.category_filtered === true

  // Find selected client data to check for keywords
  const selectedClientData = clientsData?.clients?.find((c: any) => c.id === selectedClient)
  const clientHasKeywords = selectedClientData?.category_keywords && selectedClientData.category_keywords.length > 0

  const currency = aggregationData?.currency || 'GBP'
  const currencySymbol = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency
  const dateRangeLabel = datePreset === 'custom'
    ? (customStartDate && customEndDate
        ? `${customStartDate} to ${customEndDate}`
        : 'Custom Range')
    : (PRESET_LABELS[datePreset] || `Last ${datePreset} days`)
  const hasBudgetData = !!(budgetPerformanceData?.summary && budgetPerformanceData.summary.total_budget > 0)

  const lineChartData = summaryData?.top_days.map((day) => ({
    date: day.date,
    sales: day.total_sales,
    transactions: day.transaction_count,
  })) || []

  const bestSeller = topProductsData && topProductsData.length > 0 ? topProductsData[0] : null

  // Location group expand/collapse state
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  // Process sales by location with grouping
  const processedSalesData = useMemo(() => {
    if (!salesByLocationData) return []
    const groups = locationGroupsData?.location_groups || []
    const result: any[] = []
    const groupedLocationIds = new Set<string>()

    for (const group of groups) {
      const children = salesByLocationData.filter((loc: any) =>
        group.location_ids.includes(loc.location_id)
      )
      if (children.length === 0) continue

      children.forEach((loc: any) => groupedLocationIds.add(loc.location_id))

      const totalTransactions = children.reduce((s: number, l: any) => s + l.total_transactions, 0)
      const convertedTotal = children.reduce((s: number, l: any) => s + (l.converted_total_sales || l.total_sales), 0)

      result.push({
        id: group.id,
        isGroup: true,
        name: group.name,
        total_transactions: totalTransactions,
        converted_total_sales: convertedTotal,
        average_transaction: totalTransactions > 0 ? Math.round(convertedTotal / totalTransactions) : 0,
        currency: 'GBP',
        children,
      })
    }

    // Add ungrouped locations
    for (const loc of salesByLocationData) {
      if (!groupedLocationIds.has(loc.location_id)) {
        result.push({
          id: loc.location_id,
          isGroup: false,
          name: loc.location_name,
          ...loc,
        })
      }
    }

    return result.sort((a, b) => (b.converted_total_sales || b.total_sales || 0) - (a.converted_total_sales || a.total_sales || 0))
  }, [salesByLocationData, locationGroupsData])

  // Aggregate budget performances by location
  const budgetByLocation = useMemo(() => {
    if (!budgetPerformanceData?.performances || budgetPerformanceData.performances.length === 0) return []
    const locationMap = new Map<string, {
      location_name: string; budget: number; sales: number;
      variance: number; attainment: number; status: string; currency: string
    }>()
    for (const perf of budgetPerformanceData.performances) {
      const existing = locationMap.get(perf.location_id)
      if (existing) {
        existing.budget += perf.budget_amount
        existing.sales += perf.actual_sales
        existing.variance = existing.sales - existing.budget
        existing.attainment = existing.budget > 0 ? (existing.sales / existing.budget) * 100 : 0
        existing.status = existing.attainment >= 100 ? 'exceeded' : existing.attainment >= 90 ? 'on_track' : 'below_target'
      } else {
        locationMap.set(perf.location_id, {
          location_name: perf.location_name,
          budget: perf.budget_amount,
          sales: perf.actual_sales,
          variance: perf.variance,
          attainment: perf.attainment_percentage,
          status: perf.status,
          currency: perf.currency,
        })
      }
    }
    return Array.from(locationMap.entries())
      .map(([id, data]) => ({ location_id: id, ...data }))
      .sort((a, b) => b.attainment - a.attainment)
  }, [budgetPerformanceData])

  // Budget chart data (same aggregation, different shape)
  const budgetChartData = useMemo(() =>
    budgetByLocation.map(loc => ({
      name: loc.location_name,
      sales: loc.sales,
      budget: loc.budget,
    })).sort((a, b) => b.budget - a.budget)
  , [budgetByLocation])

  // Payment methods data from summary
  const paymentMethodsData = useMemo(() => {
    if (!summaryData?.by_tender_type) return []
    return Object.entries(summaryData.by_tender_type)
      .map(([method, amount]) => ({ name: method, value: amount as number }))
      .sort((a, b) => b.value - a.value)
  }, [summaryData])

  const paymentTotal = paymentMethodsData.reduce((sum, p) => sum + p.value, 0)

  // --- Render ---

  return (
    <div className="min-h-screen bg-background">
      <AppNav />

      <main className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 overflow-hidden">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-foreground">Analytics</h2>
            <p className="text-muted-foreground mt-1">Performance insights across all locations</p>
          </div>
          <Button onClick={() => refetch()} variant="outline" size="sm" className="hidden md:inline-flex">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>

        {/* Filters */}
        <div className="mb-8 bg-card/80 backdrop-blur-sm border border-border/50 rounded-xl shadow-sm">
          {/* Mobile: collapsible toggle + refresh */}
          <div className="md:hidden flex items-center justify-between p-4">
            <button
              onClick={() => setFiltersOpen(!filtersOpen)}
              className="flex items-center gap-2"
            >
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">Filters</span>
              {activeFilterCount > 0 && (
                <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-medium">
                  {activeFilterCount}
                </span>
              )}
              {filtersOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </button>
            <Button onClick={() => refetch()} variant="outline" size="sm">
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>

          {/* Filter controls: always visible on md+, toggled on mobile */}
          <div className={`${filtersOpen ? 'flex' : 'hidden'} md:flex flex-wrap gap-3 p-4 pt-0 md:pt-4`}>
            <div className="hidden md:flex items-center gap-2 mr-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">Filters</span>
            </div>

            <Select value={datePreset} onValueChange={setDatePreset}>
              <SelectTrigger className="w-full sm:w-[160px] h-9 text-sm">
                <SelectValue placeholder="Date range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="tomorrow">Tomorrow</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="this_week">This Week</SelectItem>
                <SelectItem value="this_month">This Month</SelectItem>
                <SelectItem value="this_year">This Year</SelectItem>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="60">Last 60 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="180">Last 6 months</SelectItem>
                <SelectItem value="365">Last year</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>

            {datePreset === 'custom' && (
              <>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="h-9 px-3 text-sm rounded-md border border-input bg-background text-foreground"
                  placeholder="From"
                />
                <span className="text-sm text-muted-foreground self-center">to</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="h-9 px-3 text-sm rounded-md border border-input bg-background text-foreground"
                  placeholder="To"
                />
              </>
            )}

            <Select value={compareMode} onValueChange={(v) => {
              setCompareMode(v)
              if (v !== 'custom') { setCompareStartDate(''); setCompareEndDate('') }
            }}>
              <SelectTrigger className="w-full sm:w-[180px] h-9 text-sm">
                <SelectValue placeholder="Compare to..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No comparison</SelectItem>
                <SelectItem value="previous_period">Previous period</SelectItem>
                <SelectItem value="previous_year">Same period last year</SelectItem>
                <SelectItem value="custom">Custom comparison</SelectItem>
              </SelectContent>
            </Select>

            {compareMode === 'custom' && (
              <>
                <input
                  type="date"
                  value={compareStartDate}
                  onChange={(e) => setCompareStartDate(e.target.value)}
                  className="h-9 px-3 text-sm rounded-md border border-input bg-background text-foreground"
                />
                <span className="text-sm text-muted-foreground self-center">to</span>
                <input
                  type="date"
                  value={compareEndDate}
                  onChange={(e) => setCompareEndDate(e.target.value)}
                  className="h-9 px-3 text-sm rounded-md border border-input bg-background text-foreground"
                />
              </>
            )}

            {comparisonDates && compareMode !== 'none' && (
              <span className="text-xs text-muted-foreground self-center">{compLabel}</span>
            )}

            {showClientFilter && (
              <>
                {clientGroupsData?.client_groups && clientGroupsData.client_groups.length > 0 && (
                  <Select value={selectedClientGroup} onValueChange={(value) => {
                    setSelectedClientGroup(value)
                    if (value !== 'all') {
                      setSelectedClient('all')
                    }
                    setSelectedLocation('all')
                  }}>
                    <SelectTrigger className="w-full sm:w-[180px] h-9 text-sm">
                      <SelectValue placeholder="All client groups" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All client groups</SelectItem>
                      {clientGroupsData.client_groups.map((group: any) => (
                        <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                <Select value={selectedClient} onValueChange={(value) => {
                  setSelectedClient(value)
                  if (value !== 'all') {
                    setSelectedClientGroup('all')
                  }
                  setSelectedLocation('all')
                }}>
                  <SelectTrigger className="w-full sm:w-[180px] h-9 text-sm">
                    <SelectValue placeholder="All clients" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All clients</SelectItem>
                    {(clientsData?.clients || [])
                      .filter((client: any) => isAdmin || !user?.client_ids || user.client_ids.includes(client.id))
                      .map((client: any) => (
                      <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {!clientHasKeywords && (
                  <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                    <SelectTrigger className="w-full sm:w-[200px] h-9 text-sm">
                      <SelectValue placeholder="All locations" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        {selectedClient !== 'all' ? 'All client locations' : 'All locations'}
                      </SelectItem>
                      {filteredLocations?.map((location: any) => (
                        <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {clientHasKeywords && (
                  <div className="flex items-center gap-1.5 px-3 h-9 rounded-md bg-violet-50 border border-violet-200 text-violet-700 text-sm">
                    <Package className="h-3.5 w-3.5" />
                    <span>Category filtered</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Loading state */}
        {aggregationLoading && (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {!aggregationLoading && (
          <>
            {/* Category filter indicator — only show to admins */}
            {isCategoryFiltered && showClientFilter && (
              <div className="flex items-center gap-2 mb-4 px-4 py-2.5 rounded-lg bg-violet-50 border border-violet-200 text-violet-800 text-sm">
                <Package className="h-4 w-4 flex-shrink-0" />
                <span>Filtering by product categories: <strong>{selectedClientData?.category_keywords?.join(', ')}</strong></span>
              </div>
            )}

            {/* Rates warning */}
            {fastData?.rates_warning && (
              <div className="flex items-center gap-2 mb-4 px-4 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                <span>{fastData.rates_warning}</span>
              </div>
            )}

            {/* ═══════════════════ SALES PERFORMANCE ═══════════════════ */}
            <SectionHeader title="Sales Performance" description={dateRangeLabel} />

            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
              <KPICard
                title="Total Sales"
                value={aggregationData?.total_sales || 0}
                format="currency"
                currency="GBP"
                icon={<DollarSign className="h-4 w-4" />}
                description={dateRangeLabel}
                accentColor="#FB731E"
                trend={compValues ? computeTrend(aggregationData?.total_sales || 0, compValues.totalSales) : undefined}
                annotation={<CurrencyBreakdownAnnotation breakdown={aggregationData?.by_currency} />}
              />
              <KPICard
                title="Net Sales"
                value={(aggregationData?.total_sales || 0) - (taxData?.total_tax || 0)}
                format="currency"
                currency="GBP"
                icon={<Calculator className="h-4 w-4" />}
                description="Excl. tax"
                accentColor="#10b981"
                trend={compValues ? computeTrend((aggregationData?.total_sales || 0) - (taxData?.total_tax || 0), compValues.netSales) : undefined}
                annotation={<CurrencyBreakdownAnnotation breakdown={
                  taxData?.by_currency && aggregationData?.by_currency
                    ? aggregationData.by_currency.map(s => {
                        const t = taxData.by_currency?.find(tc => tc.currency === s.currency)
                        return {
                          ...s,
                          amount: s.amount - (t?.amount || 0),
                          converted_amount: s.converted_amount - (t?.converted_amount || 0),
                        }
                      })
                    : undefined
                } />}
              />
              <KPICard
                title="Tax"
                value={taxData?.total_tax || 0}
                format="currency"
                currency="GBP"
                icon={<Receipt className="h-4 w-4" />}
                description={dateRangeLabel}
                accentColor="#8b5cf6"
                trend={compValues ? computeTrend(taxData?.total_tax || 0, compValues.tax) : undefined}
                annotation={<CurrencyBreakdownAnnotation breakdown={taxData?.by_currency} />}
              />
              <KPICard
                title="Transactions"
                value={aggregationData?.total_transactions || 0}
                format="number"
                icon={<ShoppingCart className="h-4 w-4" />}
                description={dateRangeLabel}
                accentColor="#FB731E"
                trend={compValues ? computeTrend(aggregationData?.total_transactions || 0, compValues.totalTransactions) : undefined}
              />
            </div>

            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
              <KPICard
                title="Avg Order Value"
                value={basketData?.average_order_value || 0}
                format="currency"
                currency={currency}
                icon={<TrendingUp className="h-4 w-4" />}
                description="Per transaction"
                accentColor="#FB731E"
                trend={compValues ? computeTrend(basketData?.average_order_value || 0, compValues.avgTransaction) : undefined}
              />
              <KPICard
                title="Items per Order"
                value={basketData?.average_items_per_order || 0}
                format="number"
                icon={<Package className="h-4 w-4" />}
                description="Basket size"
                accentColor="#FB731E"
                trend={compValues ? computeTrend(basketData?.average_items_per_order || 0, compValues.avgItemsPerOrder) : undefined}
              />
              <KPICard
                title="Total Items Sold"
                value={basketData?.total_items || 0}
                format="number"
                icon={<Package className="h-4 w-4" />}
                description={dateRangeLabel}
                accentColor="#6366f1"
                trend={compValues ? computeTrend(basketData?.total_items || 0, compValues.totalItems) : undefined}
              />
              <KPICard
                title="Best Seller"
                value={bestSeller?.product_name || 'N/A'}
                icon={<TrendingUp className="h-4 w-4" />}
                description={bestSeller ? `${bestSeller.total_quantity} units sold` : 'No data'}
                accentColor="#6366f1"
              />
            </div>

            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-8">
              <KPICard
                title="Discounts"
                value={discountsData?.total_discounts || 0}
                format="currency"
                currency={currency}
                icon={<CreditCard className="h-4 w-4" />}
                description="Total discounts applied"
                accentColor="#f59e0b"
                trend={compValues ? computeTrend(discountsData?.total_discounts || 0, compValues.discounts, true) : undefined}
                annotation={<CurrencyBreakdownAnnotation breakdown={discountsData?.by_currency} />}
              />
              <KPICard
                title="Refunds"
                value={refundsData?.total_refund_amount || 0}
                format="currency"
                currency={currency}
                icon={<TrendingUp className="h-4 w-4" />}
                description={`${refundsData?.total_refunds || 0} orders (${Number(refundsData?.refund_rate || 0).toFixed(1)}% rate)`}
                accentColor="#ef4444"
                trend={compValues ? computeTrend(refundsData?.total_refund_amount || 0, compValues.refundAmount, true) : undefined}
                annotation={<CurrencyBreakdownAnnotation breakdown={refundsData?.by_currency} />}
              />
            </div>

            {/* ═══════════════════ BUDGET PERFORMANCE ═══════════════════ */}
            {(isAdmin || hasPermission('report:budget_vs_actual')) && hasBudgetData && (
              <>
                <SectionHeader title="Budget Performance" description={`Budget vs actual - ${dateRangeLabel}`} />

                {/* Budget KPIs */}
                <div className="grid gap-4 grid-cols-2 md:grid-cols-3 mb-6">
                  <KPICard
                    title="Budget Attainment"
                    value={Number(budgetPerformanceData!.summary.overall_attainment_percentage)}
                    format="percentage"
                    icon={<Target className="h-4 w-4" />}
                    description={`${formatCurrency(Number(budgetPerformanceData!.summary.total_budget), 'GBP')} target`}
                    accentColor={Number(budgetPerformanceData!.summary.overall_attainment_percentage) >= 100 ? '#10b981' : Number(budgetPerformanceData!.summary.overall_attainment_percentage) >= 90 ? '#f59e0b' : '#ef4444'}
                    trend={{
                      value: Math.abs(Number(budgetPerformanceData!.summary.overall_attainment_percentage) - 100),
                      isPositive: Number(budgetPerformanceData!.summary.overall_attainment_percentage) >= 100,
                      label: Number(budgetPerformanceData!.summary.overall_attainment_percentage) >= 100 ? 'above target' : 'below target',
                    }}
                    annotation={<CurrencyBreakdownAnnotation breakdown={budgetPerformanceData!.summary.budget_by_currency} />}
                  />
                  <KPICard
                    title="Budget Variance"
                    value={Number(budgetPerformanceData!.summary.overall_variance)}
                    format="currency"
                    currency="GBP"
                    icon={<TrendingUp className="h-4 w-4" />}
                    description={dateRangeLabel}
                    accentColor={Number(budgetPerformanceData!.summary.overall_variance) >= 0 ? '#10b981' : '#ef4444'}
                    trend={{
                      value: Number(budgetPerformanceData!.summary.total_budget) > 0
                        ? Math.abs((Number(budgetPerformanceData!.summary.overall_variance) / Number(budgetPerformanceData!.summary.total_budget)) * 100)
                        : 0,
                      isPositive: Number(budgetPerformanceData!.summary.overall_variance) >= 0,
                      label: Number(budgetPerformanceData!.summary.overall_variance) >= 0 ? 'over budget' : 'under budget',
                    }}
                    annotation={<CurrencyBreakdownAnnotation breakdown={budgetPerformanceData!.summary.sales_by_currency} />}
                  />
                  <KPICard
                    title="Locations on Target"
                    value={`${budgetPerformanceData!.summary.locations_on_target} / ${budgetPerformanceData!.summary.total_locations}`}
                    icon={<BarChart3 className="h-4 w-4" />}
                    description={`${budgetPerformanceData!.summary.total_locations > 0 ? Math.round((budgetPerformanceData!.summary.locations_on_target / budgetPerformanceData!.summary.total_locations) * 100) : 0}% meeting target`}
                    accentColor="#10b981"
                  />
                </div>

                {/* Sales vs Budget Chart */}
                {budgetChartData.length > 0 && (
                  <Card className="mb-6">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base font-semibold">Sales vs Budget by Location</CardTitle>
                      <CardDescription>Actual sales compared to budget targets</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={budgetChartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                          <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} stroke="hsl(var(--border))" tickLine={false} axisLine={false} />
                          <YAxis tickFormatter={(v: number) => `${currencySymbol}${(v / 100).toFixed(0)}`} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} stroke="hsl(var(--border))" tickLine={false} axisLine={false} width={50} />
                          <Tooltip
                            contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px', border: '1px solid hsl(var(--border))', color: 'hsl(var(--foreground))', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
                            labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
                            formatter={(value: number, name: string) => [
                              formatCurrency(value, currency),
                              name,
                            ]}
                          />
                          <Legend wrapperStyle={{ color: 'hsl(var(--muted-foreground))' }} />
                          <Bar dataKey="budget" fill="#94a3b8" name="Budget Target" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="sales" fill="#FB731E" name="Actual Sales" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                {/* Budget Performance by Location Table */}
                {budgetByLocation.length > 0 && (
                  <Card className="mb-8">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base font-semibold">Budget Performance by Location</CardTitle>
                      <CardDescription>Detailed breakdown of budget attainment per location</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-border bg-muted/50">
                              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Location</th>
                              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Budget</th>
                              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actual Sales (Net)</th>
                              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Variance</th>
                              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Attainment</th>
                              <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {budgetByLocation.map((loc) => (
                              <tr key={loc.location_id} className="hover:bg-muted/30 transition-colors">
                                <td className="px-4 py-3 text-sm font-medium text-foreground">{loc.location_name}</td>
                                <td className="px-4 py-3 text-sm text-right text-muted-foreground">
                                  {formatCurrency(loc.budget, loc.currency)}
                                </td>
                                <td className="px-4 py-3 text-sm text-right font-semibold text-foreground">
                                  {formatCurrency(loc.sales, loc.currency)}
                                </td>
                                <td className={`px-4 py-3 text-sm text-right font-semibold ${loc.variance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                  {loc.variance >= 0 ? '+' : ''}{formatCurrency(loc.variance, loc.currency)}
                                </td>
                                <td className={`px-4 py-3 text-sm text-right font-semibold ${
                                  loc.attainment >= 100 ? 'text-emerald-600' : loc.attainment >= 90 ? 'text-amber-600' : 'text-red-600'
                                }`}>
                                  {Number(loc.attainment).toFixed(1)}%
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                    loc.status === 'exceeded' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20' :
                                    loc.status === 'on_track' ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-600/20' :
                                    'bg-red-50 text-red-700 ring-1 ring-red-600/20'
                                  }`}>
                                    {loc.status === 'exceeded' ? 'Exceeded' : loc.status === 'on_track' ? 'On Track' : 'Below Target'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-border bg-muted/40">
                              <td className="px-4 py-3 text-sm font-semibold text-foreground">Total</td>
                              <td className="px-4 py-3 text-sm text-right font-semibold text-foreground">
                                <div>{formatCurrency(Number(budgetPerformanceData!.summary.total_budget), 'GBP')}</div>
                                <CurrencyBreakdownAnnotation breakdown={budgetPerformanceData!.summary.budget_by_currency} />
                              </td>
                              <td className="px-4 py-3 text-sm text-right font-semibold text-primary">
                                <div>{formatCurrency(Number(budgetPerformanceData!.summary.total_sales), 'GBP')}</div>
                                <CurrencyBreakdownAnnotation breakdown={budgetPerformanceData!.summary.sales_by_currency} />
                              </td>
                              <td className={`px-4 py-3 text-sm text-right font-semibold ${Number(budgetPerformanceData!.summary.overall_variance) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                {Number(budgetPerformanceData!.summary.overall_variance) >= 0 ? '+' : ''}
                                {formatCurrency(Number(budgetPerformanceData!.summary.overall_variance), 'GBP')}
                              </td>
                              <td className="px-4 py-3 text-sm text-right font-semibold text-primary">
                                {Number(budgetPerformanceData!.summary.overall_attainment_percentage).toFixed(1)}%
                              </td>
                              <td className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">
                                {budgetPerformanceData!.summary.locations_on_target}/{budgetPerformanceData!.summary.total_locations} on target
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            {/* ═══════════════════ SALES ANALYTICS ═══════════════════ */}
            <SectionHeader title="Sales Analytics" description="Trends and patterns" />

            {/* Sales Trend - Full Width */}
            <div className="mb-6">
              <SalesLineChart
                data={lineChartData}
                title="Sales Trend"
                description={`Daily sales - ${dateRangeLabel}`}
                currency={currency}
              />
            </div>

            <div className="grid gap-6 md:grid-cols-2 mb-6">
              <TopProductsChart
                data={topProductsData || []}
                title="Top 10 Products"
                description={`Best-sellers by revenue - ${dateRangeLabel}`}
                currency={currency}
                limit={10}
              />
              <div className="flex flex-col gap-6">
                <HourlySalesChart
                  data={hourlyData || []}
                  title="Hourly Sales Pattern"
                  description={`Average daily sales by hour - ${dateRangeLabel}`}
                  currency={currency}
                />
                {salesByClientData && (selectedClientGroup !== 'all' ? salesByClientData.length > 0 : salesByClientData.length > 1) && hasPermission('feature:view_sales_by_client') && (
                  <SalesByClientChart
                    data={salesByClientData}
                    title="Sales by Client"
                    description={`Client performance - ${dateRangeLabel}`}
                    currency={currency}
                  />
                )}
              </div>
            </div>

            {/* ═══════════════════ SALES BY ARTIST ═══════════════════ */}
            {byArtistData && byArtistData.length > 0 && (
              <>
                <SectionHeader title="Sales by Artist" description={`Artist breakdown - ${dateRangeLabel}`} />
                <Card className="mb-8">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold">Artist Performance</CardTitle>
                    <CardDescription>Revenue and quantity breakdown by artist</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-border bg-muted/50">
                            <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-8">#</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Artist</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Quantity Sold</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Transactions</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Revenue</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {byArtistData.map((artist, index) => (
                            <tr key={artist.artist_name} className="hover:bg-muted/30 transition-colors">
                              <td className="px-4 py-3 text-sm text-muted-foreground">{index + 1}</td>
                              <td className="px-4 py-3 text-sm font-medium text-foreground">{artist.artist_name}</td>
                              <td className="px-4 py-3 text-sm text-right text-foreground">{artist.quantity.toLocaleString()}</td>
                              <td className="px-4 py-3 text-sm text-right text-muted-foreground">{artist.transaction_count.toLocaleString()}</td>
                              <td className="px-4 py-3 text-sm text-right font-semibold text-foreground">
                                {formatCurrency(artist.revenue, 'GBP')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-border bg-muted/40">
                            <td className="px-4 py-3" />
                            <td className="px-4 py-3 text-sm font-semibold text-foreground">Total</td>
                            <td className="px-4 py-3 text-sm text-right font-semibold text-foreground">
                              {byArtistData.reduce((sum, a) => sum + a.quantity, 0).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-sm text-right font-semibold text-foreground">
                              {byArtistData.reduce((sum, a) => sum + a.transaction_count, 0).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-sm text-right font-semibold text-primary">
                              {formatCurrency(byArtistData.reduce((sum, a) => sum + a.revenue, 0), 'GBP')}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

            {/* ═══════════════════ LOCATION & PAYMENT INSIGHTS ═══════════════════ */}
            <SectionHeader title="Location & Payment Insights" />

            <div className="grid gap-6 md:grid-cols-3 mb-6">
              {/* Payment Methods Breakdown */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold">Payment Methods</CardTitle>
                  <CardDescription>Breakdown by tender type - {dateRangeLabel}</CardDescription>
                </CardHeader>
                <CardContent>
                  {paymentMethodsData.length > 0 ? (
                    <div className="space-y-4">
                      <ResponsiveContainer width="100%" height={180}>
                        <PieChart>
                          <Pie
                            data={paymentMethodsData}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={75}
                            paddingAngle={3}
                            dataKey="value"
                          >
                            {paymentMethodsData.map((_, index) => (
                              <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value: number) => formatCurrency(value, currency)} contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-2">
                        {paymentMethodsData.map((method, index) => (
                          <div key={method.name} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }} />
                              <span className="flex items-center gap-1.5 text-muted-foreground">
                                {PAYMENT_ICONS[method.name] || PAYMENT_ICONS.OTHER}
                                {method.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-medium">{formatCurrency(method.value, currency)}</span>
                              <span className="text-muted-foreground text-xs w-10 text-right">
                                {paymentTotal > 0 ? `${((method.value / paymentTotal) * 100).toFixed(0)}%` : '0%'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground py-8 text-center">No payment data available</p>
                  )}
                </CardContent>
              </Card>

              {/* Sales by Location Table */}
              <Card className="md:col-span-2">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold">Sales by Location</CardTitle>
                  <CardDescription>Performance breakdown - {dateRangeLabel}</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {salesByLocationData && salesByLocationData.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-border bg-muted/50">
                            <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-8">#</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Location</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Transactions</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Avg Transaction</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Sales</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {processedSalesData.map((item: any, index: number) => (
                            <React.Fragment key={item.id}>
                              <tr
                                className={`transition-colors ${item.isGroup ? 'bg-muted/20 hover:bg-muted/40 cursor-pointer' : 'hover:bg-muted/30'}`}
                                onClick={item.isGroup ? () => toggleGroup(item.id) : undefined}
                              >
                                <td className="px-4 py-3 text-sm text-muted-foreground">{index + 1}</td>
                                <td className="px-4 py-3 text-sm font-medium text-foreground">
                                  <div className="flex items-center gap-2">
                                    {item.isGroup && (
                                      expandedGroups.has(item.id)
                                        ? <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                        : <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                    )}
                                    <span className={item.isGroup ? 'font-semibold' : ''}>{item.name}</span>
                                    {!item.isGroup && item.currency !== 'GBP' && (
                                      <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-normal">
                                        {item.currency}
                                      </span>
                                    )}
                                    {item.isGroup && (
                                      <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary font-normal">
                                        {item.children.length} locations
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-sm text-right text-foreground">
                                  {item.total_transactions.toLocaleString()}
                                </td>
                                <td className="px-4 py-3 text-sm text-right text-muted-foreground">
                                  {formatCurrency(item.average_transaction, item.isGroup ? 'GBP' : item.currency)}
                                </td>
                                <td className="px-4 py-3 text-sm text-right font-semibold text-foreground">
                                  {item.isGroup
                                    ? formatCurrency(item.converted_total_sales, 'GBP')
                                    : formatCurrency(item.total_sales, item.currency)
                                  }
                                </td>
                              </tr>
                              {/* Expanded child locations */}
                              {item.isGroup && expandedGroups.has(item.id) && item.children.map((child: any) => (
                                <tr key={child.location_id} className="bg-muted/10 hover:bg-muted/20 transition-colors">
                                  <td className="px-4 py-2 text-sm text-muted-foreground"></td>
                                  <td className="px-4 py-2 text-sm text-foreground pl-12">
                                    <div className="flex items-center gap-2">
                                      <span className="text-muted-foreground/50">└</span>
                                      {child.location_name}
                                      {child.currency !== 'GBP' && (
                                        <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-normal">
                                          {child.currency}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 text-sm text-right text-muted-foreground">
                                    {child.total_transactions.toLocaleString()}
                                  </td>
                                  <td className="px-4 py-2 text-sm text-right text-muted-foreground">
                                    {formatCurrency(child.average_transaction, 'GBP')}
                                  </td>
                                  <td className="px-4 py-2 text-sm text-right text-muted-foreground">
                                    {formatCurrency(child.converted_total_sales || child.total_sales, 'GBP')}
                                    {child.currency !== 'GBP' && (
                                      <div className="text-[10px] text-muted-foreground/60">
                                        {formatCurrency(child.total_sales, child.currency)} → GBP
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </React.Fragment>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-border bg-muted/40">
                            <td className="px-4 py-3" />
                            <td className="px-4 py-3 text-sm font-semibold text-foreground">Total</td>
                            <td className="px-4 py-3 text-sm text-right font-semibold text-foreground">
                              {salesByLocationData.reduce((sum: number, loc: any) => sum + loc.total_transactions, 0).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-muted-foreground">—</td>
                            <td className="px-4 py-3 text-sm text-right font-semibold text-primary">
                              <div>
                                {formatCurrency(
                                  salesByLocationData.reduce((sum: number, loc: any) => sum + (loc.converted_total_sales || loc.total_sales), 0),
                                  'GBP'
                                )}
                              </div>
                              <CurrencyBreakdownAnnotation breakdown={aggregationData?.by_currency} />
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground py-8 text-center">No sales data available for the selected period.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
