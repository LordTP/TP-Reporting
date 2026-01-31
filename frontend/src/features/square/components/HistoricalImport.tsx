/**
 * Historical Import Component
 * UI for importing historical Square data
 */
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { squareApi } from '../api/squareApi'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CalendarIcon, Download, Info, RefreshCw } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import type { HistoricalImportRequest } from '@/types/square'

interface HistoricalImportProps {
  accountId: string
  onClose: () => void
}

export default function HistoricalImport({ accountId, onClose }: HistoricalImportProps) {
  const [startDate, setStartDate] = useState<Date>()
  const [endDate, setEndDate] = useState<Date>()
  const [importStarted, setImportStarted] = useState(false)
  const queryClient = useQueryClient()

  // Start import mutation
  const importMutation = useMutation({
    mutationFn: (request: HistoricalImportRequest) => squareApi.startHistoricalImport(request),
    onSuccess: (data) => {
      console.log('Import started successfully:', data)
      setImportStarted(true)
      queryClient.invalidateQueries({ queryKey: ['square-imports'] })
      queryClient.invalidateQueries({ queryKey: ['sales-transactions'] })
      queryClient.invalidateQueries({ queryKey: ['sales-aggregation'] })
      setTimeout(() => {
        onClose()
      }, 3000)
    },
    onError: (error: any) => {
      console.error('Import failed:', error)
      const errorMessage = error?.response?.data?.detail || error.message || 'Unknown error'
      alert(`Failed to start import: ${errorMessage}`)
    },
  })

  const handleStartImport = () => {
    if (!startDate || !endDate) {
      alert('Please select both start and end dates')
      return
    }

    if (startDate > endDate) {
      alert('Start date must be before end date')
      return
    }

    if (
      !confirm(
        `This will import all historical data from ${format(startDate, 'PPP')} to ${format(
          endDate,
          'PPP'
        )}. This may take some time. Continue?`
      )
    ) {
      return
    }

    importMutation.mutate({
      square_account_id: accountId,
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
    })
  }

  const handleQuickSelect = (months: number) => {
    const end = new Date()
    const start = new Date()
    start.setMonth(start.getMonth() - months)
    setStartDate(start)
    setEndDate(end)
  }

  if (importStarted) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Started</DialogTitle>
          </DialogHeader>
          <Alert>
            <Download className="h-4 w-4" />
            <AlertDescription>
              Historical data import has been started. You can check the progress in the Sync Status
              dashboard. This window will close automatically.
            </AlertDescription>
          </Alert>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Historical Data</DialogTitle>
          <DialogDescription>
            Import sales data from a specific date range. This is a one-time import for historical
            data.
          </DialogDescription>
        </DialogHeader>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Historical imports may take several minutes to complete depending on the date range. Only
            active locations will be included in the import.
          </AlertDescription>
        </Alert>

        <div className="space-y-6">
          {/* Quick Select Buttons */}
          <div>
            <Label className="mb-2 block">Quick Select</Label>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => handleQuickSelect(1)}>
                Last Month
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleQuickSelect(3)}>
                Last 3 Months
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleQuickSelect(6)}>
                Last 6 Months
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleQuickSelect(12)}>
                Last Year
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleQuickSelect(24)}>
                Last 2 Years
              </Button>
            </div>
          </div>

          {/* Date Range Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !startDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, 'PPP') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={setStartDate}
                    disabled={(date) => date > new Date() || (!!endDate && date > endDate)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>End Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !endDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, 'PPP') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={setEndDate}
                    disabled={(date) => date > new Date() || (!!startDate && date < startDate)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {startDate && endDate && (
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm">
                <strong>Date Range:</strong> {format(startDate, 'PPP')} to {format(endDate, 'PPP')}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Approximately {Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))}{' '}
                days of data will be imported.
              </p>
            </div>
          )}
        </div>

        {importMutation.isError && (
          <Alert variant="destructive">
            <AlertDescription>
              Failed to start import. Please try again or check the backend logs.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose} disabled={importMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleStartImport}
            disabled={!startDate || !endDate || importMutation.isPending}
          >
            {importMutation.isPending ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Starting Import...
              </>
            ) : (
              'Start Import'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
