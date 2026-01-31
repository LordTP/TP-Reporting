/**
 * Square Accounts Page
 * Admin page for managing Square account integrations
 */
import { Navigate, Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useAuthStore } from '@/store/authStore'
import SquareAccountManager from '@/features/square/components/SquareAccountManager'
import AppNav from '@/components/layout/AppNav'

export default function SquareAccountsPage() {
  const { user, logout } = useAuth()
  const { user: storeUser } = useAuthStore()
  const currentUser = user || storeUser

  // Only admin and superadmin can access this page
  if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'superadmin')) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="min-h-screen bg-background">
      <AppNav />

      <main className="max-w-[1800px] mx-auto px-6 lg:px-8 py-8">
        <SquareAccountManager />
      </main>
    </div>
  )
}
