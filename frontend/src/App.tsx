import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { DashboardPage } from '@/pages/DashboardPage'
import SquareAccountsPage from '@/pages/SquareAccountsPage'
import SalesPage from '@/pages/SalesPage'
import AnalyticsPage from '@/pages/AnalyticsPage'
import ReportsCatalogPage from '@/pages/ReportsCatalogPage'
import ReportDetailPage from '@/pages/ReportDetailPage'
import BudgetsPage from '@/pages/BudgetsPage'
import { ProtectedRoute } from '@/features/auth/components/ProtectedRoute'
import { useAuthStore } from '@/store/authStore'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute requiredRole={['admin', 'superadmin']}>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/square-accounts"
          element={
            <ProtectedRoute requiredRole={['admin', 'superadmin']}>
              <SquareAccountsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/sales"
          element={
            <ProtectedRoute>
              <SalesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/analytics"
          element={
            <ProtectedRoute>
              <AnalyticsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <ProtectedRoute>
              <ReportsCatalogPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/:slug"
          element={
            <ProtectedRoute>
              <ReportDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/budgets"
          element={
            <ProtectedRoute requiredRole={['admin', 'superadmin']}>
              <BudgetsPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  )
}

function Home() {
  const { isAuthenticated, user } = useAuthStore()

  // Redirect authenticated users to analytics
  if (isAuthenticated) {
    return <Navigate to="/analytics" replace />
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="text-lg font-bold tracking-widest uppercase text-foreground mb-4">
          Teliporter
        </h1>
        <h2 className="text-3xl font-bold text-foreground mb-2">
          Reporting Platform
        </h2>
        <p className="text-lg text-muted-foreground mb-8">
          Multi-tenant Square reporting with budget management
        </p>
        <div className="flex gap-4 justify-center">
          <a
            href="/login"
            className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity font-medium"
          >
            Login
          </a>
          <a
            href="/register"
            className="px-6 py-3 bg-secondary text-secondary-foreground rounded-lg hover:opacity-90 transition-opacity font-medium"
          >
            Sign Up
          </a>
        </div>
      </div>
    </div>
  )
}

export default App
