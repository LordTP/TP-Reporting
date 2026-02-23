import FootfallEntry from '@/features/footfall/FootfallEntry'
import AppNav from '@/components/layout/AppNav'

export default function FootfallPage() {
  return (
    <div className="min-h-screen bg-background relative">
      <AppNav />
      <main className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <FootfallEntry />
      </main>
    </div>
  )
}
