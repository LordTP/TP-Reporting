/**
 * Location Manager Component
 * Toggle which Square locations to sync
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { squareApi } from '../api/squareApi'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { RefreshCw, MapPin } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface LocationManagerProps {
  accountId: string
  onClose: () => void
}

export default function LocationManager({ accountId, onClose }: LocationManagerProps) {
  const queryClient = useQueryClient()

  // Fetch locations
  const { data: locationsData, isLoading, error } = useQuery({
    queryKey: ['square-locations', accountId],
    queryFn: () => squareApi.listLocations(accountId),
  })

  // Update location mutation
  const updateLocationMutation = useMutation({
    mutationFn: ({ locationId, isActive }: { locationId: string; isActive: boolean }) =>
      squareApi.updateLocation(locationId, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['square-locations', accountId] })
    },
  })

  const handleToggleLocation = (locationId: string, currentStatus: boolean) => {
    updateLocationMutation.mutate({
      locationId,
      isActive: !currentStatus,
    })
  }

  const locations = locationsData?.locations || []
  const activeCount = locations.filter((loc) => loc.is_active).length

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Locations</DialogTitle>
          <DialogDescription>
            Toggle which locations you want to sync data from. Only active locations will be
            included in data synchronization.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertDescription>
              Failed to load locations. Please try again later.
            </AlertDescription>
          </Alert>
        ) : locations.length === 0 ? (
          <div className="text-center py-12">
            <MapPin className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No locations found for this account.</p>
          </div>
        ) : (
          <>
            <div className="mb-4 p-4 bg-muted rounded-lg">
              <p className="text-sm">
                <strong>{activeCount}</strong> of <strong>{locations.length}</strong> locations
                active
              </p>
            </div>

            <div className="space-y-4">
              {locations.map((location) => (
                <div
                  key={location.id}
                  className="flex items-start justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold">{location.name}</h4>
                      <Badge variant="outline">{location.currency}</Badge>
                    </div>
                    {location.address && (
                      <p className="text-sm text-muted-foreground">
                        {[
                          location.address.address_line_1,
                          location.address.locality,
                          location.address.administrative_district_level_1,
                          location.address.postal_code,
                        ]
                          .filter(Boolean)
                          .join(', ')}
                      </p>
                    )}
                    {location.timezone && (
                      <p className="text-xs text-muted-foreground">Timezone: {location.timezone}</p>
                    )}
                  </div>

                  <div className="flex items-center space-x-2 ml-4">
                    <Label htmlFor={`location-${location.id}`} className="cursor-pointer text-sm">
                      {location.is_active ? 'Active' : 'Inactive'}
                    </Label>
                    <Switch
                      id={`location-${location.id}`}
                      checked={location.is_active}
                      onCheckedChange={() => handleToggleLocation(location.id, location.is_active)}
                      disabled={updateLocationMutation.isPending}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-4 border-t">
              <Button onClick={onClose}>Done</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
