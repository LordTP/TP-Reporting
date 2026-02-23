import { useAuthStore } from '@/store/authStore'
import AppNav from '@/components/layout/AppNav'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { useState } from 'react'
import ClientCategoryKeywords from '@/features/clients/ClientCategoryKeywords'
import RolePermissionMatrix from '@/features/permissions/RolePermissionMatrix'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'

export const DashboardPage = () => {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'
  const queryClient = useQueryClient()

  // Client management state
  const [showClientForm, setShowClientForm] = useState(false)
  const [editingClient, setEditingClient] = useState<any>(null)
  const [clientName, setClientName] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [selectedLocations, setSelectedLocations] = useState<string[]>([])
  const [showLocationAssignment, setShowLocationAssignment] = useState<string | null>(null)
  const [showKeywordsFor, setShowKeywordsFor] = useState<any>(null)

  // Exchange rate state
  const [showRateForm, setShowRateForm] = useState(false)
  const [editingRate, setEditingRate] = useState<any>(null)
  const [rateCurrency, setRateCurrency] = useState('')
  const [rateValue, setRateValue] = useState('')

  // Location group state
  const [showGroupForm, setShowGroupForm] = useState(false)
  const [editingGroup, setEditingGroup] = useState<any>(null)
  const [groupName, setGroupName] = useState('')
  const [selectedGroupLocations, setSelectedGroupLocations] = useState<string[]>([])

  // Client group state
  const [showClientGroupForm, setShowClientGroupForm] = useState(false)
  const [editingClientGroup, setEditingClientGroup] = useState<any>(null)
  const [clientGroupName, setClientGroupName] = useState('')
  const [selectedGroupClients, setSelectedGroupClients] = useState<string[]>([])

  // User management state
  const [showUserForm, setShowUserForm] = useState(false)
  const [editingUser, setEditingUser] = useState<any>(null)
  const [userFormError, setUserFormError] = useState('')
  const [userForm, setUserForm] = useState({
    email: '', full_name: '', password: '', role: 'client', client_id: null as string | null, client_ids: [] as string[],
  })
  const [deactivatingUser, setDeactivatingUser] = useState<any>(null)
  const [deletingUser, setDeletingUser] = useState<any>(null)
  const [resetPasswordUser, setResetPasswordUser] = useState<any>(null)
  const [newPassword, setNewPassword] = useState('')
  const [resetPasswordError, setResetPasswordError] = useState('')

  // Fetch real counts
  const { data: accountsData } = useQuery({
    queryKey: ['dashboard-square-accounts'],
    queryFn: async () => apiClient.get('/square/accounts'),
    enabled: isAdmin,
  })

  const { data: locationsData } = useQuery({
    queryKey: ['dashboard-locations-count'],
    queryFn: async () => {
      // Get all locations across all accounts
      if (accountsData?.accounts && accountsData.accounts.length > 0) {
        const allLocations = await Promise.all(
          accountsData.accounts.map((account: any) =>
            apiClient.get(`/square/accounts/${account.id}/locations`)
          )
        )
        const totalLocations = allLocations.reduce((sum, data) => sum + (data.total || 0), 0)
        return { total: totalLocations }
      }
      return { total: 0 }
    },
    enabled: !!accountsData?.accounts && accountsData.accounts.length > 0,
  })

  const { data: salesData } = useQuery({
    queryKey: ['dashboard-sales-count'],
    queryFn: async () => apiClient.get('/sales/transactions?page_size=1'),
  })


  // Fetch clients
  const { data: clientsData, isLoading: clientsLoading } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => apiClient.get('/clients'),
    enabled: isAdmin,
  })

  // Fetch all locations for client assignment
  const { data: allLocationsData } = useQuery({
    queryKey: ['all-locations'],
    queryFn: async () => {
      if (accountsData?.accounts && accountsData.accounts.length > 0) {
        const allLocationsPromises = accountsData.accounts.map((account: any) =>
          apiClient.get(`/square/accounts/${account.id}/locations`)
        )
        const results = await Promise.all(allLocationsPromises)
        const locations = results.flatMap(result => result.locations || [])
        return locations
      }
      return []
    },
    enabled: isAdmin && !!accountsData?.accounts,
  })

  // Create client mutation
  const createClientMutation = useMutation({
    mutationFn: async (data: { name: string; email: string }) =>
      apiClient.post('/clients', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      setShowClientForm(false)
      setClientName('')
      setClientEmail('')
    },
  })

  // Update client mutation
  const updateClientMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) =>
      apiClient.patch(`/clients/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      setEditingClient(null)
      setClientName('')
      setClientEmail('')
    },
  })

  // Delete client mutation
  const deleteClientMutation = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/clients/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
    },
  })

  // Assign locations mutation
  const assignLocationsMutation = useMutation({
    mutationFn: async ({ clientId, locationIds }: { clientId: string; locationIds: string[] }) =>
      apiClient.post(`/clients/${clientId}/locations`, { location_ids: locationIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      queryClient.invalidateQueries({ queryKey: ['client-locations'] })
      setShowLocationAssignment(null)
      setSelectedLocations([])
    },
  })

  // User queries & mutations
  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => apiClient.get('/users'),
    enabled: isAdmin,
  })

  const createUserMutation = useMutation({
    mutationFn: (data: any) => apiClient.post('/users', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setShowUserForm(false)
      setUserForm({ email: '', full_name: '', password: '', role: 'client', client_id: null, client_ids: [] })
      setUserFormError('')
    },
    onError: (err: any) => {
      setUserFormError(err?.response?.data?.detail || err?.message || 'Failed to create user')
    },
  })

  const updateUserMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiClient.put(`/users/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setEditingUser(null)
      setShowUserForm(false)
      setUserForm({ email: '', full_name: '', password: '', role: 'client', client_id: null, client_ids: [] })
      setUserFormError('')
    },
    onError: (err: any) => {
      setUserFormError(err?.response?.data?.detail || err?.message || 'Failed to update user')
    },
  })

  const deactivateUserMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setDeactivatingUser(null)
    },
  })

  const reactivateUserMutation = useMutation({
    mutationFn: (id: string) => apiClient.put(`/users/${id}`, { is_active: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  })

  const deleteUserMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setDeletingUser(null)
    },
  })

  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      apiClient.post(`/users/${id}/reset-password`, { password }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setResetPasswordUser(null)
      setNewPassword('')
      setResetPasswordError('')
    },
    onError: (err: any) => {
      setResetPasswordError(err?.response?.data?.detail || 'Failed to reset password')
    },
  })

  // Exchange rate queries & mutations
  const { data: ratesData, isLoading: ratesLoading } = useQuery({
    queryKey: ['exchange-rates'],
    queryFn: () => apiClient.get('/exchange-rates'),
    enabled: isAdmin,
  })

  const createRateMutation = useMutation({
    mutationFn: (data: { from_currency: string; rate: number }) =>
      apiClient.post('/exchange-rates', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exchange-rates'] })
      setShowRateForm(false)
      setRateCurrency('')
      setRateValue('')
    },
  })

  const updateRateMutation = useMutation({
    mutationFn: ({ id, rate }: { id: string; rate: number }) =>
      apiClient.put(`/exchange-rates/${id}`, { rate }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exchange-rates'] })
      setEditingRate(null)
      setRateValue('')
    },
  })

  const deleteRateMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/exchange-rates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exchange-rates'] })
    },
  })

  // Location group queries & mutations
  const { data: groupsData, isLoading: groupsLoading } = useQuery({
    queryKey: ['location-groups'],
    queryFn: () => apiClient.get('/location-groups'),
    enabled: isAdmin,
  })

  const createGroupMutation = useMutation({
    mutationFn: (data: { name: string; location_ids: string[] }) =>
      apiClient.post('/location-groups', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['location-groups'] })
      setShowGroupForm(false)
      setEditingGroup(null)
      setGroupName('')
      setSelectedGroupLocations([])
    },
  })

  const updateGroupMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      apiClient.patch(`/location-groups/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['location-groups'] })
      setShowGroupForm(false)
      setEditingGroup(null)
      setGroupName('')
      setSelectedGroupLocations([])
    },
  })

  const deleteGroupMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/location-groups/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['location-groups'] })
    },
  })

  // Client group queries & mutations
  const { data: clientGroupsData, isLoading: clientGroupsLoading } = useQuery({
    queryKey: ['client-groups'],
    queryFn: () => apiClient.get('/client-groups'),
    enabled: isAdmin,
  })

  const createClientGroupMutation = useMutation({
    mutationFn: (data: { name: string; client_ids: string[] }) =>
      apiClient.post('/client-groups', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-groups'] })
      setShowClientGroupForm(false)
      setEditingClientGroup(null)
      setClientGroupName('')
      setSelectedGroupClients([])
    },
  })

  const updateClientGroupMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      apiClient.patch(`/client-groups/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-groups'] })
      setShowClientGroupForm(false)
      setEditingClientGroup(null)
      setClientGroupName('')
      setSelectedGroupClients([])
    },
  })

  const deleteClientGroupMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/client-groups/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-groups'] })
    },
  })

  function timeAgo(dateStr: string | null | undefined): string {
    if (!dateStr) return 'Never'
    const now = Date.now()
    const then = new Date(dateStr).getTime()
    const seconds = Math.floor((now - then) / 1000)
    if (seconds < 60) return 'Just now'
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 30) return `${days}d ago`
    const months = Math.floor(days / 30)
    return `${months}mo ago`
  }

  const ROLE_OPTIONS = [
    { value: 'superadmin', label: 'Super Admin' },
    { value: 'admin', label: 'Admin' },
    { value: 'manager', label: 'Manager' },
    { value: 'store_manager', label: 'Store Manager' },
    { value: 'reporting', label: 'Reporting' },
    { value: 'client', label: 'Client' },
  ]

  const MULTI_CLIENT_ROLES = ['store_manager', 'reporting', 'manager']

  const ROLE_BADGE_STYLES: Record<string, string> = {
    superadmin: 'bg-red-100 text-red-700',
    admin: 'bg-blue-100 text-blue-700',
    store_manager: 'bg-green-100 text-green-700',
    manager: 'bg-green-100 text-green-700',
    reporting: 'bg-purple-100 text-purple-700',
    client: 'bg-amber-100 text-amber-700',
  }

  const accountCount = accountsData?.total || 0
  const locationCount = locationsData?.total || 0
  const salesCount = salesData?.total || 0

  const handleCreateClient = () => {
    if (clientName.trim()) {
      createClientMutation.mutate({ name: clientName, email: clientEmail })
    }
  }

  const handleUpdateClient = () => {
    if (editingClient && clientName.trim()) {
      updateClientMutation.mutate({
        id: editingClient.id,
        data: { name: clientName, email: clientEmail },
      })
    }
  }

  const handleDeleteClient = (id: string) => {
    if (confirm('Are you sure you want to delete this client?')) {
      deleteClientMutation.mutate(id)
    }
  }

  const handleAssignLocations = (clientId: string) => {
    assignLocationsMutation.mutate({ clientId, locationIds: selectedLocations })
  }

  const openEditClient = (client: any) => {
    setEditingClient(client)
    setClientName(client.name)
    setClientEmail(client.email || '')
    setShowClientForm(true)
  }

  const closeClientForm = () => {
    setShowClientForm(false)
    setEditingClient(null)
    setClientName('')
    setClientEmail('')
  }

  return (
    <div className="min-h-screen bg-background relative">
      <AppNav />

      <main className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="rounded-xl border border-border p-8 mb-8 bg-card shadow-sm dark:bg-brand-shade-blue/60 dark:backdrop-blur-md dark:border-brand-core-blue/20">
          <h2 className="text-2xl font-light tracking-brand-heading uppercase text-foreground mb-2">
            Admin Panel
          </h2>
          <p className="text-sm text-muted-foreground">
            Manage your organization settings, Square accounts, and client assignments.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-card rounded-xl border border-border/50 p-6 shadow-sm hover:shadow-md transition-all duration-300 dark:bg-brand-shade-blue/70 dark:backdrop-blur-md dark:border-brand-core-blue/30 dark:hover:border-brand-core-orange/40 dark:hover:shadow-glow-orange-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium tracking-brand-sub uppercase text-foreground dark:text-brand-glow-blue">Square Accounts</h3>
              <div className="h-10 w-10 bg-blue-500/10 rounded-lg flex items-center justify-center dark:bg-brand-core-blue/20">
                <span className="text-2xl">🔗</span>
              </div>
            </div>
            <p className="text-3xl font-bold text-primary mb-1">{accountCount}</p>
            <p className="text-xs text-muted-foreground">Connected accounts</p>
          </div>
          <div className="bg-card rounded-xl border border-border/50 p-6 shadow-sm hover:shadow-md transition-all duration-300 dark:bg-brand-shade-blue/70 dark:backdrop-blur-md dark:border-brand-core-blue/30 dark:hover:border-brand-core-orange/40 dark:hover:shadow-glow-orange-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium tracking-brand-sub uppercase text-foreground dark:text-brand-glow-blue">Locations</h3>
              <div className="h-10 w-10 bg-green-500/10 rounded-lg flex items-center justify-center dark:bg-brand-core-blue/20">
                <span className="text-2xl">📍</span>
              </div>
            </div>
            <p className="text-3xl font-bold text-primary mb-1">{locationCount}</p>
            <p className="text-xs text-muted-foreground">Active locations</p>
          </div>
          <div className="bg-card rounded-xl border border-border/50 p-6 shadow-sm hover:shadow-md transition-all duration-300 dark:bg-brand-shade-blue/70 dark:backdrop-blur-md dark:border-brand-core-blue/30 dark:hover:border-brand-core-orange/40 dark:hover:shadow-glow-orange-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium tracking-brand-sub uppercase text-foreground dark:text-brand-glow-blue">Transactions</h3>
              <div className="h-10 w-10 bg-purple-500/10 rounded-lg flex items-center justify-center dark:bg-brand-core-blue/20">
                <span className="text-2xl">💳</span>
              </div>
            </div>
            <p className="text-3xl font-bold text-primary mb-1">{salesCount}</p>
            <p className="text-xs text-muted-foreground">Sales transactions</p>
          </div>
        </div>

        {isAdmin && (
          <Tabs defaultValue="users" className="w-full">
            <TabsList className="w-full justify-start h-12 bg-muted/50 p-1 rounded-lg mb-6 overflow-x-auto">
              <TabsTrigger value="users" className="px-5 py-2 text-xs tracking-brand-sub uppercase">Users</TabsTrigger>
              <TabsTrigger value="clients" className="px-5 py-2 text-xs tracking-brand-sub uppercase">Clients</TabsTrigger>
              <TabsTrigger value="rates" className="px-5 py-2 text-xs tracking-brand-sub uppercase">Rates</TabsTrigger>
              <TabsTrigger value="groups" className="px-5 py-2 text-xs tracking-brand-sub uppercase">Location Groups</TabsTrigger>
              <TabsTrigger value="client-groups" className="px-5 py-2 text-xs tracking-brand-sub uppercase">Client Groups</TabsTrigger>
              <TabsTrigger value="permissions" className="px-5 py-2 text-xs tracking-brand-sub uppercase">Permissions</TabsTrigger>
            </TabsList>

          {/* Client Management */}
          <TabsContent value="clients">
            <div className="bg-card rounded-xl border border-border/50 p-8 shadow-sm dark:bg-brand-shade-blue/60 dark:backdrop-blur-md dark:border-brand-core-blue/20 dark:shadow-none">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-xl font-bold text-foreground mb-1">
                    Client Management
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Assign locations to clients and manage access
                  </p>
                </div>
                <button
                  onClick={() => setShowClientForm(true)}
                  className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg hover:opacity-90 text-sm font-medium shadow-md hover:shadow-lg transition-all"
                >
                  + New Client
                </button>
              </div>

              {/* Client Form */}
              {showClientForm && (
                <div className="border border-border/50 rounded-xl p-6 mb-6 bg-gradient-to-br from-muted to-muted/50">
                  <h4 className="font-semibold text-foreground mb-3">
                    {editingClient ? 'Edit Client' : 'Create New Client'}
                  </h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">
                        Client Name *
                      </label>
                      <input
                        type="text"
                        value={clientName}
                        onChange={(e) => setClientName(e.target.value)}
                        placeholder="e.g., Warner Music"
                        className="w-full px-3 py-2 border border-border rounded bg-background text-foreground"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">
                        Email (Optional)
                      </label>
                      <input
                        type="email"
                        value={clientEmail}
                        onChange={(e) => setClientEmail(e.target.value)}
                        placeholder="client@example.com"
                        className="w-full px-3 py-2 border border-border rounded bg-background text-foreground"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={editingClient ? handleUpdateClient : handleCreateClient}
                        disabled={!clientName.trim()}
                        className="px-4 py-2 bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50 text-sm"
                      >
                        {editingClient ? 'Update' : 'Create'}
                      </button>
                      <button
                        onClick={closeClientForm}
                        className="px-4 py-2 bg-secondary text-secondary-foreground rounded hover:opacity-80 text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Clients List */}
              {clientsLoading ? (
                <p className="text-muted-foreground">Loading clients...</p>
              ) : clientsData?.clients && clientsData.clients.length > 0 ? (
                <div className="border border-border/50 rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">
                          Client Name
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">
                          Email
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">
                          Locations
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">
                          Keywords
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {clientsData.clients.map((client: any) => (
                        <tr key={client.id} className="border-t border-border">
                          <td className="px-4 py-3 text-sm text-foreground">
                            {client.name}
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            {client.email || '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-foreground">
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                              {client.location_count || 0} locations
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {client.category_keywords && client.category_keywords.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {client.category_keywords.map((kw: string) => (
                                  <span key={kw} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-violet-50 text-violet-700 border border-violet-200">
                                    {kw}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">None</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <div className="flex gap-2">
                              <button
                                onClick={() => setShowKeywordsFor(client)}
                                className="px-3 py-1 text-xs bg-violet-500 text-white rounded hover:bg-violet-600"
                              >
                                Keywords
                              </button>
                              <button
                                onClick={() => {
                                  setShowLocationAssignment(client.id)
                                  // Fetch current locations for this client
                                  apiClient
                                    .get(`/clients/${client.id}/locations`)
                                    .then((data) => {
                                      setSelectedLocations(
                                        data.locations?.map((loc: any) => loc.id) || []
                                      )
                                    })
                                }}
                                className="px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                              >
                                Assign Locations
                              </button>
                              <button
                                onClick={() => openEditClient(client)}
                                className="px-3 py-1 text-xs bg-secondary text-secondary-foreground rounded hover:opacity-80"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteClient(client.id)}
                                className="px-3 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  No clients yet. Create your first client to assign locations.
                </p>
              )}

              {/* Keywords Modal */}
              {showKeywordsFor && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                  <div className="bg-card rounded-2xl p-8 max-w-lg w-full m-4 shadow-2xl border border-border/50">
                    <ClientCategoryKeywords
                      clientId={showKeywordsFor.id}
                      clientName={showKeywordsFor.name}
                      keywords={showKeywordsFor.category_keywords}
                    />
                    <div className="flex justify-end mt-6">
                      <button
                        onClick={() => setShowKeywordsFor(null)}
                        className="px-4 py-2 bg-secondary text-secondary-foreground rounded hover:opacity-80 text-sm"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Location Assignment Modal/Section */}
              {showLocationAssignment && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                  <div className="bg-card rounded-2xl p-8 max-w-2xl w-full max-h-[80vh] overflow-y-auto m-4 shadow-2xl border border-border/50">
                    <h4 className="text-lg font-semibold text-foreground mb-4">
                      Assign Locations to Client
                    </h4>
                    <p className="text-sm text-muted-foreground mb-4">
                      Select which locations this client should have access to:
                    </p>
                    <div className="space-y-2 mb-4">
                      {allLocationsData && allLocationsData.length > 0 ? (
                        allLocationsData.map((location: any) => (
                          <label
                            key={location.id}
                            className="flex items-center gap-2 p-2 hover:bg-muted rounded cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={selectedLocations.includes(location.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedLocations([...selectedLocations, location.id])
                                } else {
                                  setSelectedLocations(
                                    selectedLocations.filter((id) => id !== location.id)
                                  )
                                }
                              }}
                              className="w-4 h-4"
                            />
                            <span className="text-sm text-foreground">
                              {location.name}
                              <span className="text-xs text-muted-foreground ml-2">
                                ({location.currency})
                              </span>
                            </span>
                          </label>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No locations available. Please connect a Square account first.
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => {
                          setShowLocationAssignment(null)
                          setSelectedLocations([])
                        }}
                        className="px-4 py-2 bg-secondary text-secondary-foreground rounded hover:opacity-80 text-sm"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleAssignLocations(showLocationAssignment)}
                        className="px-4 py-2 bg-primary text-primary-foreground rounded hover:opacity-90 text-sm"
                      >
                        Save Assignments
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          {/* User Management */}
          <TabsContent value="users">
          <div className="bg-card rounded-xl border border-border/50 p-8 shadow-sm dark:bg-brand-shade-blue/60 dark:backdrop-blur-md dark:border-brand-core-blue/20 dark:shadow-none">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-bold text-foreground mb-1">User Management</h3>
                <p className="text-sm text-muted-foreground">
                  Manage users, roles, and client access permissions
                </p>
              </div>
              <button
                onClick={() => {
                  setShowUserForm(true)
                  setEditingUser(null)
                  setUserForm({ email: '', full_name: '', password: '', role: 'client', client_id: null, client_ids: [] })
                  setUserFormError('')
                }}
                className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg hover:opacity-90 text-sm font-medium shadow-md hover:shadow-lg transition-all"
              >
                + Add User
              </button>
            </div>

            {/* Users List */}
            {usersLoading ? (
              <p className="text-muted-foreground">Loading users...</p>
            ) : usersData?.users && usersData.users.length > 0 ? (
              <div className="border border-border/50 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Name</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Email</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Role</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Linked Client</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Last Login</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Status</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usersData.users.map((u: any) => (
                      <tr key={u.id} className={`border-t border-border transition-colors ${u.is_active ? 'hover:bg-muted/20' : 'opacity-50'}`}>
                        <td className="px-4 py-3 text-sm font-medium text-foreground">{u.full_name}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{u.email}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_BADGE_STYLES[u.role] || 'bg-gray-100 text-gray-700'}`}>
                            {u.role.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {u.client_names && u.client_names.length > 0
                            ? u.client_names.join(', ')
                            : u.client_name || (u.client_id ? u.client_id : '—')}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground" title={u.last_login ? new Date(u.last_login).toLocaleString() : ''}>
                          {timeAgo(u.last_login)}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${u.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                            {u.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setEditingUser(u)
                                setShowUserForm(true)
                                setUserForm({
                                  email: u.email,
                                  full_name: u.full_name,
                                  password: '',
                                  role: u.role,
                                  client_id: u.client_id || null,
                                  client_ids: u.client_ids || [],
                                })
                                setUserFormError('')
                              }}
                              className="px-3 py-1 text-xs bg-secondary text-secondary-foreground rounded hover:opacity-80"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => { setResetPasswordUser(u); setNewPassword(''); setResetPasswordError('') }}
                              className="px-3 py-1 text-xs bg-amber-500 text-white rounded hover:bg-amber-600"
                            >
                              Reset PW
                            </button>
                            {u.is_active && u.id !== String(user?.id) && (
                              <button
                                onClick={() => setDeactivatingUser(u)}
                                className="px-3 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                              >
                                Deactivate
                              </button>
                            )}
                            {!u.is_active && (
                              <button
                                onClick={() => reactivateUserMutation.mutate(u.id)}
                                className="px-3 py-1 text-xs bg-emerald-500 text-white rounded hover:bg-emerald-600"
                              >
                                Reactivate
                              </button>
                            )}
                            {u.id !== String(user?.id) && (
                              <button
                                onClick={() => setDeletingUser(u)}
                                className="px-3 py-1 text-xs bg-red-700 text-white rounded hover:bg-red-800"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No users found.</p>
            )}

            {/* User Form Modal */}
            {showUserForm && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                <div className="bg-card rounded-2xl p-8 max-w-md w-full m-4 shadow-2xl border border-border/50">
                  <h4 className="text-lg font-semibold text-foreground mb-4">
                    {editingUser ? 'Edit User' : 'Add User'}
                  </h4>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">Full Name</label>
                      <input
                        type="text"
                        value={userForm.full_name}
                        onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })}
                        className="w-full h-10 px-3 text-sm rounded-md border border-input bg-background text-foreground"
                        placeholder="John Doe"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">Email</label>
                      <input
                        type="email"
                        value={userForm.email}
                        onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                        className="w-full h-10 px-3 text-sm rounded-md border border-input bg-background text-foreground"
                        placeholder="user@example.com"
                      />
                    </div>
                    {!editingUser && (
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1">Password</label>
                        <input
                          type="password"
                          value={userForm.password}
                          onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                          className="w-full h-10 px-3 text-sm rounded-md border border-input bg-background text-foreground"
                          placeholder="Minimum 8 characters"
                        />
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">Role</label>
                      <Select value={userForm.role} onValueChange={(value) => {
                        setUserForm({
                          ...userForm,
                          role: value,
                          client_id: value === 'client' ? userForm.client_id : null,
                          client_ids: MULTI_CLIENT_ROLES.includes(value) ? (userForm.client_ids || []) : [],
                        })
                      }}>
                        <SelectTrigger className="w-full h-10 text-sm">
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {userForm.role === 'client' && (
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1">
                          Linked Client <span className="text-red-500">*</span>
                        </label>
                        <Select
                          value={userForm.client_id || 'none'}
                          onValueChange={(value) => setUserForm({ ...userForm, client_id: value === 'none' ? null : value })}
                        >
                          <SelectTrigger className="w-full h-10 text-sm">
                            <SelectValue placeholder="Select client" />
                          </SelectTrigger>
                          <SelectContent>
                            {clientsData?.clients?.map((c: any) => (
                              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground mt-1">
                          Required. This user will only see this client's data.
                        </p>
                      </div>
                    )}
                    {MULTI_CLIENT_ROLES.includes(userForm.role) && (
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1">
                          Assigned Clients
                        </label>
                        <div className="border border-input rounded-md p-2 max-h-40 overflow-y-auto space-y-1 bg-background">
                          {clientsData?.clients?.map((c: any) => (
                            <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/30 px-1 py-0.5 rounded">
                              <input
                                type="checkbox"
                                checked={(userForm.client_ids || []).includes(c.id)}
                                onChange={(e) => {
                                  const ids = userForm.client_ids || []
                                  if (e.target.checked) {
                                    setUserForm({ ...userForm, client_ids: [...ids, c.id] })
                                  } else {
                                    setUserForm({ ...userForm, client_ids: ids.filter((id: string) => id !== c.id) })
                                  }
                                }}
                                className="rounded border-input"
                              />
                              <span className="text-foreground">{c.name}</span>
                            </label>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Select one or more clients this user can access.
                        </p>
                      </div>
                    )}
                    {userFormError && (
                      <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                        {userFormError}
                      </p>
                    )}
                    <div className="flex gap-2 justify-end pt-2">
                      <button
                        onClick={() => {
                          setShowUserForm(false)
                          setEditingUser(null)
                          setUserFormError('')
                        }}
                        className="px-4 py-2 bg-secondary text-secondary-foreground rounded hover:opacity-80 text-sm"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          setUserFormError('')
                          if (editingUser) {
                            const payload: any = {
                              full_name: userForm.full_name,
                              role: userForm.role,
                            }
                            if (userForm.role === 'client') {
                              payload.client_id = userForm.client_id
                            } else if (MULTI_CLIENT_ROLES.includes(userForm.role)) {
                              payload.client_ids = userForm.client_ids
                            } else {
                              payload.client_id = null
                            }
                            if (userForm.email !== editingUser.email) payload.email = userForm.email
                            updateUserMutation.mutate({ id: editingUser.id, data: payload })
                          } else {
                            const payload: any = {
                              email: userForm.email,
                              full_name: userForm.full_name,
                              password: userForm.password,
                              role: userForm.role,
                            }
                            if (userForm.role === 'client' && userForm.client_id) {
                              payload.client_id = userForm.client_id
                            } else if (MULTI_CLIENT_ROLES.includes(userForm.role) && userForm.client_ids.length > 0) {
                              payload.client_ids = userForm.client_ids
                            }
                            createUserMutation.mutate(payload)
                          }
                        }}
                        disabled={createUserMutation.isPending || updateUserMutation.isPending}
                        className="px-4 py-2 bg-primary text-primary-foreground rounded hover:opacity-90 text-sm disabled:opacity-50"
                      >
                        {(createUserMutation.isPending || updateUserMutation.isPending) ? 'Saving...' : (editingUser ? 'Save Changes' : 'Create User')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Deactivate Confirmation Dialog */}
            <Dialog open={!!deactivatingUser} onOpenChange={(open) => !open && setDeactivatingUser(null)}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Deactivate User</DialogTitle>
                  <DialogDescription>
                    Are you sure you want to deactivate <span className="font-semibold text-foreground">{deactivatingUser?.full_name}</span>? They will no longer be able to log in.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-2 sm:gap-0">
                  <button
                    onClick={() => setDeactivatingUser(null)}
                    className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:opacity-80 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => deactivatingUser && deactivateUserMutation.mutate(deactivatingUser.id)}
                    disabled={deactivateUserMutation.isPending}
                    className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 text-sm disabled:opacity-50"
                  >
                    {deactivateUserMutation.isPending ? 'Deactivating...' : 'Deactivate'}
                  </button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog open={!!deletingUser} onOpenChange={(open) => !open && setDeletingUser(null)}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Delete User Permanently</DialogTitle>
                  <DialogDescription>
                    Are you sure you want to permanently delete <span className="font-semibold text-foreground">{deletingUser?.full_name}</span> ({deletingUser?.email})? This cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-2 sm:gap-0">
                  <button
                    onClick={() => setDeletingUser(null)}
                    className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:opacity-80 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => deletingUser && deleteUserMutation.mutate(deletingUser.id)}
                    disabled={deleteUserMutation.isPending}
                    className="px-4 py-2 bg-red-700 text-white rounded-md hover:bg-red-800 text-sm disabled:opacity-50"
                  >
                    {deleteUserMutation.isPending ? 'Deleting...' : 'Delete Permanently'}
                  </button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Reset Password Dialog */}
            <Dialog open={!!resetPasswordUser} onOpenChange={(open) => { if (!open) { setResetPasswordUser(null); setNewPassword(''); setResetPasswordError('') } }}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Reset Password</DialogTitle>
                  <DialogDescription>
                    Set a new password for <span className="font-semibold text-foreground">{resetPasswordUser?.full_name}</span> ({resetPasswordUser?.email}).
                  </DialogDescription>
                </DialogHeader>
                <div className="py-2">
                  <input
                    type="text"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password (min 6 characters)"
                    className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background"
                  />
                  {resetPasswordError && <p className="text-xs text-red-500 mt-1">{resetPasswordError}</p>}
                </div>
                <DialogFooter className="gap-2 sm:gap-0">
                  <button
                    onClick={() => { setResetPasswordUser(null); setNewPassword(''); setResetPasswordError('') }}
                    className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:opacity-80 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => resetPasswordUser && newPassword.length >= 6 && resetPasswordMutation.mutate({ id: resetPasswordUser.id, password: newPassword })}
                    disabled={resetPasswordMutation.isPending || newPassword.length < 6}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 text-sm disabled:opacity-50"
                  >
                    {resetPasswordMutation.isPending ? 'Resetting...' : 'Reset Password'}
                  </button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          </TabsContent>

          {/* Exchange Rates */}
          <TabsContent value="rates">
          <div className="bg-card rounded-xl border border-border/50 p-8 shadow-sm dark:bg-brand-shade-blue/60 dark:backdrop-blur-md dark:border-brand-core-blue/20 dark:shadow-none">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-bold text-foreground mb-1">
                  Exchange Rates
                </h3>
                <p className="text-sm text-muted-foreground">
                  Set conversion rates to GBP for multi-currency reporting
                </p>
              </div>
              <button
                onClick={() => {
                  setShowRateForm(true)
                  setEditingRate(null)
                  setRateCurrency('')
                  setRateValue('')
                }}
                className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg hover:opacity-90 text-sm font-medium shadow-md hover:shadow-lg transition-all"
              >
                + Add Rate
              </button>
            </div>

            {/* Add/Edit Rate Form */}
            {(showRateForm || editingRate) && (
              <div className="border border-border/50 rounded-xl p-6 mb-6 bg-gradient-to-br from-muted to-muted/50">
                <h4 className="font-semibold text-foreground mb-3">
                  {editingRate ? `Edit ${editingRate.from_currency} Rate` : 'Add Exchange Rate'}
                </h4>
                <div className="flex gap-4 items-end">
                  {!editingRate && (
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-foreground mb-1">
                        Currency Code
                      </label>
                      <input
                        type="text"
                        value={rateCurrency}
                        onChange={(e) => setRateCurrency(e.target.value.toUpperCase())}
                        placeholder="e.g. EUR, USD, AUD"
                        maxLength={3}
                        className="w-full px-3 py-2 border border-border rounded bg-background text-foreground uppercase"
                      />
                    </div>
                  )}
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Rate to GBP
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">1 {editingRate?.from_currency || rateCurrency || '???'} =</span>
                      <input
                        type="number"
                        step="0.0001"
                        value={rateValue}
                        onChange={(e) => setRateValue(e.target.value)}
                        placeholder="0.85"
                        className="w-32 px-3 py-2 border border-border rounded bg-background text-foreground"
                      />
                      <span className="text-sm text-muted-foreground">GBP</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        if (editingRate) {
                          updateRateMutation.mutate({ id: editingRate.id, rate: parseFloat(rateValue) })
                        } else {
                          createRateMutation.mutate({ from_currency: rateCurrency.trim(), rate: parseFloat(rateValue) })
                        }
                      }}
                      disabled={(!editingRate && !rateCurrency.trim()) || !rateValue || createRateMutation.isPending || updateRateMutation.isPending}
                      className="px-4 py-2 bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50 text-sm"
                    >
                      {editingRate ? 'Update' : 'Add'}
                    </button>
                    <button
                      onClick={() => {
                        setShowRateForm(false)
                        setEditingRate(null)
                        setRateCurrency('')
                        setRateValue('')
                      }}
                      className="px-4 py-2 bg-secondary text-secondary-foreground rounded hover:opacity-80 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Rates Table */}
            {ratesLoading ? (
              <p className="text-muted-foreground">Loading rates...</p>
            ) : ratesData?.rates && ratesData.rates.length > 0 ? (
              <div className="border border-border/50 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Currency</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Rate to GBP</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Last Updated</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Updated By</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ratesData.rates.map((rate: any) => (
                      <tr key={rate.id} className="border-t border-border hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 text-sm font-medium text-foreground">
                          {rate.from_currency}
                        </td>
                        <td className="px-4 py-3 text-sm text-foreground">
                          1 {rate.from_currency} = <span className="font-mono font-medium">{rate.rate}</span> GBP
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {new Date(rate.updated_at).toLocaleDateString('en-GB', {
                            day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                          })}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {rate.updated_by_name || '—'}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setEditingRate(rate)
                                setRateValue(String(rate.rate))
                                setShowRateForm(false)
                              }}
                              className="px-3 py-1 text-xs bg-secondary text-secondary-foreground rounded hover:opacity-80"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => {
                                if (confirm(`Delete ${rate.from_currency} exchange rate?`)) {
                                  deleteRateMutation.mutate(rate.id)
                                }
                              }}
                              className="px-3 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                No exchange rates configured. Add rates for multi-currency conversion (e.g. EUR, USD).
              </p>
            )}
          </div>
          </TabsContent>

          {/* Location Groups */}
          <TabsContent value="groups">
          <div className="bg-card rounded-xl border border-border/50 p-8 shadow-sm dark:bg-brand-shade-blue/60 dark:backdrop-blur-md dark:border-brand-core-blue/20 dark:shadow-none">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-bold text-foreground mb-1">
                  Location Groups
                </h3>
                <p className="text-sm text-muted-foreground">
                  Group locations together for aggregated analytics views
                </p>
              </div>
              <button
                onClick={() => {
                  setShowGroupForm(true)
                  setEditingGroup(null)
                  setGroupName('')
                  setSelectedGroupLocations([])
                }}
                className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg hover:opacity-90 text-sm font-medium shadow-md hover:shadow-lg transition-all"
              >
                + New Group
              </button>
            </div>

            {/* Add/Edit Group Form */}
            {showGroupForm && (
              <div className="border border-border/50 rounded-xl p-6 mb-6 bg-gradient-to-br from-muted to-muted/50">
                <h4 className="font-semibold text-foreground mb-3">
                  {editingGroup ? 'Edit Location Group' : 'Create Location Group'}
                </h4>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Group Name *
                    </label>
                    <input
                      type="text"
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                      className="w-full max-w-md px-3 py-2 border border-border rounded bg-background text-foreground"
                      placeholder="e.g. London, Dublin"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Locations
                    </label>
                    <div className="border border-border rounded-lg p-3 bg-background max-h-52 overflow-y-auto">
                      {allLocationsData && allLocationsData.length > 0 ? (
                        allLocationsData.map((loc: any) => (
                          <label key={loc.id} className="flex items-center gap-2 py-1.5 px-2 hover:bg-muted/50 rounded cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedGroupLocations.includes(loc.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedGroupLocations([...selectedGroupLocations, loc.id])
                                } else {
                                  setSelectedGroupLocations(selectedGroupLocations.filter(id => id !== loc.id))
                                }
                              }}
                              className="rounded border-border"
                            />
                            <span className="text-sm text-foreground">{loc.name}</span>
                            {loc.currency && loc.currency !== 'GBP' && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{loc.currency}</span>
                            )}
                          </label>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground py-2">No locations available</p>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {selectedGroupLocations.length} location{selectedGroupLocations.length !== 1 ? 's' : ''} selected
                    </p>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => {
                        if (editingGroup) {
                          updateGroupMutation.mutate({
                            id: editingGroup.id,
                            data: { name: groupName.trim(), location_ids: selectedGroupLocations }
                          })
                        } else {
                          createGroupMutation.mutate({
                            name: groupName.trim(),
                            location_ids: selectedGroupLocations
                          })
                        }
                      }}
                      disabled={!groupName.trim() || selectedGroupLocations.length === 0 || createGroupMutation.isPending || updateGroupMutation.isPending}
                      className="px-4 py-2 bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50 text-sm"
                    >
                      {editingGroup ? 'Update Group' : 'Create Group'}
                    </button>
                    <button
                      onClick={() => {
                        setShowGroupForm(false)
                        setEditingGroup(null)
                        setGroupName('')
                        setSelectedGroupLocations([])
                      }}
                      className="px-4 py-2 bg-secondary text-secondary-foreground rounded hover:opacity-80 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Groups List */}
            {groupsLoading ? (
              <p className="text-muted-foreground text-sm">Loading groups...</p>
            ) : groupsData?.location_groups && groupsData.location_groups.length > 0 ? (
              <div className="space-y-3">
                {groupsData.location_groups.map((group: any) => (
                  <div key={group.id} className="border border-border/50 rounded-lg p-4 bg-background/50 hover:bg-muted/20 transition-colors">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-medium text-foreground">{group.name}</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          {group.location_names && group.location_names.length > 0
                            ? group.location_names.join(', ')
                            : `${group.location_ids.length} location${group.location_ids.length !== 1 ? 's' : ''}`
                          }
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditingGroup(group)
                            setGroupName(group.name)
                            setSelectedGroupLocations(group.location_ids)
                            setShowGroupForm(true)
                          }}
                          className="px-3 py-1 text-xs bg-secondary text-secondary-foreground rounded hover:opacity-80"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Delete group "${group.name}"?`)) {
                              deleteGroupMutation.mutate(group.id)
                            }
                          }}
                          className="px-3 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                No location groups created. Group locations to see aggregated data in the Analytics page.
              </p>
            )}
          </div>
          </TabsContent>

          {/* Client Groups */}
          <TabsContent value="client-groups">
          <div className="bg-card rounded-xl border border-border/50 p-8 shadow-sm dark:bg-brand-shade-blue/60 dark:backdrop-blur-md dark:border-brand-core-blue/20 dark:shadow-none">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-bold text-foreground mb-1">
                  Client Groups
                </h3>
                <p className="text-sm text-muted-foreground">
                  Group clients together for aggregated analytics views
                </p>
              </div>
              <button
                onClick={() => {
                  setShowClientGroupForm(true)
                  setEditingClientGroup(null)
                  setClientGroupName('')
                  setSelectedGroupClients([])
                }}
                className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg hover:opacity-90 text-sm font-medium shadow-md hover:shadow-lg transition-all"
              >
                + New Group
              </button>
            </div>

            {/* Add/Edit Client Group Form */}
            {showClientGroupForm && (
              <div className="border border-border/50 rounded-xl p-6 mb-6 bg-gradient-to-br from-muted to-muted/50">
                <h4 className="font-semibold text-foreground mb-3">
                  {editingClientGroup ? 'Edit Client Group' : 'Create Client Group'}
                </h4>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Group Name *
                    </label>
                    <input
                      type="text"
                      value={clientGroupName}
                      onChange={(e) => setClientGroupName(e.target.value)}
                      className="w-full max-w-md px-3 py-2 border border-border rounded bg-background text-foreground"
                      placeholder="e.g. Music, Fashion"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Clients
                    </label>
                    <div className="border border-border rounded-lg p-3 bg-background max-h-52 overflow-y-auto">
                      {clientsData?.clients && clientsData.clients.length > 0 ? (
                        clientsData.clients.map((client: any) => (
                          <label key={client.id} className="flex items-center gap-2 py-1.5 px-2 hover:bg-muted/50 rounded cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedGroupClients.includes(client.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedGroupClients([...selectedGroupClients, client.id])
                                } else {
                                  setSelectedGroupClients(selectedGroupClients.filter(id => id !== client.id))
                                }
                              }}
                              className="rounded border-border"
                            />
                            <span className="text-sm text-foreground">{client.name}</span>
                          </label>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground py-2">No clients available</p>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {selectedGroupClients.length} client{selectedGroupClients.length !== 1 ? 's' : ''} selected
                    </p>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => {
                        if (editingClientGroup) {
                          updateClientGroupMutation.mutate({
                            id: editingClientGroup.id,
                            data: { name: clientGroupName.trim(), client_ids: selectedGroupClients }
                          })
                        } else {
                          createClientGroupMutation.mutate({
                            name: clientGroupName.trim(),
                            client_ids: selectedGroupClients
                          })
                        }
                      }}
                      disabled={!clientGroupName.trim() || selectedGroupClients.length === 0 || createClientGroupMutation.isPending || updateClientGroupMutation.isPending}
                      className="px-4 py-2 bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50 text-sm"
                    >
                      {editingClientGroup ? 'Update Group' : 'Create Group'}
                    </button>
                    <button
                      onClick={() => {
                        setShowClientGroupForm(false)
                        setEditingClientGroup(null)
                        setClientGroupName('')
                        setSelectedGroupClients([])
                      }}
                      className="px-4 py-2 bg-secondary text-secondary-foreground rounded hover:opacity-80 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Client Groups List */}
            {clientGroupsLoading ? (
              <p className="text-muted-foreground text-sm">Loading groups...</p>
            ) : clientGroupsData?.client_groups && clientGroupsData.client_groups.length > 0 ? (
              <div className="space-y-3">
                {clientGroupsData.client_groups.map((group: any) => (
                  <div key={group.id} className="border border-border/50 rounded-lg p-4 bg-background/50 hover:bg-muted/20 transition-colors">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-medium text-foreground">{group.name}</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          {group.client_names && group.client_names.length > 0
                            ? group.client_names.join(', ')
                            : `${group.client_ids.length} client${group.client_ids.length !== 1 ? 's' : ''}`
                          }
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditingClientGroup(group)
                            setClientGroupName(group.name)
                            setSelectedGroupClients(group.client_ids)
                            setShowClientGroupForm(true)
                          }}
                          className="px-3 py-1 text-xs bg-secondary text-secondary-foreground rounded hover:opacity-80"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Delete group "${group.name}"?`)) {
                              deleteClientGroupMutation.mutate(group.id)
                            }
                          }}
                          className="px-3 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                No client groups created. Group clients to see aggregated data across multiple clients.
              </p>
            )}
          </div>
          </TabsContent>

          {/* Role Permissions */}
          <TabsContent value="permissions">
          <div className="bg-card rounded-xl border border-border/50 p-8 shadow-sm dark:bg-brand-shade-blue/60 dark:backdrop-blur-md dark:border-brand-core-blue/20 dark:shadow-none">
            <RolePermissionMatrix />
          </div>
          </TabsContent>

          </Tabs>
        )}
      </main>
    </div>
  )
}
