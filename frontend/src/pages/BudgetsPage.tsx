import BudgetUpload from '@/features/budgets/BudgetUpload'
import AppNav from '@/components/layout/AppNav'

export default function BudgetsPage() {
  return (
    <div className="min-h-screen bg-background">
      <AppNav />
      <main className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <BudgetUpload />
      </main>
    </div>
  )
}
