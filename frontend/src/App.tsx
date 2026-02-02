import { useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom'
import { BarChart3, TrendingUp, PieChart, ArrowRight, Target, MapPin, Clock, ShieldCheck, Zap, LineChart, Users } from 'lucide-react'
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

/* ---- Mini area chart for feature cards ---- */
function MiniAreaChart({ color = 'primary' }: { color?: string }) {
  return (
    <svg viewBox="0 0 120 40" preserveAspectRatio="none" className="w-full h-10" fill="none">
      <defs>
        <linearGradient id={`area-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" className="text-primary" stopColor="currentColor" stopOpacity="0.3" />
          <stop offset="100%" className="text-primary" stopColor="currentColor" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path
        d="M0,35 L10,28 L20,30 L30,22 L40,25 L50,18 L60,20 L70,12 L80,15 L90,8 L100,10 L110,5 L120,8 L120,40 L0,40 Z"
        fill={`url(#area-${color})`}
      />
      <polyline
        points="0,35 10,28 20,30 30,22 40,25 50,18 60,20 70,12 80,15 90,8 100,10 110,5 120,8"
        className="text-primary"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

/* ---- Mini donut for feature cards ---- */
function MiniDonut() {
  const segments = [
    { pct: 35, offset: 0, cls: 'text-primary' },
    { pct: 25, offset: 35, cls: 'text-primary/60' },
    { pct: 20, offset: 60, cls: 'text-primary/35' },
    { pct: 20, offset: 80, cls: 'text-primary/20' },
  ]
  return (
    <svg viewBox="0 0 36 36" className="w-10 h-10">
      {segments.map((s, i) => (
        <circle
          key={i}
          cx="18" cy="18" r="14"
          fill="none"
          className={s.cls}
          stroke="currentColor"
          strokeWidth="4"
          strokeDasharray={`${s.pct} ${100 - s.pct}`}
          strokeDashoffset={`${-s.offset}`}
          strokeLinecap="round"
        />
      ))}
    </svg>
  )
}

/* ---- Mini horizontal bars for feature cards ---- */
function MiniHBars() {
  const bars = [85, 68, 52, 40]
  return (
    <div className="space-y-1.5 w-full">
      {bars.map((w, i) => (
        <div key={i} className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-primary" style={{ width: `${w}%`, opacity: 1 - i * 0.2 }} />
        </div>
      ))}
    </div>
  )
}

function Home() {
  const { isAuthenticated } = useAuthStore()
  const { theme, toggle } = useThemeStore()

  if (isAuthenticated) {
    return <Navigate to="/analytics" replace />
  }

  const features = [
    {
      icon: BarChart3, title: 'Sales Analytics',
      desc: 'Detailed revenue breakdowns by location, category, and time period.',
      visual: 'bars',
    },
    {
      icon: TrendingUp, title: 'Performance Tracking',
      desc: 'Compare week-on-week, month-on-month. Instantly spot growth trends.',
      visual: 'area',
    },
    {
      icon: Target, title: 'Budget Management',
      desc: 'Upload budgets per location, track actuals against targets.',
      visual: 'progress',
    },
    {
      icon: PieChart, title: 'Custom Reports',
      desc: 'Pre-built and configurable reports you can filter, export, and share.',
      visual: 'donut',
    },
    {
      icon: MapPin, title: 'Multi-Location',
      desc: 'Manage all your stores in one place. Compare locations side by side.',
      visual: 'hbars',
    },
    {
      icon: Clock, title: 'Real-Time Sync',
      desc: 'Data syncs automatically throughout the day with the latest transactions.',
      visual: 'pulse',
    },
  ]

  const renderFeatureVisual = (visual: string) => {
    switch (visual) {
      case 'bars': {
        const bars = [45, 60, 38, 72, 55, 85, 48, 68]
        return (
          <div className="flex items-end gap-1 h-10 w-full">
            {bars.map((h, i) => (
              <div key={i} className="flex-1 rounded-t bg-primary" style={{ height: `${h}%`, opacity: 0.3 + (i / bars.length) * 0.5 }} />
            ))}
          </div>
        )
      }
      case 'area':
        return <MiniAreaChart />
      case 'progress':
        return (
          <div className="w-full space-y-1">
            <div className="flex justify-between text-[10px] text-muted-foreground"><span>Budget</span><span>78%</span></div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-primary/60 to-primary" style={{ width: '78%' }} />
            </div>
          </div>
        )
      case 'donut':
        return <MiniDonut />
      case 'hbars':
        return <MiniHBars />
      case 'pulse':
        return (
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
            </span>
            <span className="text-[10px] text-green-600 dark:text-green-400 font-medium">Live</span>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      <button
        onClick={toggle}
        className="fixed top-6 right-6 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors z-20"
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </button>

      {/* ========== HERO — two-column on desktop ========== */}
      <div className="lg:min-h-screen flex items-center relative">
        {/* Background glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 right-0 w-[600px] h-[600px] bg-primary/[0.07] rounded-full blur-[120px] translate-x-1/4" />
          <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] bg-primary/[0.05] rounded-full blur-[100px] translate-y-1/4" />
        </div>

        <div className="max-w-[1400px] mx-auto px-6 sm:px-10 w-full grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-20 items-center pt-20 pb-12 lg:py-16 relative">

          {/* Left — branding + CTA */}
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-6">
              <Zap className="h-3 w-3" />
              Built for retail
            </div>

            <h1 className="text-4xl sm:text-5xl font-bold tracking-widest uppercase text-foreground mb-2">
              Teliporter
            </h1>
            <p className="text-base sm:text-lg tracking-wider uppercase text-muted-foreground mb-8">
              Reporting
            </p>

            <h2 className="text-2xl sm:text-3xl font-semibold text-foreground leading-snug mb-4">
              Retail reporting<br className="hidden sm:block" /> that works for you
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-6 max-w-md">
              Understand your sales at a glance. Track every location, manage budgets,
              and turn transaction data into clear, actionable insights — updated
              automatically throughout the day.
            </p>

            {/* Quick highlights */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8 max-w-md">
              <div className="flex items-center gap-2.5 bg-card border border-border rounded-lg px-3 py-2.5">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <BarChart3 className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground leading-tight">Analytics</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">Real-time data</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 bg-card border border-border rounded-lg px-3 py-2.5">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Target className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground leading-tight">Budgets</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">Track targets</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 bg-card border border-border rounded-lg px-3 py-2.5">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Users className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground leading-tight">Footfall</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">Conversion rates</p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                to="/login"
                className="inline-flex items-center gap-2 px-8 py-3 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity font-medium shadow-lg shadow-primary/20"
              >
                Sign in
                <ArrowRight className="h-5 w-5" />
              </Link>
            </div>

            {/* Trust badges */}
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" /> Secure &amp; encrypted</span>
              <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" /> Auto-synced daily</span>
              <span className="flex items-center gap-1.5">Any currency supported</span>
            </div>
          </div>

          {/* Right on desktop — decorative dashboard mock with glow */}
          <div className="relative">
            {/* Glow ring behind the card */}
            <div className="absolute -inset-4 bg-gradient-to-br from-primary/20 via-transparent to-primary/10 rounded-3xl blur-2xl opacity-60" />

            <div className="relative bg-card border border-border rounded-2xl shadow-xl p-5 sm:p-6 space-y-4 sm:space-y-5">
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

      {/* ========== STATS BANNER ========== */}
      <div className="border-y border-border bg-card/60 backdrop-blur-sm">
        <div className="max-w-[1400px] mx-auto px-6 sm:px-10 py-8 sm:py-10">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
            {[
              { value: '10+', label: 'Report types', icon: LineChart },
              { value: 'Any', label: 'Currency supported', icon: MapPin },
              { value: '99.9%', label: 'Uptime reliability', icon: Zap },
              { value: '24/7', label: 'Automated data sync', icon: Clock },
            ].map((stat) => (
              <div key={stat.label}>
                <div className="flex items-center justify-center mb-2">
                  <stat.icon className="h-4 w-4 text-primary mr-2" />
                  <span className="text-2xl sm:text-3xl font-bold text-foreground">{stat.value}</span>
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ========== FEATURES SECTION ========== */}
      <div className="bg-card/40 relative">
        {/* Subtle background pattern */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-0 left-1/2 w-[800px] h-[400px] bg-primary/[0.03] rounded-full blur-[100px] -translate-x-1/2 -translate-y-1/2" />
        </div>

        <div className="max-w-[1400px] mx-auto px-6 sm:px-10 py-16 sm:py-24 relative">
          <div className="text-center mb-12 sm:mb-16">
            <p className="text-primary text-sm font-medium mb-2 uppercase tracking-wider">Features</p>
            <h3 className="text-2xl sm:text-3xl font-semibold text-foreground mb-3">Everything you need</h3>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Built for retail businesses that want clear visibility into their sales data without the complexity.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            {features.map((f) => (
              <div key={f.title} className="group bg-card border border-border rounded-xl p-6 hover:shadow-lg hover:border-primary/20 transition-all duration-300">
                <div className="flex items-start justify-between mb-4">
                  <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/15 transition-colors">
                    <f.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="w-16 opacity-60 group-hover:opacity-100 transition-opacity">
                    {renderFeatureVisual(f.visual)}
                  </div>
                </div>
                <h4 className="text-foreground font-semibold mb-2">{f.title}</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ========== SECOND VISUAL — Reports Preview ========== */}
      <div className="border-t border-border">
        <div className="max-w-[1400px] mx-auto px-6 sm:px-10 py-16 sm:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            {/* Left — mock reports card */}
            <div className="relative order-2 lg:order-1">
              <div className="absolute -inset-4 bg-gradient-to-tr from-primary/10 via-transparent to-primary/5 rounded-3xl blur-2xl opacity-50" />
              <div className="relative bg-card border border-border rounded-2xl shadow-lg p-5 sm:p-6 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className="h-2 w-2 rounded-full bg-green-500" />
                  <p className="text-xs text-muted-foreground">Budget vs Actual — January 2026</p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Budget', value: '£86,400', sub: 'Target' },
                    { label: 'Actual', value: '£92,150', sub: '+6.7%' },
                    { label: 'Variance', value: '+£5,750', sub: 'Above target' },
                  ].map((m) => (
                    <div key={m.label} className="bg-muted/30 rounded-lg p-3">
                      <p className="text-[10px] text-muted-foreground">{m.label}</p>
                      <p className="text-sm font-bold text-foreground">{m.value}</p>
                      <p className="text-[10px] text-green-600 dark:text-green-400">{m.sub}</p>
                    </div>
                  ))}
                </div>
                {/* Mock stacked bar */}
                <div className="space-y-2 pt-2">
                  {['Manchester', 'Birmingham', 'Leeds', 'Liverpool'].map((loc, i) => (
                    <div key={loc} className="flex items-center gap-3">
                      <span className="text-[10px] text-muted-foreground w-20 truncate">{loc}</span>
                      <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden flex">
                        <div className="h-full bg-primary/30 rounded-l-full" style={{ width: `${[65, 58, 45, 35][i]}%` }} />
                        <div className="h-full bg-primary/70" style={{ width: `${[72, 65, 48, 32][i] - [65, 58, 45, 35][i] + 5}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-4 text-[10px] text-muted-foreground pt-1">
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-primary/30" /> Budget</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-primary/70" /> Actual</span>
                </div>
              </div>
            </div>

            {/* Right — text */}
            <div className="order-1 lg:order-2">
              <p className="text-primary text-sm font-medium mb-2 uppercase tracking-wider">Reports</p>
              <h3 className="text-2xl sm:text-3xl font-semibold text-foreground mb-4">
                Reports that tell the full story
              </h3>
              <p className="text-muted-foreground leading-relaxed mb-6">
                From daily summaries to budget performance, footfall conversion, and product-level breakdowns — every report is designed to surface the metrics that matter most to your retail business.
              </p>
              <ul className="space-y-3">
                {[
                  { icon: BarChart3, text: 'Budget vs Actual with variance tracking' },
                  { icon: Users, text: 'Footfall & conversion rate analysis' },
                  { icon: PieChart, text: 'Product & category breakdowns' },
                  { icon: TrendingUp, text: 'Trend analysis across any time period' },
                ].map((item) => (
                  <li key={item.text} className="flex items-center gap-3 text-sm text-foreground">
                    <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <item.icon className="h-3.5 w-3.5 text-primary" />
                    </div>
                    {item.text}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* ========== CTA SECTION ========== */}
      <div className="border-t border-border bg-card/60">
        <div className="max-w-[1400px] mx-auto px-6 sm:px-10 py-16 sm:py-20 text-center">
          <h3 className="text-2xl sm:text-3xl font-semibold text-foreground mb-4">
            Ready to see your data clearly?
          </h3>
          <p className="text-muted-foreground max-w-md mx-auto mb-8">
            Sign in to access your dashboard, reports, and real-time analytics across all your locations.
          </p>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 px-8 py-3 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity font-medium shadow-lg shadow-primary/20"
          >
            Get started
            <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
      </div>

      {/* ========== FOOTER ========== */}
      <div className="border-t border-border">
        <div className="max-w-[1400px] mx-auto px-6 sm:px-10 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
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
