import { Link } from 'react-router-dom'
import { ArrowLeft, Filter, Package, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useReportFilters } from './useReportFilters'
import AppNav from '@/components/layout/AppNav'

interface ReportLayoutProps {
  title: string
  description?: string
  children: React.ReactNode
  filters: ReturnType<typeof useReportFilters>
  onRefresh?: () => void
  isLoading?: boolean
}

export default function ReportLayout({ title, description, children, filters, onRefresh, isLoading }: ReportLayoutProps) {
  const {
    datePreset, setDatePreset,
    customStartDate, setCustomStartDate,
    customEndDate, setCustomEndDate,
    selectedLocation, setSelectedLocation,
    selectedClient, setSelectedClient,
    filteredLocations,
    clientsData,
    isAdmin,
    isClientLocked,
  } = filters

  return (
    <div className="min-h-screen bg-background">
      <AppNav />

      <main className="max-w-[1800px] mx-auto px-6 lg:px-8 py-8">
        {/* Breadcrumb + Header */}
        <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
          <Link to="/reports" className="hover:text-primary flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" />
            Reports
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium">{title}</span>
        </div>

        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">{title}</h2>
            {description && <p className="text-muted-foreground mt-1">{description}</p>}
          </div>
          {onRefresh && (
            <Button onClick={onRefresh} variant="outline" size="sm">
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-8 p-4 bg-card/80 backdrop-blur-sm border border-border/50 rounded-xl shadow-sm">
          <div className="flex items-center gap-2 mr-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">Filters</span>
          </div>

          <Select value={datePreset} onValueChange={setDatePreset}>
            <SelectTrigger className="w-[160px] h-9 text-sm">
              <SelectValue placeholder="Date range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="this_week">This Week</SelectItem>
              <SelectItem value="this_month">This Month</SelectItem>
              <SelectItem value="this_year">This Year</SelectItem>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="60">Last 60 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="180">Last 6 months</SelectItem>
              <SelectItem value="365">Last year</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>

          {datePreset === 'custom' && (
            <>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="h-9 px-3 text-sm rounded-md border border-input bg-background text-foreground"
                placeholder="From"
              />
              <span className="text-sm text-muted-foreground self-center">to</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="h-9 px-3 text-sm rounded-md border border-input bg-background text-foreground"
                placeholder="To"
              />
            </>
          )}

          {isAdmin && !isClientLocked && (
            <>
              <Select value={selectedClient} onValueChange={(value) => {
                setSelectedClient(value)
                setSelectedLocation('all')
              }}>
                <SelectTrigger className="w-[180px] h-9 text-sm">
                  <SelectValue placeholder="All clients" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All clients</SelectItem>
                  {clientsData?.clients?.map((client: any) => (
                    <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {(() => {
                const selClient = clientsData?.clients?.find((c: any) => c.id === selectedClient)
                const hasKeywords = selClient?.category_keywords && selClient.category_keywords.length > 0
                if (hasKeywords) {
                  return (
                    <div className="flex items-center gap-1.5 px-3 h-9 rounded-md bg-violet-50 border border-violet-200 text-violet-700 text-sm">
                      <Package className="h-3.5 w-3.5" />
                      <span>Category filtered</span>
                    </div>
                  )
                }
                return (
                  <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                    <SelectTrigger className="w-[200px] h-9 text-sm">
                      <SelectValue placeholder="All locations" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        {selectedClient !== 'all' ? 'All client locations' : 'All locations'}
                      </SelectItem>
                      {filteredLocations?.map((location: any) => (
                        <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )
              })()}
            </>
          )}
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {/* Content */}
        {!isLoading && children}
      </main>
    </div>
  )
}
