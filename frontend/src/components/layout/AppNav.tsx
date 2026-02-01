import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useThemeStore } from '@/store/themeStore'
import { usePermissionStore } from '@/store/permissionStore'
import { apiClient } from '@/lib/api-client'
import { Sun, Moon, Menu, X } from 'lucide-react'

const FULL_ACCESS_ROLES = ['admin', 'superadmin']

export default function AppNav() {
  const { user } = useAuthStore()
  const { logout } = useAuth()
  const location = useLocation()
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'
  const { theme, toggle } = useThemeStore()
  const [mobileOpen, setMobileOpen] = useState(false)
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
        onClick={() => setMobileOpen(false)}
        className={`${mobile ? 'block px-4 py-2.5 text-sm' : 'text-sm'} font-medium transition-colors ${isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
      >
        {label}
      </Link>
    )
  }

  return (
    <nav className="bg-card/95 backdrop-blur-sm border-b border-border sticky top-0 z-40 shadow-sm">
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-14 sm:h-16 items-center">
          {/* Left: Logo + Desktop nav */}
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-1 md:flex-col md:items-center md:gap-0">
              <h1 className="text-base sm:text-lg font-bold text-foreground tracking-widest uppercase leading-none">
                Teliporter
              </h1>
              <span className="text-[10px] sm:text-xs tracking-wider uppercase text-muted-foreground font-medium leading-none md:-mt-0.5">
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
            {/* Hamburger button — mobile only */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-card">
          <div className="py-2">
            {hasPerm('page:analytics') && navLink('/analytics', 'Analytics', true)}
            {hasPerm('page:sales') && navLink('/sales', 'Sales', true)}
            {hasPerm('page:reports') && navLink('/reports', 'Reports', true)}
            {hasPerm('page:budgets') && navLink('/budgets', 'Budgets', true)}
            {hasPerm('page:footfall') && navLink('/footfall', 'Footfall', true)}
            {hasPerm('page:admin') && navLink('/dashboard', 'Admin', true)}
            {hasPerm('page:square_accounts') && navLink('/square-accounts', 'Square Accounts', true)}
          </div>
          <div className="border-t border-border px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {user?.full_name}{isAdmin ? ` (${user?.role})` : ''}
            </span>
            <button
              onClick={() => { setMobileOpen(false); logout() }}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
            >
              Logout
            </button>
          </div>
        </div>
      )}

      <div className="h-0.5 bg-primary/30" />
    </nav>
  )
}
