import { create } from 'zustand'
import { apiClient } from '@/lib/api-client'

interface PermissionState {
  permissions: string[]
  loaded: boolean
  loading: boolean
  fetchPermissions: () => Promise<void>
  hasPermission: (key: string) => boolean
  clearPermissions: () => void
}

export const usePermissionStore = create<PermissionState>()((set, get) => ({
  permissions: [],
  loaded: false,
  loading: false,

  fetchPermissions: async () => {
    if (get().loading) return
    set({ loading: true })
    try {
      const data = await apiClient.get<{ permissions: string[] }>('/permissions/me')
      set({ permissions: data.permissions, loaded: true, loading: false })
    } catch {
      set({ permissions: [], loaded: true, loading: false })
    }
  },

  hasPermission: (key: string) => {
    return get().permissions.includes(key)
  },

  clearPermissions: () => {
    set({ permissions: [], loaded: false, loading: false })
  },
}))
