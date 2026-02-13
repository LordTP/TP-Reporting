/**
 * Sales Page
 * View and analyze sales transactions
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { Link } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import AppNav from '@/components/layout/AppNav'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { RefreshCw, DollarSign, Calendar, Filter, CreditCard, Banknote, MapPin, ChevronRight, Tag, Percent, Receipt } from 'lucide-react'

interface SalesTransaction {
  id: string
  location_name: string
  transaction_date: string
  amount_money_amount: number
  amount_money_currency: string
  total_money_amount: number
  total_money_currency: string
  total_discount_amount: number
  total_tax_amount: number
  total_tip_amount: number
  payment_status: string
  tender_type: string
  card_brand?: string
  last_4?: string
  customer_id?: string
  has_refund: boolean
  refund_amount: number
}

interface TransactionDetail extends SalesTransaction {
  square_transaction_id: string
  amount_money_usd_equivalent?: number
  product_categories?: string[]
  line_items?: Array<{
    name?: string
    quantity?: string
    base_price_money?: { amount?: number; currency?: string }
    total_money?: { amount?: number; currency?: string }
    variation_name?: string
  }>
  created_at: string
  raw_data?: Record<string, unknown>
}

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
  by_currency?: CurrencyBreakdown[]
  total_refunds?: number
  refunds_by_currency?: CurrencyBreakdown[]
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

export default function SalesPage() {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'
  const isClientRole = user?.role === 'client'
  const hasMultipleClients = (user?.client_ids?.length ?? 0) > 1
  const showClientFilter = isAdmin || hasMultipleClients

  // Filter state
  const [datePreset, setDatePreset] = useState('today') // Default to today
  const [selectedLocation, setSelectedLocation] = useState<string>('all')
  const [selectedClient, setSelectedClient] = useState<string>(
    isClientRole ? (user?.client_id || 'all') : 'all'
  )
  const [selectedClientGroup, setSelectedClientGroup] = useState<string>('all')

  // Transaction detail modal state
  const [selectedTxnId, setSelectedTxnId] = useState<string | null>(null)

  // Fetch clients for filter (admins get all, multi-client users get their scoped list)
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

  // Fetch client locations when a client is selected
  const { data: clientLocationsData } = useQuery({
    queryKey: ['client-locations', selectedClient],
    queryFn: async () => {
      if (selectedClient === 'all') return null
      return await apiClient.get(`/clients/${selectedClient}/locations`)
    },
    enabled: showClientFilter && selectedClient !== 'all',
  })

  // Filter locations based on selected client
  const filteredLocations = selectedClient !== 'all' && clientLocationsData?.locations
    ? clientLocationsData.locations
    : allLocations || []

  // Build query params
  const buildQueryParams = () => {
    const params = new URLSearchParams()
    // Allow both client group and individual client filters
    if (selectedClientGroup !== 'all') {
      params.append('client_group_id', selectedClientGroup)
    }
    if (selectedClient !== 'all') {
      params.append('client_id', selectedClient)
    }
    if (selectedLocation !== 'all') {
      params.append('location_ids', selectedLocation)
    }
    const smartPresets = ['today', 'yesterday', 'this_week', 'this_month', 'this_year']
    if (smartPresets.includes(datePreset)) {
      params.append('date_preset', datePreset)
    } else if (/^\d+$/.test(datePreset)) {
      params.append('days', datePreset)
    }
    return params
  }

  // Fetch recent transactions with filters
  const { data: transactionsData, isLoading: transactionsLoading, refetch: refetchTransactions } = useQuery({
    queryKey: ['sales-transactions', datePreset, selectedLocation, selectedClient, selectedClientGroup],
    queryFn: async () => {
      const params = buildQueryParams()
      return await apiClient.get<{ transactions: SalesTransaction[]; total: number }>(`/sales/transactions?page_size=50&sort_by=transaction_date&sort_order=desc&${params}`)
    },
  })

  // Fetch aggregation with filters
  const { data: aggregationData, isLoading: aggregationLoading } = useQuery({
    queryKey: ['sales-aggregation', datePreset, selectedLocation, selectedClient, selectedClientGroup],
    queryFn: async () => {
      const params = buildQueryParams()
      return await apiClient.get<SalesAggregation>(`/sales/aggregation?${params}`)
    },
  })

  // Fetch transaction detail when one is selected
  const { data: txnDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['transaction-detail', selectedTxnId],
    queryFn: () => apiClient.get<TransactionDetail>(`/sales/transactions/${selectedTxnId}`),
    enabled: !!selectedTxnId,
  })

  const transactions = transactionsData?.transactions || []
  const totalCount = transactionsData?.total || 0
  const aggregation = aggregationData

  const formatCurrency = (amount: number, currency: string) => {
    const dollars = amount / 100
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currency,
    }).format(dollars)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  const getTenderIcon = (type?: string) => {
    if (type === 'CARD') return <CreditCard className="h-4 w-4" />
    if (type === 'CASH') return <Banknote className="h-4 w-4" />
    return <Receipt className="h-4 w-4" />
  }

  const getTenderLabel = (type?: string, brand?: string, last4?: string) => {
    if (type === 'CARD') {
      const parts = [brand, last4 ? `••••${last4}` : null].filter(Boolean)
      return parts.length > 0 ? parts.join(' ') : 'Card'
    }
    if (type === 'CASH') return 'Cash'
    return type || 'Unknown'
  }

  return (
    <div className="min-h-screen bg-background">
      <AppNav />

      <main className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Sales Transactions</h2>
            <p className="text-muted-foreground mt-1">
              View and analyze your sales data
            </p>
          </div>
          <Button onClick={() => refetchTransactions()} variant="outline" className="shadow-md">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4 mb-8 p-4 sm:p-6 bg-card/80 backdrop-blur-sm rounded-xl border border-border/50 shadow-lg">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filters:</span>
          </div>
          <div className="flex-1 flex flex-wrap gap-3 sm:gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Date Range</label>
              <Select value={datePreset} onValueChange={setDatePreset}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Select date range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="tomorrow">Tomorrow</SelectItem>
                  <SelectItem value="yesterday">Yesterday</SelectItem>
                  <SelectItem value="this_week">This Week</SelectItem>
                  <SelectItem value="this_month">This Month</SelectItem>
                  <SelectItem value="this_year">This Year</SelectItem>
                  <SelectItem value="7">Last 7 Days</SelectItem>
                  <SelectItem value="30">Last 30 Days</SelectItem>
                  <SelectItem value="60">Last 60 Days</SelectItem>
                  <SelectItem value="90">Last 90 Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {showClientFilter && (
              <>
                {clientGroupsData?.client_groups && clientGroupsData.client_groups.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-muted-foreground">Client Group</label>
                    <Select value={selectedClientGroup} onValueChange={(value) => {
                      setSelectedClientGroup(value)
                      if (value !== 'all') {
                        setSelectedClient('all')
                      }
                      setSelectedLocation('all')
                    }}>
                      <SelectTrigger className="w-full sm:w-[200px]">
                        <SelectValue placeholder="All Client Groups" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Client Groups</SelectItem>
                        {clientGroupsData.client_groups.map((group: any) => (
                          <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">Client</label>
                  <Select value={selectedClient} onValueChange={(value) => {
                    setSelectedClient(value)
                    if (value !== 'all') {
                      setSelectedClientGroup('all')
                    }
                    setSelectedLocation('all')
                  }}>
                    <SelectTrigger className="w-full sm:w-[200px]">
                      <SelectValue placeholder="All Clients" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Clients</SelectItem>
                      {(clientsData?.clients || [])
                        .filter((client: any) => isAdmin || !user?.client_ids || user.client_ids.includes(client.id))
                        .map((client: any) => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {filteredLocations && filteredLocations.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-muted-foreground">Location</label>
                    <Select
                      value={selectedLocation}
                      onValueChange={setSelectedLocation}
                    >
                      <SelectTrigger className="w-full sm:w-[200px]">
                        <SelectValue placeholder="All Locations" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">
                          {selectedClient !== 'all' ? 'All client locations' : 'All Locations'}
                        </SelectItem>
                        {filteredLocations.map((location: any) => (
                          <SelectItem key={location.id} value={location.id}>
                            {location.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-3 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Gross Sales</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {aggregationLoading ? (
                <div className="text-2xl font-bold">Loading...</div>
              ) : aggregation ? (
                <>
                  <div className="text-2xl font-bold">
                    {formatCurrency(aggregation.total_sales, aggregation.currency)}
                  </div>
                  <CurrencyBreakdownAnnotation breakdown={aggregation.by_currency} />
                </>
              ) : (
                <div className="text-2xl font-bold">£0.00</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Refunds</CardTitle>
              <Receipt className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {aggregationLoading ? (
                <div className="text-2xl font-bold">Loading...</div>
              ) : aggregation && (aggregation.total_refunds ?? 0) > 0 ? (
                <>
                  <div className="text-2xl font-bold text-red-600">
                    -{formatCurrency(aggregation.total_refunds ?? 0, aggregation.currency)}
                  </div>
                  <CurrencyBreakdownAnnotation breakdown={aggregation.refunds_by_currency} />
                </>
              ) : (
                <div className="text-2xl font-bold text-muted-foreground">£0.00</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Transactions</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {aggregation ? aggregation.total_transactions.toLocaleString() : totalCount.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                Avg {aggregation && aggregation.total_transactions > 0 ? formatCurrency(aggregation.average_transaction, aggregation.currency) : '£0.00'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Transactions Table */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Transactions</CardTitle>
            <CardDescription>
              Showing the most recent {transactions.length} transactions — click a row for details
            </CardDescription>
          </CardHeader>
          <CardContent>
            {transactionsLoading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : transactions.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No transactions found</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Import historical data from Square to see your sales
                </p>
                {isAdmin && (
                  <Link to="/square-accounts">
                    <Button className="mt-4">Go to Square Accounts</Button>
                  </Link>
                )}
              </div>
            ) : (
              <div className="relative w-full overflow-auto">
                <table className="w-full caption-bottom text-sm">
                  <thead className="[&_tr]:border-b">
                    <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                        Date
                      </th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                        Amount
                      </th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                        Payment
                      </th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                        Type
                      </th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                        Location
                      </th>
                      <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground w-8">
                      </th>
                    </tr>
                  </thead>
                  <tbody className="[&_tr:last-child]:border-0">
                    {transactions.map((transaction) => (
                      <tr
                        key={transaction.id}
                        onClick={() => setSelectedTxnId(transaction.id)}
                        className="border-b transition-colors hover:bg-muted/50 cursor-pointer group"
                      >
                        <td className="p-4 align-middle">
                          {formatDate(transaction.transaction_date)}
                        </td>
                        <td className="p-4 align-middle font-medium">
                          {formatCurrency(
                            transaction.has_refund ? transaction.refund_amount : transaction.total_money_amount,
                            transaction.amount_money_currency
                          )}
                        </td>
                        <td className="p-4 align-middle">
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            {getTenderIcon(transaction.tender_type)}
                            <span className="text-xs">
                              {getTenderLabel(transaction.tender_type, transaction.card_brand, transaction.last_4)}
                            </span>
                          </div>
                        </td>
                        <td className="p-4 align-middle">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              transaction.has_refund
                                ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                            }`}
                          >
                            {transaction.has_refund ? 'Refund' : 'Sale'}
                          </span>
                        </td>
                        <td className="p-4 align-middle text-muted-foreground">
                          {transaction.location_name}
                        </td>
                        <td className="p-4 align-middle text-right">
                          <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Transaction Detail Modal */}
      <Dialog open={!!selectedTxnId} onOpenChange={(open) => { if (!open) setSelectedTxnId(null) }}>
        <DialogContent className="w-[calc(100%-2rem)] sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          {detailLoading ? (
            <>
              <DialogHeader>
                <DialogTitle>Transaction Details</DialogTitle>
                <DialogDescription>Loading transaction information...</DialogDescription>
              </DialogHeader>
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="h-6 w-6 animate-spin text-primary" />
              </div>
            </>
          ) : txnDetail ? (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between pr-6">
                  <div>
                    <DialogTitle className="text-xl">
                      {formatCurrency(txnDetail.total_money_amount, txnDetail.amount_money_currency)}
                    </DialogTitle>
                    <DialogDescription className="mt-1">
                      {new Date(txnDetail.transaction_date).toLocaleDateString('en-GB', {
                        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                      })} at {new Date(txnDetail.transaction_date).toLocaleTimeString('en-GB', {
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </DialogDescription>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                      txnDetail.has_refund
                        ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                        : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                    }`}
                  >
                    {txnDetail.has_refund ? 'Refund' : 'Sale'}
                  </span>
                </div>
              </DialogHeader>

              <div className="space-y-5 mt-2">
                {/* Location & Payment */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Location</p>
                      <p className="text-sm font-medium">{txnDetail.location_name}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    {getTenderIcon(txnDetail.tender_type)}
                    <div>
                      <p className="text-xs text-muted-foreground">Payment</p>
                      <p className="text-sm font-medium">
                        {getTenderLabel(txnDetail.tender_type, txnDetail.card_brand, txnDetail.last_4)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Financial Breakdown */}
                <div className="rounded-lg border border-border">
                  <div className="px-4 py-2.5 border-b border-border bg-muted/30">
                    <p className="text-sm font-medium">Financial Breakdown</p>
                  </div>
                  <div className="divide-y divide-border">
                    {(() => {
                      const subtotal = txnDetail.total_money_amount - txnDetail.total_tax_amount - txnDetail.total_tip_amount + txnDetail.total_discount_amount
                      const cur = txnDetail.amount_money_currency
                      return (
                        <>
                          <div className="flex justify-between px-4 py-2.5">
                            <span className="text-sm text-muted-foreground">Subtotal</span>
                            <span className="text-sm font-medium">{formatCurrency(subtotal, cur)}</span>
                          </div>
                          {txnDetail.total_discount_amount > 0 && (() => {
                            const discounts = txnDetail.raw_data?.discounts as Array<{ name?: string }> | undefined
                            const discountNames = discounts?.map(d => d.name).filter(Boolean)
                            return (
                              <div className="flex justify-between px-4 py-2.5">
                                <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                                  <Percent className="h-3.5 w-3.5" /> Discount
                                  {discountNames && discountNames.length > 0 && (
                                    <span className="text-xs text-muted-foreground/70">({discountNames.join(', ')})</span>
                                  )}
                                </span>
                                <span className="text-sm font-medium text-red-500">
                                  -{formatCurrency(txnDetail.total_discount_amount, cur)}
                                </span>
                              </div>
                            )
                          })()}
                          {txnDetail.total_tax_amount > 0 && (
                            <div className="flex justify-between px-4 py-2.5">
                              <span className="text-sm text-muted-foreground">Tax</span>
                              <span className="text-sm font-medium">{formatCurrency(txnDetail.total_tax_amount, cur)}</span>
                            </div>
                          )}
                          {txnDetail.total_tip_amount > 0 && (
                            <div className="flex justify-between px-4 py-2.5">
                              <span className="text-sm text-muted-foreground">Tip</span>
                              <span className="text-sm font-medium text-green-600 dark:text-green-400">
                                {formatCurrency(txnDetail.total_tip_amount, cur)}
                              </span>
                            </div>
                          )}
                        </>
                      )
                    })()}
                    <div className="flex justify-between px-4 py-2.5 bg-muted/20">
                      <span className="text-sm font-semibold">Total</span>
                      <span className="text-sm font-semibold">
                        {formatCurrency(txnDetail.total_money_amount, txnDetail.amount_money_currency)}
                      </span>
                    </div>
                    {txnDetail.has_refund && txnDetail.refund_amount > 0 && (
                      <div className="flex justify-between px-4 py-2.5 bg-red-50 dark:bg-red-900/10">
                        <span className="text-sm font-medium text-red-600 dark:text-red-400">Refunded</span>
                        <span className="text-sm font-medium text-red-600 dark:text-red-400">
                          -{formatCurrency(txnDetail.refund_amount, txnDetail.amount_money_currency)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Line Items */}
                {(() => {
                  const lineItems = txnDetail.line_items && txnDetail.line_items.length > 0
                    ? txnDetail.line_items
                    : null
                  const returnItems = !lineItems
                    ? (txnDetail.raw_data?.returns as any[] | undefined)
                        ?.flatMap((ret: any) => ret.return_line_items || [])
                    : null
                  const items = lineItems || returnItems
                  const isReturn = !lineItems && !!returnItems

                  return items && items.length > 0 ? (
                    <div className="rounded-lg border border-border">
                      <div className="px-4 py-2.5 border-b border-border bg-muted/30">
                        <p className="text-sm font-medium">
                          {isReturn ? 'Refunded Items' : 'Items'} ({items.length})
                        </p>
                      </div>
                      <div className="divide-y divide-border">
                        {items.map((item: any, idx: number) => (
                          <div key={idx} className="flex items-center justify-between px-4 py-2.5">
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-medium truncate ${isReturn ? 'text-red-500' : ''}`}>
                                {item.name || 'Unnamed Item'}
                              </p>
                              {item.variation_name && (
                                <p className="text-xs text-muted-foreground">{item.variation_name}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-4 ml-4 shrink-0">
                              <span className="text-xs text-muted-foreground">
                                x{item.quantity || '1'}
                              </span>
                              <span className={`text-sm font-medium w-20 text-right ${isReturn ? 'text-red-500' : ''}`}>
                                {isReturn && item.gross_return_money?.amount != null
                                  ? `-${formatCurrency(item.gross_return_money.amount, item.gross_return_money.currency || txnDetail.amount_money_currency)}`
                                  : item.total_money?.amount != null
                                    ? formatCurrency(item.total_money.amount, item.total_money.currency || txnDetail.amount_money_currency)
                                    : item.base_price_money?.amount != null
                                      ? formatCurrency(item.base_price_money.amount, item.base_price_money.currency || txnDetail.amount_money_currency)
                                      : '—'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null
                })()}

                {/* Categories */}
                {txnDetail.product_categories && txnDetail.product_categories.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                    {txnDetail.product_categories.map((cat, idx) => (
                      <span key={idx} className="text-xs bg-muted px-2 py-1 rounded-md">{cat}</span>
                    ))}
                  </div>
                )}

                {/* Metadata */}
                <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t border-border">
                  <p>Square ID: <span className="font-mono">{txnDetail.square_transaction_id}</span></p>
                  <p>Status: {txnDetail.payment_status}</p>
                  {txnDetail.customer_id && <p>Customer: <span className="font-mono">{txnDetail.customer_id}</span></p>}
                </div>
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Transaction Details</DialogTitle>
                <DialogDescription>Could not load transaction</DialogDescription>
              </DialogHeader>
              <div className="text-center py-8 text-muted-foreground">
                Transaction not found
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
