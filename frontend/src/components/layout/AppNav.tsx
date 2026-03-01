import { Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useThemeStore } from '@/store/themeStore'
import { usePermissionStore } from '@/store/permissionStore'
import { apiClient } from '@/lib/api-client'
import { Sun, Moon, Menu, BarChart3, ShoppingCart, FileText, Wallet, Footprints, Shield, Store, LogOut } from 'lucide-react'
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet'

const FULL_ACCESS_ROLES = ['admin', 'superadmin']

export default function AppNav() {
  const { user } = useAuthStore()
  const { logout } = useAuth()
  const location = useLocation()
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'
  const { theme, toggle } = useThemeStore()
  const permHas = usePermissionStore((s) => s.hasPermission)
  const hasPerm = (key: string) => {
    if (user && FULL_ACCESS_ROLES.includes(user.role)) return true
    return permHas(key)
  }

  const { data: ratesData } = useQuery({
    queryKey: ['exchange-rates-nav'],
    queryFn: () => apiClient.get('/exchange-rates'),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const navLink = (to: string, label: string, mobile = false, Icon?: React.ComponentType<{ className?: string }>) => {
    const isActive = location.pathname === to || location.pathname.startsWith(to + '/')
    if (mobile) {
      return (
        <Link
          to={to}
          className={`flex items-center gap-3 px-3 py-2 text-[15px] font-medium rounded-lg transition-all duration-200 ${
            isActive
              ? 'bg-brand-core-blue/30 text-white'
              : 'text-brand-glow-blue hover:text-white hover:bg-brand-core-blue/15'
          }`}
        >
          {Icon && <Icon className={`h-4 w-4 flex-shrink-0 ${isActive ? 'text-brand-core-orange' : ''}`} />}
          {label}
        </Link>
      )
    }
    return (
      <Link
        to={to}
        className={`text-sm font-medium transition-all duration-300 ${isActive ? 'text-primary dark:drop-shadow-[0_0_6px_rgba(251,115,30,0.4)]' : 'text-muted-foreground hover:text-foreground'}`}
      >
        {label}
      </Link>
    )
  }

  return (
    <>
    <nav className="bg-card/95 backdrop-blur-md border-b border-border/50 sticky top-0 z-40 shadow-sm dark:bg-brand-shadow-blue/95 dark:border-brand-core-blue/10">
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-14 sm:h-16 items-center">
          {/* Left: Logo + Desktop nav */}
          <div className="flex items-center gap-8">
            <div className="flex flex-col items-center gap-0.5">
              <h1 className="text-base sm:text-lg font-light text-foreground tracking-brand-heading uppercase leading-none">
                Teliporter
              </h1>
              <span className="text-[10px] sm:text-xs tracking-brand-sub uppercase text-muted-foreground font-medium leading-none">
                Reporting
              </span>
            </div>
            <div className="hidden md:flex gap-5">
              {hasPerm('page:analytics') && navLink('/analytics', 'Analytics')}
              {hasPerm('page:sales') && navLink('/sales', 'Sales')}
              {hasPerm('page:reports') && navLink('/reports', 'Reports')}
              {hasPerm('page:budgets') && navLink('/budgets', 'Budgets')}
              {hasPerm('page:footfall') && navLink('/footfall', 'Footfall')}
              {hasPerm('page:admin') && navLink('/dashboard', 'Admin')}
              {hasPerm('page:square_accounts') && navLink('/square-accounts', 'Square Accounts')}
            </div>
          </div>

          {/* Right: Desktop actions + Hamburger */}
          <div className="flex items-center gap-2 sm:gap-3">
            {ratesData?.rates && ratesData.rates.length > 0 && (
              <div className="hidden lg:flex items-center gap-4">
                {ratesData.rates.map((r: any) => (
                  <span key={r.id} className="text-xs text-muted-foreground whitespace-nowrap">
                    <span className="font-medium text-foreground">{r.from_currency}</span>
                    <span className="mx-0.5">/</span>
                    <span className="font-medium text-foreground">{r.to_currency}</span>
                    <span className="ml-1 text-primary font-semibold">{r.rate.toFixed(2)}</span>
                  </span>
                ))}
              </div>
            )}
            <button
              onClick={toggle}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <span className="hidden sm:inline text-sm text-muted-foreground">
              {user?.full_name}{isAdmin ? ` (${user?.role})` : ''}
            </span>
            <button
              onClick={() => logout()}
              className="hidden sm:inline-flex px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md font-medium tracking-wide hover:bg-brand-light-orange hover:shadow-glow-orange-sm transition-all duration-300"
            >
              Logout
            </button>

            {/* Mobile side drawer */}
            <Sheet>
              <SheetTrigger asChild>
                <button className="md:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                  <Menu className="h-5 w-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="flex flex-col p-0 w-[280px] !bg-[hsl(240,16%,9%)] !border-l !border-brand-core-blue/20">
                <SheetTitle className="sr-only">Navigation Menu</SheetTitle>

                {/* Brand */}
                <div className="px-5 pt-5 pb-2">
                  <h2 className="text-base font-light text-white tracking-brand-heading uppercase leading-none">
                    Teliporter
                  </h2>
                  <span className="text-[10px] tracking-brand-sub uppercase text-brand-light-blue font-medium">
                    Reporting
                  </span>
                </div>

                <div className="h-[2px] bg-gradient-to-r from-transparent via-primary/40 to-transparent dark:via-brand-core-orange/30" />

                {/* Nav links */}
                <div className="flex-1 overflow-y-auto py-2 px-3 space-y-0.5">
                  {hasPerm('page:analytics') && navLink('/analytics', 'Analytics', true, BarChart3)}
                  {hasPerm('page:sales') && navLink('/sales', 'Sales', true, ShoppingCart)}
                  {hasPerm('page:reports') && navLink('/reports', 'Reports', true, FileText)}
                  {hasPerm('page:budgets') && navLink('/budgets', 'Budgets', true, Wallet)}
                  {hasPerm('page:footfall') && navLink('/footfall', 'Footfall', true, Footprints)}
                  {hasPerm('page:admin') && navLink('/dashboard', 'Admin', true, Shield)}
                  {hasPerm('page:square_accounts') && navLink('/square-accounts', 'Square', true, Store)}
                </div>

                <div className="h-[2px] bg-gradient-to-r from-transparent via-primary/40 to-transparent dark:via-brand-core-orange/30" />

                {/* Footer */}
                <div className="px-4 py-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-brand-light-blue truncate">
                      {user?.full_name}{isAdmin ? <span className="text-brand-light-blue/60"> · {user?.role}</span> : ''}
                    </p>
                    <button
                      onClick={toggle}
                      className="p-1.5 rounded-md text-brand-light-blue hover:text-white hover:bg-brand-core-blue/20 transition-colors"
                    >
                      {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <button
                    onClick={() => logout()}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm bg-brand-core-orange/90 text-white rounded-lg font-medium tracking-wide hover:bg-brand-core-orange transition-all duration-200"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Logout
                  </button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>

      <div className="h-[2px] bg-gradient-to-r from-transparent via-primary/40 to-transparent dark:via-brand-core-orange/30" />
    </nav>

    {ratesData?.rates && ratesData.rates.length > 0 && (
      <div className="lg:hidden flex items-center gap-4 px-4 sm:px-6 lg:px-8 py-1.5 bg-muted/50 border-b border-border/50">
        <div className="max-w-[1800px] mx-auto w-full flex items-center gap-4">
          {ratesData.rates.map((r: any) => (
            <span key={r.id} className="text-xs text-muted-foreground whitespace-nowrap">
              <span className="font-medium text-foreground">{r.from_currency}</span>
              <span className="mx-0.5">/</span>
              <span className="font-medium text-foreground">{r.to_currency}</span>
              <span className="ml-1 text-primary font-semibold">{r.rate.toFixed(2)}</span>
            </span>
          ))}
        </div>
      </div>
    )}
    </>
  )
}
