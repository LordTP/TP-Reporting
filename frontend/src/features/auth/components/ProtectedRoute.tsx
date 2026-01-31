import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredRole?: string[]
}

export const ProtectedRoute = ({ children, requiredRole }: ProtectedRouteProps) => {
  const { isAuthenticated, user } = useAuthStore()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  // Check role-based access — redirect non-admins to /sales
  if (requiredRole && user && !requiredRole.includes(user.role)) {
    return <Navigate to="/sales" replace />
  }

  return <>{children}</>
}
