import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/store/authStore'

const SMART_PRESETS = ['today', 'yesterday', 'this_week', 'this_month', 'this_year'] as const

export const PRESET_LABELS: Record<string, string> = {
  today: 'Today',
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

export function useReportFilters() {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'
  const isClientLocked = !!user?.client_id

  const [datePreset, setDatePreset] = useState('today')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')
  const [selectedLocation, setSelectedLocation] = useState<string>('all')
  const [selectedClient, setSelectedClient] = useState<string>(
    user?.client_id || 'all'
  )

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
    enabled: isAdmin,
  })

  const { data: clientsData } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => apiClient.get('/clients'),
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
    if (selectedClient !== 'all') params.append('client_id', selectedClient)
    if (selectedLocation !== 'all') params.append('location_ids', selectedLocation)

    if (datePreset === 'custom') {
      if (customStartDate) params.append('start_date', new Date(customStartDate).toISOString())
      if (customEndDate) {
        const end = new Date(customEndDate)
        end.setHours(23, 59, 59, 999)
        params.append('end_date', end.toISOString())
      }
    } else if ((SMART_PRESETS as readonly string[]).includes(datePreset)) {
      params.append('date_preset', datePreset)
    } else {
      const days = parseInt(datePreset, 10)
      if (!isNaN(days) && days > 0) {
        const end = new Date()
        const start = new Date()
        start.setDate(start.getDate() - days)
        params.append('start_date', start.toISOString())
        params.append('end_date', end.toISOString())
      }
    }
    return params
  }

  const buildDaysQueryParams = () => {
    const params = new URLSearchParams()
    if (selectedClient !== 'all') params.append('client_id', selectedClient)
    if (selectedLocation !== 'all') params.append('location_ids', selectedLocation)

    if (datePreset === 'custom') {
      if (customStartDate) params.append('start_date', new Date(customStartDate).toISOString())
      if (customEndDate) {
        const end = new Date(customEndDate)
        end.setHours(23, 59, 59, 999)
        params.append('end_date', end.toISOString())
      }
    } else if ((SMART_PRESETS as readonly string[]).includes(datePreset)) {
      params.append('date_preset', datePreset)
    } else {
      const days = parseInt(datePreset, 10)
      if (!isNaN(days) && days > 0) {
        params.append('days', String(days))
      }
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
    filteredLocations,
    clientsData,
    isAdmin,
    isClientLocked,
    isDateRangeReady,
    user,
    buildQueryParams,
    buildDaysQueryParams,
    dateRangeLabel,
  }
}
