import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Pencil, Trash2, Footprints } from 'lucide-react'

interface FootfallEntry {
  id: string
  location_id: string
  date: string
  count: number
  location_name: string | null
  creator_name: string | null
  created_at: string
}

interface FootfallTableProps {
  entries: FootfallEntry[]
  isLoading: boolean
  canManage: boolean
  onEdit: (entry: FootfallEntry) => void
  onDelete: (id: string) => void
}

export default function FootfallTable({ entries, isLoading, canManage, onEdit, onDelete }: FootfallTableProps) {
  const [deleteEntry, setDeleteEntry] = useState<FootfallEntry | null>(null)

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex items-center justify-center gap-3 text-muted-foreground">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
            <span className="text-sm">Loading entries...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (entries.length === 0) {
    return (
      <Card>
        <CardContent className="py-16">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="h-12 w-12 rounded-xl bg-muted/60 flex items-center justify-center mb-4">
              <Footprints className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground mb-1">No footfall entries yet</p>
            <p className="text-sm text-muted-foreground">
              {canManage
                ? 'Click "Add Entry" above to log your first daily footfall count.'
                : 'No footfall data has been recorded yet.'}
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Location</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Count</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Entered By</th>
                  {canManage && (
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium whitespace-nowrap">{formatDate(entry.date)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{entry.location_name || '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{entry.count.toLocaleString()}</td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{entry.creator_name || '—'}</td>
                    {canManage && (
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => onEdit(entry)}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteEntry(entry)}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteEntry} onOpenChange={() => setDeleteEntry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Footfall Entry</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the footfall entry for{' '}
              <span className="font-medium text-foreground">{deleteEntry?.location_name}</span> on{' '}
              <span className="font-medium text-foreground">{deleteEntry ? formatDate(deleteEntry.date) : ''}</span>?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteEntry(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteEntry) {
                  onDelete(deleteEntry.id)
                  setDeleteEntry(null)
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
