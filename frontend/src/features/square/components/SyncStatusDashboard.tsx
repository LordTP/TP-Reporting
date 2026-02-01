/**
 * Sync Status Dashboard Component
 * View sync progress and recent imports
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { squareApi } from '../api/squareApi'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RefreshCw, Clock, MapPin, AlertCircle, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { format } from 'date-fns'

interface SyncStatusDashboardProps {
  accountId: string
  onClose: () => void
}

export default function SyncStatusDashboard({ accountId, onClose }: SyncStatusDashboardProps) {
  const queryClient = useQueryClient()

  const resetImportMutation = useMutation({
    mutationFn: (importId: string) => squareApi.resetImport(importId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['square-sync-status', accountId] })
    },
  })

  // Fetch sync status
  const { data: syncStatus, isLoading, error, refetch } = useQuery({
    queryKey: ['square-sync-status', accountId],
    queryFn: () => squareApi.getSyncStatus(accountId),
    refetchInterval: 10000, // Refetch every 10 seconds
  })

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />
      case 'in_progress':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-500" />
      default:
        return <AlertCircle className="h-4 w-4" />
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-500">Completed</Badge>
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>
      case 'in_progress':
        return <Badge className="bg-blue-500">In Progress</Badge>
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sync Status Dashboard</DialogTitle>
          <DialogDescription>
            View synchronization status and recent import history for this Square account.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertDescription>
              Failed to load sync status. Please try again later.
            </AlertDescription>
          </Alert>
        ) : syncStatus ? (
          <div className="space-y-6">
            {/* Overview Cards */}
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Account Name</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{syncStatus.account_name}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Active Locations</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-baseline gap-2">
                    <div className="text-2xl font-bold">{syncStatus.active_locations}</div>
                    <div className="text-sm text-muted-foreground">
                      of {syncStatus.total_locations}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Last Sync</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-sm">
                    {syncStatus.last_sync_at
                      ? format(new Date(syncStatus.last_sync_at), 'PPp')
                      : 'Never'}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Recent Imports */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Recent Imports</h3>
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>

              {syncStatus.recent_imports.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No import history yet.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {syncStatus.recent_imports.map((importJob) => (
                    <Card key={importJob.id}>
                      <CardContent className="pt-6">
                        <div className="space-y-3">
                          {/* Header */}
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                              {getStatusIcon(importJob.status)}
                              <div>
                                <p className="font-semibold">
                                  {importJob.import_type === 'historical'
                                    ? 'Historical Import'
                                    : 'Manual Sync'}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {format(new Date(importJob.start_date), 'PPP')} -{' '}
                                  {format(new Date(importJob.end_date), 'PPP')}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {(importJob.status === 'in_progress' || importJob.status === 'pending') && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => resetImportMutation.mutate(importJob.id)}
                                  disabled={resetImportMutation.isPending}
                                >
                                  {resetImportMutation.isPending ? (
                                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                  ) : (
                                    <XCircle className="h-3 w-3 mr-1" />
                                  )}
                                  Reset
                                </Button>
                              )}
                              {getStatusBadge(importJob.status)}
                            </div>
                          </div>

                          {/* Progress */}
                          {importJob.status === 'in_progress' && (
                            <div className="space-y-2">
                              <div className="flex justify-between text-sm">
                                <span>Progress</span>
                                <span>
                                  {importJob.imported_transactions} / {importJob.total_transactions}
                                </span>
                              </div>
                              <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                                <div
                                  className="bg-primary h-full transition-all"
                                  style={{
                                    width: `${
                                      importJob.total_transactions > 0
                                        ? (importJob.imported_transactions /
                                            importJob.total_transactions) *
                                          100
                                        : 0
                                    }%`,
                                  }}
                                />
                              </div>
                            </div>
                          )}

                          {/* Stats */}
                          {importJob.status === 'completed' && (
                            <div className="grid grid-cols-3 gap-4 text-sm">
                              <div>
                                <p className="text-muted-foreground">Imported</p>
                                <p className="font-semibold">{importJob.imported_transactions}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Duplicates</p>
                                <p className="font-semibold">{importJob.duplicate_transactions}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Total</p>
                                <p className="font-semibold">{importJob.total_transactions}</p>
                              </div>
                            </div>
                          )}

                          {/* Error Message */}
                          {importJob.error_message && (
                            <Alert variant="destructive">
                              <AlertDescription className="text-sm">
                                {importJob.error_message}
                              </AlertDescription>
                            </Alert>
                          )}

                          {/* Timestamps */}
                          <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t">
                            <span>Started: {format(new Date(importJob.created_at), 'PPp')}</span>
                            {importJob.completed_at && (
                              <span>
                                Completed: {format(new Date(importJob.completed_at), 'PPp')}
                              </span>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}

        <div className="flex justify-end pt-4 border-t">
          <Button onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
