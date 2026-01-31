import { Link, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useThemeStore } from '@/store/themeStore'
import { Sun, Moon } from 'lucide-react'

export default function AppNav() {
  const { user } = useAuthStore()
  const { logout } = useAuth()
  const location = useLocation()
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'
  const { theme, toggle } = useThemeStore()

  const navLink = (to: string, label: string) => {
    const isActive = location.pathname === to || location.pathname.startsWith(to + '/')
    return (
      <Link
        to={to}
        className={`text-sm font-medium transition-colors ${isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
      >
        {label}
      </Link>
    )
  }

  return (
    <nav className="bg-card/95 backdrop-blur-sm border-b border-border sticky top-0 z-40 shadow-sm">
      <div className="max-w-[1800px] mx-auto px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <div className="flex items-center gap-8">
            <h1 className="text-lg font-bold text-foreground tracking-widest uppercase">
              Teliporter
            </h1>
            <div className="flex gap-5">
              {navLink('/analytics', 'Analytics')}
              {navLink('/sales', 'Sales')}
              {navLink('/reports', 'Reports')}
              {isAdmin && navLink('/budgets', 'Budgets')}
              {isAdmin && navLink('/dashboard', 'Admin')}
              {isAdmin && navLink('/square-accounts', 'Square Accounts')}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={toggle}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <span className="text-sm text-muted-foreground">
              {user?.full_name}{isAdmin ? ` (${user?.role})` : ''}
            </span>
            <button
              onClick={() => logout()}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
      <div className="h-0.5 bg-primary/30" />
    </nav>
  )
}
