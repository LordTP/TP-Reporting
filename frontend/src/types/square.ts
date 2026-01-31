/**
 * Square API Type Definitions
 */

export interface SquareAccount {
  id: string
  organization_id: string
  square_merchant_id: string
  account_name: string
  base_currency: string
  is_active: boolean
  last_sync_at: string | null
  created_at: string
}

export interface Location {
  id: string
  square_account_id: string
  square_location_id: string
  name: string
  address: Record<string, any> | null
  currency: string
  timezone: string | null
  is_active: boolean
  metadata: Record<string, any> | null
}

export interface DataImport {
  id: string
  square_account_id: string
  location_id: string | null
  import_type: 'historical' | 'manual_sync'
  start_date: string
  end_date: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  total_transactions: number
  imported_transactions: number
  duplicate_transactions: number
  error_message: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export interface SyncStatus {
  square_account_id: string
  account_name: string
  last_sync_at: string | null
  active_locations: number
  total_locations: number
  recent_imports: DataImport[]
}

export interface HistoricalImportRequest {
  square_account_id: string
  location_ids?: string[]
  start_date: string
  end_date: string
}

export interface SyncRequest {
  square_account_id: string
  location_ids?: string[]
}

export interface SyncResponse {
  message: string
  task_id: string | null
  locations_synced: number
}
