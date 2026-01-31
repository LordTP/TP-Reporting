/**
 * Square API Client
 */
import { apiClient } from '@/lib/api-client'
import type {
  SquareAccount,
  Location,
  DataImport,
  SyncStatus,
  HistoricalImportRequest,
  SyncRequest,
  SyncResponse,
} from '@/types/square'

export const squareApi = {
  // OAuth
  getOAuthUrl: async (): Promise<{ url: string }> => {
    return await apiClient.get('/square/oauth/url')
  },

  // Square Accounts
  listAccounts: async (): Promise<{ accounts: SquareAccount[]; total: number }> => {
    return await apiClient.get('/square/accounts')
  },

  getAccount: async (accountId: string): Promise<SquareAccount> => {
    return await apiClient.get(`/square/accounts/${accountId}`)
  },

  disconnectAccount: async (accountId: string): Promise<void> => {
    await apiClient.delete(`/square/accounts/${accountId}`)
  },

  // Locations
  listLocations: async (accountId: string): Promise<{ locations: Location[]; total: number }> => {
    return await apiClient.get(`/square/accounts/${accountId}/locations`)
  },

  updateLocation: async (locationId: string, isActive: boolean): Promise<Location> => {
    return await apiClient.patch(`/square/locations/${locationId}`, {
      is_active: isActive,
    })
  },

  syncLocations: async (accountId: string): Promise<{ locations: Location[]; total: number }> => {
    return await apiClient.post(`/square/accounts/${accountId}/sync-locations`)
  },

  // Historical Import
  startHistoricalImport: async (request: HistoricalImportRequest): Promise<DataImport> => {
    return await apiClient.post('/square/import/historical', request)
  },

  listImports: async (accountId?: string): Promise<{ imports: DataImport[]; total: number }> => {
    const params = accountId ? { square_account_id: accountId } : {}
    return await apiClient.get('/square/imports', { params })
  },

  getImportStatus: async (importId: string): Promise<DataImport> => {
    return await apiClient.get(`/square/imports/${importId}`)
  },

  // Sync
  triggerSync: async (request: SyncRequest): Promise<SyncResponse> => {
    return await apiClient.post('/square/sync', request)
  },

  getSyncStatus: async (accountId: string): Promise<SyncStatus> => {
    return await apiClient.get(`/square/accounts/${accountId}/sync-status`)
  },

  syncCatalog: async (accountId: string): Promise<{ message: string; categories_found: number; items_processed: number; variations_mapped: number }> => {
    return await apiClient.post(`/square/accounts/${accountId}/sync-catalog`)
  },
}
