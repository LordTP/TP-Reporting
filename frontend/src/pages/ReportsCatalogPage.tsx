import { Link } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { usePermissionStore } from '@/store/permissionStore'
import { REPORTS, REPORT_CATEGORIES, type ReportCategory, type ReportDefinition } from '@/config/reportCatalog'
import { Card, CardContent } from '@/components/ui/card'
import AppNav from '@/components/layout/AppNav'
import { Badge } from '@/components/ui/badge'
import { FileText, ChevronRight } from 'lucide-react'

const FULL_ACCESS_ROLES = ['admin', 'superadmin']

export default function ReportsCatalogPage() {
  const { user } = useAuthStore()
  const permHas = usePermissionStore((s) => s.hasPermission)
  const hasPerm = (key: string) => {
    if (user && FULL_ACCESS_ROLES.includes(user.role)) return true
    return permHas(key)
  }
  const categories: ReportCategory[] = ['sales', 'financial', 'operational']

  return (
    <div className="min-h-screen bg-background">
      <AppNav />

      <main className="max-w-[1800px] mx-auto px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-foreground">Reports</h2>
          </div>
          <p className="text-muted-foreground mt-1 ml-[52px]">
            Browse and generate detailed reports for your business. Select a report to view data with filters.
          </p>
        </div>

        {/* Category Sections */}
        {categories.map((categoryKey) => {
          const category = REPORT_CATEGORIES[categoryKey]
          const reports = REPORTS.filter(r => r.category === categoryKey && hasPerm(r.permissionKey))

          return (
            <div key={categoryKey} className="mb-10">
              {/* Section Header */}
              <div className="flex items-center gap-3 mb-5">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">{category.label}</h3>
                  <p className="text-sm text-muted-foreground">{category.description}</p>
                </div>
                <div className="flex-1 h-px bg-border/60" />
              </div>

              {/* Report Cards Grid */}
              <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {reports.map((report) => (
                  <ReportCard key={report.slug} report={report} />
                ))}
              </div>
            </div>
          )
        })}
      </main>
    </div>
  )
}

function ReportCard({ report }: { report: ReportDefinition }) {
  const isAvailable = report.status === 'available'
  const Icon = report.icon

  const card = (
    <Card className={`group relative overflow-hidden transition-all duration-200 h-full ${
      isAvailable
        ? 'hover:shadow-md hover:-translate-y-0.5 cursor-pointer'
        : 'opacity-50 cursor-default'
    }`}>
      <div
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg"
        style={{ backgroundColor: isAvailable ? report.accentColor : 'hsl(var(--muted-foreground))' }}
      />
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div
            className="flex items-center justify-center h-10 w-10 rounded-lg bg-muted/60 shrink-0"
            style={{ color: isAvailable ? report.accentColor : 'hsl(var(--muted-foreground))' }}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-semibold text-foreground text-sm">{report.title}</h4>
              {!isAvailable && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Coming Soon</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
              {report.description}
            </p>
          </div>
          {isAvailable && (
            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0 mt-1" />
          )}
        </div>
      </CardContent>
    </Card>
  )

  if (isAvailable) {
    return <Link to={`/reports/${report.slug}`}>{card}</Link>
  }
  return card
}
