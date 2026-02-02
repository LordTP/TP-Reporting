import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface FootfallEntry {
  id: string
  location_id: string
  date: string
  count: number
  location_name: string | null
}

interface FootfallDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  locations: Array<{ id: string; name: string }>
  editEntry: FootfallEntry | null
  defaultDate?: string
  defaultLocationId?: string
  onSuccess: () => void
}

export default function FootfallDialog({ open, onOpenChange, locations, editEntry, defaultDate, defaultLocationId, onSuccess }: FootfallDialogProps) {
  const queryClient = useQueryClient()
  const isEdit = !!editEntry

  const [date, setDate] = useState('')
  const [locationId, setLocationId] = useState('')
  const [count, setCount] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setError('')
      if (editEntry) {
        setDate(editEntry.date)
        setLocationId(editEntry.location_id)
        setCount(String(editEntry.count))
      } else {
        setDate(defaultDate || new Date().toISOString().split('T')[0])
        setLocationId(defaultLocationId || '')
        setCount('')
      }
    }
  }, [open, editEntry, defaultDate, defaultLocationId])

  const createMutation = useMutation({
    mutationFn: (data: { location_id: string; date: string; count: number }) =>
      apiClient.post('/footfall/', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['footfall-entries'] })
      queryClient.invalidateQueries({ queryKey: ['footfall-coverage'] })
      onSuccess()
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail || err?.message || 'Failed to create entry'
      setError(detail)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, count }: { id: string; count: number }) =>
      apiClient.put(`/footfall/${id}`, { count }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['footfall-entries'] })
      queryClient.invalidateQueries({ queryKey: ['footfall-coverage'] })
      onSuccess()
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail || err?.message || 'Failed to update entry'
      setError(detail)
    },
  })

  const handleSubmit = () => {
    setError('')
    const countNum = parseInt(count, 10)
    if (isNaN(countNum) || countNum < 0) {
      setError('Count must be a non-negative number')
      return
    }
    if (!locationId) {
      setError('Please select a location')
      return
    }
    if (!date) {
      setError('Please select a date')
      return
    }

    if (isEdit && editEntry) {
      updateMutation.mutate({ id: editEntry.id, count: countNum })
    } else {
      createMutation.mutate({ location_id: locationId, date, count: countNum })
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Footfall Entry' : 'Add Footfall Entry'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the visitor count for this entry.'
              : 'Log the daily visitor count for a location.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Date</Label>
            {isEdit ? (
              <p className="text-sm text-foreground font-medium py-2">
                {new Date(date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            ) : (
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            )}
          </div>

          <div className="space-y-2">
            <Label>Location</Label>
            {isEdit ? (
              <p className="text-sm text-foreground font-medium py-2">
                {editEntry?.location_name || locationId}
              </p>
            ) : (
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a location" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label>Footfall Count</Label>
            <input
              type="number"
              min="0"
              value={count}
              onChange={(e) => setCount(e.target.value)}
              placeholder="e.g. 350"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? 'Saving...' : isEdit ? 'Update' : 'Add Entry'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
