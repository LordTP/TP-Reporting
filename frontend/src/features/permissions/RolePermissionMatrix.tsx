import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

interface PermissionKeyInfo {
  key: string
  label: string
  category: string
}

interface PermissionMatrixResponse {
  permissions: PermissionKeyInfo[]
  matrix: Record<string, Record<string, boolean>>
}

const ROLE_LABELS: Record<string, string> = {
  manager: 'Manager',
  store_manager: 'Store Manager',
  reporting: 'Reporting',
  client: 'Client',
}

const CATEGORY_LABELS: Record<string, string> = {
  pages: 'Pages',
  reports: 'Reports',
  features: 'Features',
}

export default function RolePermissionMatrix() {
  const queryClient = useQueryClient()
  const [localMatrix, setLocalMatrix] = useState<Record<string, Record<string, boolean>> | null>(null)
  const [dirty, setDirty] = useState(false)

  const { data, isLoading, error } = useQuery<PermissionMatrixResponse>({
    queryKey: ['permission-matrix'],
    queryFn: () => apiClient.get('/permissions/matrix'),
  })

  const saveMutation = useMutation({
    mutationFn: (matrix: Record<string, Record<string, boolean>>) =>
      apiClient.put('/permissions/matrix', { matrix }),
    onSuccess: (res: PermissionMatrixResponse) => {
      queryClient.setQueryData(['permission-matrix'], res)
      setLocalMatrix(null)
      setDirty(false)
    },
  })

  if (isLoading) return <p className="text-muted-foreground text-sm">Loading permissions...</p>
  if (error || !data) return <p className="text-red-500 text-sm">Failed to load permissions.</p>

  const matrix = localMatrix ?? data.matrix
  const roles = Object.keys(ROLE_LABELS)
  const categories = [...new Set(data.permissions.map(p => p.category))]

  const toggle = (role: string, key: string) => {
    const current = { ...matrix }
    if (!current[role]) current[role] = {}
    current[role] = { ...current[role], [key]: !current[role][key] }
    setLocalMatrix(current)
    setDirty(true)
  }

  const handleSave = () => {
    if (localMatrix) {
      saveMutation.mutate(localMatrix)
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-xl font-bold text-foreground mb-1">Role Permissions</h3>
          <p className="text-sm text-muted-foreground">
            Configure what each role can access. Admin and Superadmin always have full access.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={!dirty || saveMutation.isPending}
          className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg hover:opacity-90 text-sm font-medium shadow-md hover:shadow-lg transition-all disabled:opacity-50"
        >
          {saveMutation.isPending ? 'Saving...' : 'Save Permissions'}
        </button>
      </div>

      {saveMutation.isSuccess && !dirty && (
        <div className="mb-4 px-4 py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-sm">
          Permissions saved successfully.
        </div>
      )}

      {categories.map(cat => {
        const perms = data.permissions.filter(p => p.category === cat)
        if (perms.length === 0) return null

        return (
          <div key={cat} className="mb-6">
            <h4 className="text-sm font-semibold text-foreground mb-3 uppercase tracking-wider">
              {CATEGORY_LABELS[cat] || cat}
            </h4>
            <div className="border border-border/50 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground w-[40%]">
                      Permission
                    </th>
                    {roles.map(role => (
                      <th key={role} className="px-4 py-3 text-center text-sm font-semibold text-foreground">
                        {ROLE_LABELS[role]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {perms.map(perm => (
                    <tr key={perm.key} className="border-t border-border hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5 text-sm text-foreground">
                        {perm.label}
                      </td>
                      {roles.map(role => (
                        <td key={role} className="px-4 py-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={matrix[role]?.[perm.key] ?? false}
                            onChange={() => toggle(role, perm.key)}
                            className="w-4 h-4 rounded border-border cursor-pointer accent-primary"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}
