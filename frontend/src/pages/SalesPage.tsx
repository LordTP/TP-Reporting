/**
 * Sales Page
 * View and analyze sales transactions
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { Link } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useAuth } from '@/features/auth/hooks/useAuth'
import AppNav from '@/components/layout/AppNav'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RefreshCw, DollarSign, TrendingUp, Calendar, Filter } from 'lucide-react'

interface SalesTransaction {
  id: string
  location_name: string
  transaction_date: string
  amount_money_amount: number
  amount_money_currency: string
  total_money_amount: number
  payment_status: string
  tender_type: string
  card_brand?: string
  last_4?: string
  has_refund: boolean
  refund_amount: number
}

interface SalesAggregation {
  total_sales: number
  total_transactions: number
  average_transaction: number
  currency: string
}

export default function SalesPage() {
  const { user } = useAuthStore()
  const { logout } = useAuth()
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

  // Fetch clients for filter (admins get all, multi-client users get their scoped list)
  const { data: clientsData } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => apiClient.get('/clients'),
    enabled: showClientFilter,
  })

  // Fetch all locations for filter
  const { data: allLocations } = useQuery({
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
    enabled: isAdmin || hasMultipleClients,
  })

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
    // Allow both client and location filters to work together
    if (selectedClient !== 'all') {
      params.append('client_id', selectedClient)
    }
    if (selectedLocation !== 'all') {
      params.append('location_ids', selectedLocation)
    }
    const smartPresets = ['today', 'this_week', 'this_month', 'this_year']
    if (smartPresets.includes(datePreset)) {
      params.append('date_preset', datePreset)
    } else if (/^\d+$/.test(datePreset)) {
      params.append('days', datePreset)
    }
    return params
  }

  // Fetch recent transactions with filters
  const { data: transactionsData, isLoading: transactionsLoading, refetch: refetchTransactions } = useQuery({
    queryKey: ['sales-transactions', datePreset, selectedLocation, selectedClient],
    queryFn: async () => {
      const params = buildQueryParams()
      return await apiClient.get<{ transactions: SalesTransaction[]; total: number }>(`/sales/transactions?page_size=50&sort_by=transaction_date&sort_order=desc&${params}`)
    },
  })

  // Fetch aggregation with filters
  const { data: aggregationData, isLoading: aggregationLoading } = useQuery({
    queryKey: ['sales-aggregation', datePreset, selectedLocation, selectedClient],
    queryFn: async () => {
      const params = buildQueryParams()
      return await apiClient.get<SalesAggregation>(`/sales/aggregation?${params}`)
    },
  })

  const transactions = transactionsData?.transactions || []
  const totalCount = transactionsData?.total || 0
  const aggregation = aggregationData

  const formatCurrency = (amount: number, currency: string) => {
    // Amount is in cents, convert to dollars
    const dollars = amount / 100
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(dollars)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  return (
    <div className="min-h-screen bg-background">
      <AppNav />

      <main className="max-w-[1800px] mx-auto px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-8">
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
        <div className="flex items-center gap-4 mb-8 p-6 bg-card/80 backdrop-blur-sm rounded-xl border border-border/50 shadow-lg">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filters:</span>
          </div>
          <div className="flex-1 flex gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Date Range</label>
              <Select value={datePreset} onValueChange={setDatePreset}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Select date range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
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
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">Client</label>
                  <Select value={selectedClient} onValueChange={(value) => {
                    setSelectedClient(value)
                    // Reset location filter when client changes
                    setSelectedLocation('all')
                  }}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="All Clients" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Clients</SelectItem>
                      {clientsData?.clients?.map((client: any) => (
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
                      <SelectTrigger className="w-[200px]">
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
              <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
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
                  <p className="text-xs text-muted-foreground">
                    {aggregation.total_transactions} transactions
                  </p>
                </>
              ) : (
                <div className="text-2xl font-bold">£0.00</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Average Sale</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {aggregationLoading ? (
                <div className="text-2xl font-bold">Loading...</div>
              ) : aggregation && aggregation.total_transactions > 0 ? (
                <>
                  <div className="text-2xl font-bold">
                    {formatCurrency(aggregation.average_transaction, aggregation.currency)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Per transaction
                  </p>
                </>
              ) : (
                <div className="text-2xl font-bold">£0.00</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Transactions</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {totalCount.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                All time
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Transactions Table */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Transactions</CardTitle>
            <CardDescription>
              Showing the most recent {transactions.length} transactions
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
                        Type
                      </th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                        Location
                      </th>
                    </tr>
                  </thead>
                  <tbody className="[&_tr:last-child]:border-0">
                    {transactions.map((transaction) => (
                      <tr
                        key={transaction.id}
                        className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
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
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              transaction.has_refund
                                ? 'bg-red-100 text-red-800'
                                : 'bg-green-100 text-green-800'
                            }`}
                          >
                            {transaction.has_refund ? 'Refund' : 'Sale'}
                          </span>
                        </td>
                        <td className="p-4 align-middle text-muted-foreground">
                          {transaction.location_name}
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
    </div>
  )
}
