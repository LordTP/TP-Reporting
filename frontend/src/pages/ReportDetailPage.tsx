import { useParams, Navigate } from 'react-router-dom'
import { REPORTS } from '@/config/reportCatalog'
import { useAuthStore } from '@/store/authStore'
import DailySalesSummaryReport from '@/features/reports/DailySalesSummaryReport'
import SalesByProductReport from '@/features/reports/SalesByProductReport'
import SalesByCategoryReport from '@/features/reports/SalesByCategoryReport'
import SalesByLocationReport from '@/features/reports/SalesByLocationReport'
import SalesByPaymentMethodReport from '@/features/reports/SalesByPaymentMethodReport'
import TaxReport from '@/features/reports/TaxReport'
import DiscountReport from '@/features/reports/DiscountReport'
import RefundReport from '@/features/reports/RefundReport'
import TipsReport from '@/features/reports/TipsReport'
import HourlySalesPatternReport from '@/features/reports/HourlySalesPatternReport'
import BudgetVsActualReport from '@/features/reports/BudgetVsActualReport'
import BasketAnalysisReport from '@/features/reports/BasketAnalysisReport'
import ComingSoonReport from '@/features/reports/ComingSoonReport'

const REPORT_COMPONENTS: Record<string, React.ComponentType> = {
  'daily-sales-summary': DailySalesSummaryReport,
  'sales-by-product': SalesByProductReport,
  'sales-by-category': SalesByCategoryReport,
  'sales-by-location': SalesByLocationReport,
  'sales-by-payment-method': SalesByPaymentMethodReport,
  'tax-report': TaxReport,
  'discount-report': DiscountReport,
  'refund-report': RefundReport,
  'tips-report': TipsReport,
  'hourly-sales-pattern': HourlySalesPatternReport,
  'budget-vs-actual': BudgetVsActualReport,
  'basket-analysis': BasketAnalysisReport,
}

export default function ReportDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'
  const reportDef = REPORTS.find(r => r.slug === slug)

  if (!reportDef) return <Navigate to="/reports" replace />

  // Block non-admin access to admin-only reports
  if (reportDef.adminOnly && !isAdmin) return <Navigate to="/reports" replace />

  const ReportComponent = REPORT_COMPONENTS[slug!] || ComingSoonReport
  return <ReportComponent />
}
