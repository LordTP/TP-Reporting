import { useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom'
import { BarChart3, TrendingUp, PieChart, ArrowRight, Target, MapPin, Clock, ShieldCheck } from 'lucide-react'
import { useThemeStore } from '@/store/themeStore'
import { Sun, Moon } from 'lucide-react'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import SquareAccountsPage from '@/pages/SquareAccountsPage'
import SalesPage from '@/pages/SalesPage'
import AnalyticsPage from '@/pages/AnalyticsPage'
import ReportsCatalogPage from '@/pages/ReportsCatalogPage'
import ReportDetailPage from '@/pages/ReportDetailPage'
import BudgetsPage from '@/pages/BudgetsPage'
import FootfallPage from '@/pages/FootfallPage'
import { ProtectedRoute } from '@/features/auth/components/ProtectedRoute'
import { useAuthStore } from '@/store/authStore'
import { usePermissionStore } from '@/store/permissionStore'

function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const fetchPermissions = usePermissionStore((s) => s.fetchPermissions)
  const clearPermissions = usePermissionStore((s) => s.clearPermissions)

  useEffect(() => {
    if (isAuthenticated) {
      fetchPermissions()
    } else {
      clearPermissions()
    }
  }, [isAuthenticated, fetchPermissions, clearPermissions])

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute requiredPermission="page:admin">
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/square-accounts"
          element={
            <ProtectedRoute requiredPermission="page:square_accounts">
              <SquareAccountsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/sales"
          element={
            <ProtectedRoute requiredPermission="page:sales">
              <SalesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/analytics"
          element={
            <ProtectedRoute requiredPermission="page:analytics">
              <AnalyticsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <ProtectedRoute requiredPermission="page:reports">
              <ReportsCatalogPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/:slug"
          element={
            <ProtectedRoute requiredPermission="page:reports">
              <ReportDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/budgets"
          element={
            <ProtectedRoute requiredPermission="page:budgets">
              <BudgetsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/footfall"
          element={
            <ProtectedRoute requiredPermission="page:footfall">
              <FootfallPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  )
}

/* ---- Decorative mini-chart built with pure CSS bars ---- */
function MiniBarChart() {
  const bars = [
    32, 45, 38, 52, 48, 60, 55, 68, 42, 58, 65, 72, 50, 78, 62, 85,
    70, 55, 80, 90, 75, 60, 82, 68, 88, 72, 65, 92, 78, 85,
  ]
  return (
    <div className="flex items-end gap-[2px] h-28">
      {bars.map((h, i) => (
        <div
          key={i}
          className="flex-1 min-w-0 rounded-t bg-primary/60"
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  )
}

function MiniLineChart() {
  return (
    <svg viewBox="0 0 200 60" preserveAspectRatio="none" className="w-full h-12 text-primary/50" fill="none">
      <polyline
        points="0,50 20,42 40,45 60,30 80,35 100,20 120,25 140,15 160,18 180,8 200,12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

function Home() {
  const { isAuthenticated } = useAuthStore()
  const { theme, toggle } = useThemeStore()

  if (isAuthenticated) {
    return <Navigate to="/analytics" replace />
  }

  const features = [
    { icon: BarChart3, title: 'Sales Analytics', desc: 'Detailed revenue breakdowns by location, category, and time period. See exactly where your sales are coming from.' },
    { icon: TrendingUp, title: 'Performance Tracking', desc: 'Compare week-on-week, month-on-month. Instantly spot growth trends and underperforming areas.' },
    { icon: Target, title: 'Budget Management', desc: 'Upload budgets per location, track actuals against targets, and stay on top of your financial goals.' },
    { icon: PieChart, title: 'Custom Reports', desc: 'Pre-built and configurable reports that you can filter, export, and share with your team.' },
    { icon: MapPin, title: 'Multi-Location', desc: 'Manage all your stores in one place. Compare locations side by side and drill into individual performance.' },
    { icon: Clock, title: 'Real-Time Sync', desc: 'Data syncs automatically throughout the day, so your reports always reflect the latest transactions.' },
  ]

  return (
    <div className="min-h-screen bg-background">
      <button
        onClick={toggle}
        className="fixed top-6 right-6 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors z-20"
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </button>

      {/* ========== HERO — two-column on desktop ========== */}
      <div className="lg:min-h-screen flex items-center">
        <div className="max-w-7xl mx-auto px-6 sm:px-10 w-full grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-20 items-center pt-20 pb-12 lg:py-16">

          {/* Left — branding + CTA */}
          <div>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-widest uppercase text-foreground mb-2">
              Teliporter
            </h1>
            <p className="text-base sm:text-lg tracking-wider uppercase text-muted-foreground mb-8">
              Reporting
            </p>

            <h2 className="text-2xl sm:text-3xl font-semibold text-foreground leading-snug mb-4">
              Retail reporting<br className="hidden sm:block" /> that works for you
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-8 max-w-md">
              Understand your sales at a glance. Track every location, manage budgets,
              and turn transaction data into clear, actionable insights — updated
              automatically throughout the day.
            </p>

            <Link
              to="/login"
              className="inline-flex items-center gap-2 px-8 py-3 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity font-medium"
            >
              Sign in
              <ArrowRight className="h-5 w-5" />
            </Link>

            {/* Trust badges */}
            <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" /> Secure &amp; encrypted</span>
              <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" /> Auto-synced daily</span>
              <span className="flex items-center gap-1.5">£ € $ Multi-currency</span>
            </div>
          </div>

          {/* Right on desktop, below on mobile — decorative dashboard mock */}
          <div>
            <div className="bg-card border border-border rounded-2xl shadow-lg p-5 sm:p-6 space-y-4 sm:space-y-5">
              {/* Mock header */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Total Revenue</p>
                  <p className="text-2xl font-bold text-foreground">£124,892</p>
                </div>
                <span className="text-xs font-medium text-green-500 bg-green-500/10 px-2 py-1 rounded-full">+12.4%</span>
              </div>
              {/* Mini chart */}
              <MiniBarChart />
              {/* Mock metrics row */}
              <div className="grid grid-cols-3 gap-4 pt-2 border-t border-border">
                <div>
                  <p className="text-xs text-muted-foreground">Transactions</p>
                  <p className="text-lg font-semibold text-foreground">8,421</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Avg. Basket</p>
                  <p className="text-lg font-semibold text-foreground">£14.83</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Locations</p>
                  <p className="text-lg font-semibold text-foreground">12</p>
                </div>
              </div>
              {/* Sales by location */}
              <div className="pt-2 border-t border-border space-y-3">
                <p className="text-xs text-muted-foreground">Sales by Location</p>
                {[
                  { name: 'Manchester', amount: '£42,180', pct: 78 },
                  { name: 'Birmingham', amount: '£38,450', pct: 71 },
                  { name: 'Leeds', amount: '£27,620', pct: 51 },
                  { name: 'Liverpool', amount: '£16,642', pct: 31 },
                ].map((loc) => (
                  <div key={loc.name}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-foreground font-medium">{loc.name}</span>
                      <span className="text-muted-foreground">{loc.amount}</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary/60 rounded-full" style={{ width: `${loc.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              {/* Trend line */}
              <div className="pt-2">
                <p className="text-xs text-muted-foreground mb-2">30-Day Trend</p>
                <MiniLineChart />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========== FEATURES SECTION ========== */}
      <div className="bg-card/40 border-t border-border">
        <div className="max-w-7xl mx-auto px-6 sm:px-10 py-16 sm:py-24">
          <div className="text-center mb-12 sm:mb-16">
            <h3 className="text-2xl sm:text-3xl font-semibold text-foreground mb-3">Everything you need</h3>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Built for retail businesses that want clear visibility into their sales data without the complexity.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            {features.map((f) => (
              <div key={f.title} className="bg-card border border-border rounded-xl p-6 hover:shadow-md transition-shadow">
                <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <f.icon className="h-5 w-5 text-primary" />
                </div>
                <h4 className="text-foreground font-semibold mb-2">{f.title}</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ========== FOOTER ========== */}
      <div className="border-t border-border">
        <div className="max-w-7xl mx-auto px-6 sm:px-10 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground/60">Retail reporting by Teliporter</p>
          <Link
            to="/login"
            className="text-xs text-primary hover:underline font-medium"
          >
            Sign in to your account
          </Link>
        </div>
      </div>
    </div>
  )
}

export default App
