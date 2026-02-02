/**
 * Square Account Manager Component
 * Main UI for managing Square account connections
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { squareApi } from '../api/squareApi'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Plus, RefreshCw, Trash2, MapPin, Clock, Tag } from 'lucide-react'
import LocationManager from './LocationManager'
import HistoricalImport from './HistoricalImport'
import SyncStatusDashboard from './SyncStatusDashboard'

export default function SquareAccountManager() {
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [showLocationManager, setShowLocationManager] = useState(false)
  const [showHistoricalImport, setShowHistoricalImport] = useState(false)
  const [showSyncStatus, setShowSyncStatus] = useState(false)
  const queryClient = useQueryClient()

  // Fetch Square accounts
  const { data: accountsData, isLoading, error } = useQuery({
    queryKey: ['square-accounts'],
    queryFn: squareApi.listAccounts,
  })

  // Connect Square account mutation
  const connectAccountMutation = useMutation({
    mutationFn: async () => {
      const { url } = await squareApi.getOAuthUrl()
      window.location.href = url
    },
    onError: (error) => {
      console.error('Failed to get OAuth URL:', error)
    },
  })

  // Disconnect Square account mutation
  const disconnectMutation = useMutation({
    mutationFn: squareApi.disconnectAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['square-accounts'] })
    },
  })

  // Track which account is actively syncing for each action
  const [syncingAccountId, setSyncingAccountId] = useState<Record<string, string | null>>({
    locations: null,
    data: null,
    catalog: null,
  })

  // Sync locations mutation
  const syncLocationsMutation = useMutation({
    mutationFn: (accountId: string) => {
      setSyncingAccountId(prev => ({ ...prev, locations: accountId }))
      return squareApi.syncLocations(accountId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['square-accounts'] })
      queryClient.invalidateQueries({ queryKey: ['square-locations'] })
    },
    onSettled: () => setSyncingAccountId(prev => ({ ...prev, locations: null })),
  })

  // Sync data (payments/orders) mutation
  const [syncDataResult, setSyncDataResult] = useState<string | null>(null)
  const syncDataMutation = useMutation({
    mutationFn: (accountId: string) => {
      setSyncingAccountId(prev => ({ ...prev, data: accountId }))
      return squareApi.triggerSync({ square_account_id: accountId })
    },
    onSuccess: (data) => {
      setSyncDataResult(data.message || 'Sync triggered successfully')
      setTimeout(() => setSyncDataResult(null), 5000)
      queryClient.invalidateQueries({ queryKey: ['square-accounts'] })
    },
    onSettled: () => setSyncingAccountId(prev => ({ ...prev, data: null })),
  })

  // Sync catalog mutation
  const [catalogSyncResult, setCatalogSyncResult] = useState<string | null>(null)
  const syncCatalogMutation = useMutation({
    mutationFn: (accountId: string) => {
      setSyncingAccountId(prev => ({ ...prev, catalog: accountId }))
      return squareApi.syncCatalog(accountId)
    },
    onSuccess: (data) => {
      setCatalogSyncResult(`Synced ${data.categories_found} categories, ${data.items_processed} items, ${data.variations_mapped} variations`)
      setTimeout(() => setCatalogSyncResult(null), 5000)
    },
    onSettled: () => setSyncingAccountId(prev => ({ ...prev, catalog: null })),
  })

  const handleConnectAccount = () => {
    connectAccountMutation.mutate()
  }

  const handleDisconnectAccount = async (accountId: string) => {
    if (confirm('Are you sure you want to disconnect this Square account?')) {
      disconnectMutation.mutate(accountId)
    }
  }



  const handleManageLocations = (accountId: string) => {
    setSelectedAccountId(accountId)
    setShowLocationManager(true)
    setShowHistoricalImport(false)
    setShowSyncStatus(false)
  }

  const handleHistoricalImport = (accountId: string) => {
    setSelectedAccountId(accountId)
    setShowHistoricalImport(true)
    setShowLocationManager(false)
    setShowSyncStatus(false)
  }

  const handleViewSyncStatus = (accountId: string) => {
    setSelectedAccountId(accountId)
    setShowSyncStatus(true)
    setShowLocationManager(false)
    setShowHistoricalImport(false)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Failed to load Square accounts. Please try again later.
        </AlertDescription>
      </Alert>
    )
  }

  const accounts = accountsData?.accounts || []

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Square Accounts</h2>
          <p className="text-muted-foreground">
            Manage your Square account connections and sync settings
          </p>
        </div>
        <Button onClick={handleConnectAccount} disabled={connectAccountMutation.isPending}>
          <Plus className="mr-2 h-4 w-4" />
          Connect Square Account
        </Button>
      </div>

      {accounts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <MapPin className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Square Accounts Connected</h3>
            <p className="text-muted-foreground text-center mb-4">
              Connect your Square account to start syncing sales data from your locations.
            </p>
            <Button onClick={handleConnectAccount}>
              <Plus className="mr-2 h-4 w-4" />
              Connect Your First Account
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {accounts.map((account) => (
            <Card key={account.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <CardTitle>{account.account_name}</CardTitle>
                    <CardDescription>
                      {account.base_currency} • {account.square_merchant_id}
                    </CardDescription>
                  </div>
                  <Badge variant={account.is_active ? 'default' : 'secondary'}>
                    {account.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {account.last_sync_at && (
                  <div className="flex items-center text-sm text-muted-foreground">
                    <Clock className="mr-2 h-4 w-4" />
                    Last sync: {new Date(account.last_sync_at).toLocaleString()}
                  </div>
                )}

                <div className="space-y-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => handleManageLocations(account.id)}
                  >
                    <MapPin className="mr-2 h-4 w-4" />
                    Manage Locations
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => syncLocationsMutation.mutate(account.id)}
                    disabled={syncingAccountId.locations === account.id}
                  >
                    <RefreshCw
                      className={`mr-2 h-4 w-4 ${
                        syncingAccountId.locations === account.id ? 'animate-spin' : ''
                      }`}
                    />
                    {syncingAccountId.locations === account.id ? 'Syncing Locations...' : 'Sync Locations'}
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => syncDataMutation.mutate(account.id)}
                    disabled={syncingAccountId.data === account.id}
                  >
                    <RefreshCw
                      className={`mr-2 h-4 w-4 ${
                        syncingAccountId.data === account.id ? 'animate-spin' : ''
                      }`}
                    />
                    {syncingAccountId.data === account.id ? 'Syncing Data...' : 'Sync Data Now'}
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => syncCatalogMutation.mutate(account.id)}
                    disabled={syncingAccountId.catalog === account.id}
                  >
                    <Tag
                      className={`mr-2 h-4 w-4 ${
                        syncingAccountId.catalog === account.id ? 'animate-spin' : ''
                      }`}
                    />
                    {syncingAccountId.catalog === account.id ? 'Syncing Catalog...' : 'Sync Catalog'}
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => handleHistoricalImport(account.id)}
                  >
                    Import Historical Data
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => handleViewSyncStatus(account.id)}
                  >
                    View Sync Status
                  </Button>

                  <Button
                    variant="destructive"
                    size="sm"
                    className="w-full"
                    onClick={() => handleDisconnectAccount(account.id)}
                    disabled={disconnectMutation.isPending}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Disconnect
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {syncDataResult && (
        <Alert>
          <AlertDescription>{syncDataResult}</AlertDescription>
        </Alert>
      )}

      {syncDataMutation.isError && (
        <Alert variant="destructive">
          <AlertDescription>Failed to sync data. Please try again.</AlertDescription>
        </Alert>
      )}

      {catalogSyncResult && (
        <Alert>
          <AlertDescription>{catalogSyncResult}</AlertDescription>
        </Alert>
      )}

      {syncCatalogMutation.isError && (
        <Alert variant="destructive">
          <AlertDescription>Failed to sync catalog. Please try again.</AlertDescription>
        </Alert>
      )}

      {/* Modals/Panels */}
      {showLocationManager && selectedAccountId && (
        <LocationManager
          accountId={selectedAccountId}
          onClose={() => setShowLocationManager(false)}
        />
      )}

      {showHistoricalImport && selectedAccountId && (
        <HistoricalImport
          accountId={selectedAccountId}
          onClose={() => setShowHistoricalImport(false)}
        />
      )}

      {showSyncStatus && selectedAccountId && (
        <SyncStatusDashboard
          accountId={selectedAccountId}
          onClose={() => setShowSyncStatus(false)}
        />
      )}
    </div>
  )
}
