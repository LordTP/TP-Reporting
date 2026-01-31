import { useParams, Link } from 'react-router-dom'
import { REPORTS } from '@/config/reportCatalog'
import { useReportFilters } from './useReportFilters'
import ReportLayout from './ReportLayout'
import { Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function ComingSoonReport() {
  const { slug } = useParams<{ slug: string }>()
  const filters = useReportFilters()
  const reportDef = REPORTS.find(r => r.slug === slug)

  return (
    <ReportLayout
      title={reportDef?.title || 'Report'}
      description={reportDef?.description}
      filters={filters}
    >
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="h-16 w-16 rounded-2xl bg-muted/60 flex items-center justify-center mb-6">
          <Clock className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-xl font-semibold text-foreground mb-2">Coming Soon</h3>
        <p className="text-muted-foreground max-w-md mb-8">
          This report is currently being developed and will be available in a future update.
        </p>
        <Link to="/reports">
          <Button variant="outline">Back to Reports</Button>
        </Link>
      </div>
    </ReportLayout>
  )
}
