import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/store/authStore'

export const PRESET_LABELS: Record<string, string> = {
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

/** Format a Date as YYYY-MM-DD using the browser's local timezone */
function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Resolve any preset / numeric-days / custom range to concrete YYYY-MM-DD dates */
function resolveDateRange(
  preset: string,
  customStart: string,
  customEnd: string,
): { start: string; end: string } | null {
  const now = new Date()
  const todayStr = toLocalDateStr(now)

  switch (preset) {
    case 'today':
      return { start: todayStr, end: todayStr }
    case 'tomorrow': {
      const t = new Date(now)
      t.setDate(t.getDate() + 1)
      const tStr = toLocalDateStr(t)
      return { start: tStr, end: tStr }
    }
    case 'yesterday': {
      const y = new Date(now)
      y.setDate(y.getDate() - 1)
      const s = toLocalDateStr(y)
      return { start: s, end: s }
    }
    case 'this_week': {
      const dow = now.getDay() // 0=Sun
      const mondayOffset = dow === 0 ? 6 : dow - 1
      const monday = new Date(now)
      monday.setDate(now.getDate() - mondayOffset)
      return { start: toLocalDateStr(monday), end: todayStr }
    }
    case 'this_month': {
      const first = new Date(now.getFullYear(), now.getMonth(), 1)
      return { start: toLocalDateStr(first), end: todayStr }
    }
    case 'this_year': {
      const jan1 = new Date(now.getFullYear(), 0, 1)
      return { start: toLocalDateStr(jan1), end: todayStr }
    }
    case 'custom': {
      if (!customStart || !customEnd) return null
      return { start: customStart, end: customEnd }
    }
    default: {
      const days = parseInt(preset, 10)
      if (!isNaN(days) && days > 0) {
        const s = new Date(now)
        s.setDate(now.getDate() - days)
        return { start: toLocalDateStr(s), end: todayStr }
      }
      return null
    }
  }
}

export function useReportFilters() {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'
  const isStoreManager = user?.role === 'store_manager'
  const isClientLocked = !!user?.client_id

  const [datePreset, setDatePreset] = useState('today')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')
  const [selectedLocation, setSelectedLocation] = useState<string>('all')
  const [selectedClient, setSelectedClient] = useState<string>(
    user?.client_id || 'all'
  )
  const [selectedClientGroup, setSelectedClientGroup] = useState<string>('all')

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

  const { data: storeManagerLocations } = useQuery({
    queryKey: ['my-locations'],
    queryFn: async () => apiClient.get('/users/me/locations'),
    enabled: isStoreManager,
  })

  const allLocations = isAdmin ? adminLocations : isStoreManager ? storeManagerLocations : undefined

  const { data: clientsData } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => apiClient.get('/clients'),
    enabled: isAdmin,
  })

  const { data: clientGroupsData } = useQuery({
    queryKey: ['client-groups'],
    queryFn: () => apiClient.get<{ client_groups: Array<{ id: string; name: string; client_ids: string[] }> }>('/client-groups'),
    enabled: isAdmin,
  })

  const { data: clientLocationsData } = useQuery({
    queryKey: ['client-locations', selectedClient],
    queryFn: async () => {
      if (selectedClient === 'all') return null
      return await apiClient.get(`/clients/${selectedClient}/locations`)
    },
    enabled: isAdmin && selectedClient !== 'all',
  })

  const filteredLocations = selectedClient !== 'all' && clientLocationsData?.locations
    ? clientLocationsData.locations
    : allLocations || []

  const buildQueryParams = () => {
    const params = new URLSearchParams()
    if (selectedClientGroup !== 'all') params.append('client_group_id', selectedClientGroup)
    if (selectedClient !== 'all') params.append('client_id', selectedClient)
    if (selectedLocation !== 'all') params.append('location_ids', selectedLocation)

    const range = resolveDateRange(datePreset, customStartDate, customEndDate)
    if (range) {
      params.append('start_date', range.start)
      params.append('end_date', range.end)
    }
    return params
  }

  const buildDaysQueryParams = () => {
    const params = new URLSearchParams()
    if (selectedClientGroup !== 'all') params.append('client_group_id', selectedClientGroup)
    if (selectedClient !== 'all') params.append('client_id', selectedClient)
    if (selectedLocation !== 'all') params.append('location_ids', selectedLocation)

    const range = resolveDateRange(datePreset, customStartDate, customEndDate)
    if (range) {
      params.append('start_date', range.start)
      params.append('end_date', range.end)
    }
    return params
  }

  // Don't fire queries until both custom dates are filled in
  const isDateRangeReady = datePreset !== 'custom' || (!!customStartDate && !!customEndDate)

  const dateRangeLabel = datePreset === 'custom'
    ? (customStartDate && customEndDate
        ? `${customStartDate} to ${customEndDate}`
        : 'Custom Range')
    : (PRESET_LABELS[datePreset] || `Last ${datePreset} days`)

  return {
    datePreset, setDatePreset,
    customStartDate, setCustomStartDate,
    customEndDate, setCustomEndDate,
    selectedLocation, setSelectedLocation,
    selectedClient, setSelectedClient,
    selectedClientGroup, setSelectedClientGroup,
    filteredLocations,
    clientsData,
    clientGroupsData,
    isAdmin,
    isClientLocked,
    isDateRangeReady,
    user,
    buildQueryParams,
    buildDaysQueryParams,
    dateRangeLabel,
  }
}
