import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { usePermissionStore } from '@/store/permissionStore'

const FULL_ACCESS_ROLES = ['admin', 'superadmin']

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredRole?: string[]
  requiredPermission?: string
}

export const ProtectedRoute = ({ children, requiredRole, requiredPermission }: ProtectedRouteProps) => {
  const { isAuthenticated, user, clearAuth } = useAuthStore()
  const { loaded, hasPermission } = usePermissionStore()

  // Check both Zustand state AND that a token actually exists
  const hasToken = !!localStorage.getItem('access_token')

  if (!isAuthenticated || !hasToken) {
    if (isAuthenticated && !hasToken) {
      // Zustand thinks we're logged in but token is gone — clean up
      clearAuth()
    }
    return <Navigate to="/login" replace />
  }

  // Wait for permissions to load before checking
  if (!loaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground text-sm">Loading...</div>
      </div>
    )
  }

  // Legacy role-based check (still supported)
  if (requiredRole && user && !requiredRole.includes(user.role)) {
    return <Navigate to="/sales" replace />
  }

  // Permission-based check — full-access roles always pass
  if (requiredPermission && user) {
    if (!FULL_ACCESS_ROLES.includes(user.role) && !hasPermission(requiredPermission)) {
      return <Navigate to="/analytics" replace />
    }
  }

  return <>{children}</>
}
