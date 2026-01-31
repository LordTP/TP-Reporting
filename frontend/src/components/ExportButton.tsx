import { Download } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { usePermissionStore } from '@/store/permissionStore'

const FULL_ACCESS_ROLES = ['admin', 'superadmin']

interface ExportButtonProps {
  onClick: () => void
  label?: string
}

export default function ExportButton({ onClick, label = 'Export Excel' }: ExportButtonProps) {
  const { user } = useAuthStore()
  const permHas = usePermissionStore((s) => s.hasPermission)
  const isFullAccess = !!user && FULL_ACCESS_ROLES.includes(user.role)

  if (!isFullAccess && !permHas('feature:export_excel')) return null

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
    >
      <Download className="h-3.5 w-3.5" />
      {label}
    </button>
  )
}
