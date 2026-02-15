import { Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useThemeStore } from '@/store/themeStore'
import { usePermissionStore } from '@/store/permissionStore'
import { apiClient } from '@/lib/api-client'
import { Sun, Moon, Menu } from 'lucide-react'
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

  const navLink = (to: string, label: string, mobile = false) => {
    const isActive = location.pathname === to || location.pathname.startsWith(to + '/')
    return (
      <Link
        to={to}
        className={`${mobile ? 'block px-2 py-3.5 text-lg' : 'text-sm'} font-medium transition-colors ${isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
      >
        {label}
      </Link>
    )
  }

  return (
    <>
    <nav className="bg-card/95 backdrop-blur-sm border-b border-border sticky top-0 z-40 shadow-sm">
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-14 sm:h-16 items-center">
          {/* Left: Logo + Desktop nav */}
          <div className="flex items-center gap-8">
            <div className="flex flex-col items-center gap-0.5">
              <h1 className="text-base sm:text-lg font-bold text-foreground tracking-widest uppercase leading-none">
                Teliporter
              </h1>
              <span className="text-[10px] sm:text-xs tracking-wider uppercase text-muted-foreground font-medium leading-none">
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
              className="hidden sm:inline-flex px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
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
              <SheetContent side="right" className="flex flex-col p-0 w-[280px]">
                <SheetTitle className="sr-only">Navigation Menu</SheetTitle>

                {/* Brand */}
                <div className="px-6 pt-6 pb-4">
                  <div className="flex flex-col items-start gap-0">
                    <h2 className="text-lg font-bold text-foreground tracking-widest uppercase leading-none">
                      Teliporter
                    </h2>
                    <span className="text-xs tracking-wider uppercase text-muted-foreground font-medium">
                      Reporting
                    </span>
                  </div>
                </div>

                {/* Nav links */}
                <div className="flex-1 overflow-y-auto py-4 px-4 space-y-1">
                  {hasPerm('page:analytics') && navLink('/analytics', 'Analytics', true)}
                  {hasPerm('page:sales') && navLink('/sales', 'Sales', true)}
                  {hasPerm('page:reports') && navLink('/reports', 'Reports', true)}
                  {hasPerm('page:budgets') && navLink('/budgets', 'Budgets', true)}
                  {hasPerm('page:footfall') && navLink('/footfall', 'Footfall', true)}
                  {hasPerm('page:admin') && navLink('/dashboard', 'Admin', true)}
                  {hasPerm('page:square_accounts') && navLink('/square-accounts', 'Square Accounts', true)}
                </div>

                {/* Footer: user info + logout */}
                <div className="px-6 py-4">
                  <p className="text-sm text-muted-foreground mb-3">
                    {user?.full_name}{isAdmin ? ` (${user?.role})` : ''}
                  </p>
                  <button
                    onClick={() => logout()}
                    className="w-full px-4 py-2.5 text-sm bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
                  >
                    Logout
                  </button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>

      <div className="h-0.5 bg-primary/30" />
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
