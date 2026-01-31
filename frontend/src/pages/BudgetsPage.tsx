import { Navigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useAuthStore } from '@/store/authStore'
import BudgetUpload from '@/features/budgets/BudgetUpload'
import AppNav from '@/components/layout/AppNav'

export default function BudgetsPage() {
  const { user } = useAuth()
  const { user: storeUser } = useAuthStore()
  const currentUser = user || storeUser

  if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'superadmin')) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="min-h-screen bg-background">
      <AppNav />
      <main className="max-w-[1800px] mx-auto px-6 lg:px-8 py-8">
        <BudgetUpload />
      </main>
    </div>
  )
}
