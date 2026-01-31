import { usePermissionStore } from '@/store/permissionStore'
import { useAuthStore } from '@/store/authStore'

const FULL_ACCESS_ROLES = ['admin', 'superadmin']

export function usePermission(key: string): boolean {
  const { user } = useAuthStore()
  const hasPermission = usePermissionStore((s) => s.hasPermission)

  if (user && FULL_ACCESS_ROLES.includes(user.role)) return true
  return hasPermission(key)
}

export function usePermissions(keys: string[]): Record<string, boolean> {
  const { user } = useAuthStore()
  const hasPermission = usePermissionStore((s) => s.hasPermission)

  const result: Record<string, boolean> = {}
  for (const key of keys) {
    if (user && FULL_ACCESS_ROLES.includes(user.role)) {
      result[key] = true
    } else {
      result[key] = hasPermission(key)
    }
  }
  return result
}

export function useIsFullAccess(): boolean {
  const { user } = useAuthStore()
  return !!user && FULL_ACCESS_ROLES.includes(user.role)
}
