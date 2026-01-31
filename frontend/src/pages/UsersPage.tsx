import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import AppNav from '@/components/layout/AppNav'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { UserPlus, Users, Edit2, Trash2, Shield, X } from 'lucide-react'

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'store_manager', label: 'Store Manager' },
  { value: 'reporting', label: 'Reporting' },
  { value: 'client', label: 'Client' },
]

const ROLE_BADGES: Record<string, string> = {
  superadmin: 'bg-red-100 text-red-700 border-red-200',
  admin: 'bg-blue-100 text-blue-700 border-blue-200',
  store_manager: 'bg-green-100 text-green-700 border-green-200',
  manager: 'bg-green-100 text-green-700 border-green-200',
  reporting: 'bg-purple-100 text-purple-700 border-purple-200',
  client: 'bg-amber-100 text-amber-700 border-amber-200',
}

const CLIENT_LINKABLE_ROLES = ['client', 'store_manager', 'reporting', 'manager']
const MULTI_CLIENT_ROLES = ['store_manager', 'reporting', 'manager']

interface UserForm {
  email: string
  full_name: string
  password: string
  role: string
  client_id: string | null
  client_ids: string[]
}

const emptyForm: UserForm = {
  email: '',
  full_name: '',
  password: '',
  role: 'client',
  client_id: null,
  client_ids: [],
}

export default function UsersPage() {
  const queryClient = useQueryClient()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingUser, setEditingUser] = useState<any>(null)
  const [form, setForm] = useState<UserForm>(emptyForm)
  const [error, setError] = useState('')

  const { data: usersData, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => apiClient.get('/users'),
  })

  const { data: clientsData } = useQuery({
    queryKey: ['clients'],
    queryFn: () => apiClient.get('/clients'),
  })

  const createMutation = useMutation({
    mutationFn: (data: any) => apiClient.post('/users', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setShowCreateModal(false)
      setForm(emptyForm)
      setError('')
    },
    onError: (err: any) => {
      setError(err?.response?.data?.detail || err?.message || 'Failed to create user')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      apiClient.put(`/users/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setEditingUser(null)
      setForm(emptyForm)
      setError('')
    },
    onError: (err: any) => {
      setError(err?.response?.data?.detail || err?.message || 'Failed to update user')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })

  const handleCreate = () => {
    setError('')
    const payload: any = {
      email: form.email,
      full_name: form.full_name,
      password: form.password,
      role: form.role,
    }
    if (form.role === 'client' && form.client_id) {
      payload.client_id = form.client_id
    } else if (MULTI_CLIENT_ROLES.includes(form.role) && form.client_ids.length > 0) {
      payload.client_ids = form.client_ids
    }
    createMutation.mutate(payload)
  }

  const handleUpdate = () => {
    if (!editingUser) return
    setError('')
    const payload: any = {
      full_name: form.full_name,
      role: form.role,
    }
    if (form.role === 'client') {
      payload.client_id = form.client_id
    } else if (MULTI_CLIENT_ROLES.includes(form.role)) {
      payload.client_ids = form.client_ids
    } else {
      payload.client_id = null
    }
    if (form.email !== editingUser.email) {
      payload.email = form.email
    }
    updateMutation.mutate({ id: editingUser.id, data: payload })
  }

  const openEditModal = (user: any) => {
    setEditingUser(user)
    setForm({
      email: user.email,
      full_name: user.full_name,
      password: '',
      role: user.role,
      client_id: user.client_id || null,
      client_ids: user.client_ids || [],
    })
    setError('')
  }

  const closeModal = () => {
    setShowCreateModal(false)
    setEditingUser(null)
    setForm(emptyForm)
    setError('')
  }

  const showClientDropdown = form.role === 'client'
  const showMultiClientSelect = MULTI_CLIENT_ROLES.includes(form.role)

  const users = usersData?.users || []

  return (
    <div className="min-h-screen bg-background">
      <AppNav />

      <main className="max-w-[1400px] mx-auto px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Users className="h-6 w-6" />
              User Management
            </h2>
            <p className="text-muted-foreground mt-1">
              Manage users, roles, and client access
            </p>
          </div>
          <Button onClick={() => { setShowCreateModal(true); setForm(emptyForm); setError('') }}>
            <UserPlus className="mr-2 h-4 w-4" />
            Add User
          </Button>
        </div>

        {/* Users Table */}
        <div className="bg-card border border-border/50 rounded-xl shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/50 bg-muted/30">
                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Name</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Role</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Linked Client</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted-foreground">Loading users...</td>
                </tr>
              )}
              {!isLoading && users.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted-foreground">No users found</td>
                </tr>
              )}
              {users.map((user: any) => (
                <tr key={user.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                  <td className="py-3 px-4 text-sm font-medium text-foreground">{user.full_name}</td>
                  <td className="py-3 px-4 text-sm text-muted-foreground">{user.email}</td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${ROLE_BADGES[user.role] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                      <Shield className="h-3 w-3" />
                      {user.role.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-muted-foreground">
                    {user.client_names && user.client_names.length > 0
                      ? user.client_names.join(', ')
                      : user.client_name || (user.client_id ? user.client_id : '—')}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${user.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="sm" onClick={() => openEditModal(user)}>
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      {user.is_active && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (confirm(`Deactivate ${user.full_name}?`)) {
                              deleteMutation.mutate(user.id)
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-500" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {/* Create / Edit Modal */}
      {(showCreateModal || editingUser) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-semibold text-foreground">
                {editingUser ? 'Edit User' : 'Add User'}
              </h3>
              <button onClick={closeModal} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Full Name</label>
                <input
                  type="text"
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  className="w-full h-10 px-3 text-sm rounded-md border border-input bg-background text-foreground"
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full h-10 px-3 text-sm rounded-md border border-input bg-background text-foreground"
                  placeholder="user@example.com"
                />
              </div>

              {!editingUser && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Password</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="w-full h-10 px-3 text-sm rounded-md border border-input bg-background text-foreground"
                    placeholder="Minimum 8 characters"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Role</label>
                <Select value={form.role} onValueChange={(value) => {
                  setForm({
                    ...form,
                    role: value,
                    client_id: value === 'client' ? form.client_id : null,
                    client_ids: MULTI_CLIENT_ROLES.includes(value) ? form.client_ids : [],
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

              {showClientDropdown && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Linked Client <span className="text-red-500">*</span>
                  </label>
                  <Select
                    value={form.client_id || 'none'}
                    onValueChange={(value) => setForm({ ...form, client_id: value === 'none' ? null : value })}
                  >
                    <SelectTrigger className="w-full h-10 text-sm">
                      <SelectValue placeholder="Select client" />
                    </SelectTrigger>
                    <SelectContent>
                      {clientsData?.clients?.map((client: any) => (
                        <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Required. This user will only see this client's data.
                  </p>
                </div>
              )}

              {showMultiClientSelect && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Assigned Clients
                  </label>
                  <div className="border border-input rounded-md p-2 max-h-40 overflow-y-auto space-y-1 bg-background">
                    {clientsData?.clients?.map((client: any) => (
                      <label key={client.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/30 px-1 py-0.5 rounded">
                        <input
                          type="checkbox"
                          checked={form.client_ids.includes(client.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setForm({ ...form, client_ids: [...form.client_ids, client.id] })
                            } else {
                              setForm({ ...form, client_ids: form.client_ids.filter((id: string) => id !== client.id) })
                            }
                          }}
                          className="rounded border-input"
                        />
                        <span className="text-foreground">{client.name}</span>
                      </label>
                    ))}
                    {(!clientsData?.clients || clientsData.clients.length === 0) && (
                      <p className="text-xs text-muted-foreground py-2 text-center">No clients available</p>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Select one or more clients this user can access. They will see a client filter dropdown.
                  </p>
                </div>
              )}

              {editingUser && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Status</label>
                  <Select
                    value={form.role === editingUser.role ? (editingUser.is_active ? 'active' : 'inactive') : 'active'}
                    onValueChange={() => {}}
                    disabled
                  >
                    <SelectTrigger className="w-full h-10 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                  {error}
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <Button
                  onClick={editingUser ? handleUpdate : handleCreate}
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="flex-1"
                >
                  {(createMutation.isPending || updateMutation.isPending) ? 'Saving...' : (editingUser ? 'Save Changes' : 'Create User')}
                </Button>
                <Button variant="outline" onClick={closeModal}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
