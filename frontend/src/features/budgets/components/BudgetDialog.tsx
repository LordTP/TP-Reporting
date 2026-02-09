import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface BudgetEntry {
  id: string
  location_id: string
  date: string
  budget_amount: number
  currency: string
  location_name?: string
}

interface BudgetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  locations: Array<{ id: string; name: string }>
  editEntry: BudgetEntry | null
  defaultDate?: string
  defaultLocationId?: string
  onSuccess: () => void
}

export default function BudgetDialog({ open, onOpenChange, locations, editEntry, defaultDate, defaultLocationId, onSuccess }: BudgetDialogProps) {
  const queryClient = useQueryClient()
  const isEdit = !!editEntry

  const [date, setDate] = useState('')
  const [locationId, setLocationId] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setError('')
      if (editEntry) {
        setDate(editEntry.date)
        setLocationId(editEntry.location_id)
        setAmount(String(editEntry.budget_amount / 100))
      } else {
        setDate(defaultDate || new Date().toISOString().split('T')[0])
        setLocationId(defaultLocationId || '')
        setAmount('')
      }
    }
  }, [open, editEntry, defaultDate, defaultLocationId])

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['budget-entries'] })
    queryClient.invalidateQueries({ queryKey: ['budget-coverage'] })
    queryClient.invalidateQueries({ queryKey: ['existing-budgets'] })
  }

  const createMutation = useMutation({
    mutationFn: (data: { location_id: string; date: string; budget_amount: number; currency: string; budget_type: string }) =>
      apiClient.post('/budgets/', data),
    onSuccess: () => {
      invalidateAll()
      onSuccess()
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail || err?.message || 'Failed to create budget'
      setError(detail)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, budget_amount }: { id: string; budget_amount: number }) =>
      apiClient.patch(`/budgets/${id}`, { budget_amount }),
    onSuccess: () => {
      invalidateAll()
      onSuccess()
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail || err?.message || 'Failed to update budget'
      setError(detail)
    },
  })

  const handleSubmit = () => {
    setError('')
    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum < 0) {
      setError('Amount must be a non-negative number')
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

    const amountPence = Math.round(amountNum * 100)

    if (isEdit && editEntry) {
      updateMutation.mutate({ id: editEntry.id, budget_amount: amountPence })
    } else {
      createMutation.mutate({
        location_id: locationId,
        date,
        budget_amount: amountPence,
        currency: 'GBP',
        budget_type: 'daily',
      })
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Budget' : 'Add Budget'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the budget amount for this entry.'
              : 'Set a daily budget target for a location.'}
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
            <Label>Budget Amount (£)</Label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 5000"
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
            {isPending ? 'Saving...' : isEdit ? 'Update' : 'Add Budget'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
