﻿import { api, pageError } from '@/lib/api'
import { TableEmpty } from '@/components/ui/empty-state'
import type { User, PaginatedResponse } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { NuevoUsuarioDialog } from '@/components/users/nuevo-usuario-dialog'
import { UserActions } from '@/components/users/user-actions'
import { formatDate } from '@/lib/utils'

const ROLE_LABELS = { admin: 'Administrador', manager: 'Gerente', finanza: 'Finanza', readonly: 'Solo lectura (agente)', user: 'Usuario' }

// Colores semánticos suaves, coherentes con el resto del ERP (Proyectos, Cotizaciones, Nómina).
const ROLE_BADGE: Record<string, string> = {
  admin: 'bg-primary/10 text-primary',
  manager: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  finanza: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  readonly: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  user: 'bg-muted text-muted-foreground',
}

const STATUS_BADGE: Record<'active' | 'inactive', string> = {
  active: 'bg-green-600/10 text-green-700 dark:text-green-400',
  inactive: 'bg-muted text-muted-foreground',
}

function initials(u: User) {
  return `${u.firstName[0] ?? ''}${u.lastName[0] ?? ''}`.toUpperCase()
}

export default async function UsuariosPage() {
  let usuarios: User[] = []
  let error: string | null = null

  try {
    const res = await api.get<PaginatedResponse<User>>('/users?limit=100')
    usuarios = res.data
  } catch (e) {
    error = pageError(e, 'Error al cargar usuarios')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Usuarios</h1>
          <p className="text-muted-foreground text-sm">Gestión de usuarios y roles del sistema</p>
        </div>
        <NuevoUsuarioDialog />
      </div>

      {error ? (
        <div className="rounded-md bg-destructive/10 text-destructive px-4 py-3 text-sm">{error}</div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuario</TableHead>
                <TableHead className="hidden md:table-cell">Correo</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead className="hidden sm:table-cell">Estado</TableHead>
                <TableHead className="hidden lg:table-cell">Creado</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {usuarios.length === 0 ? (
                <TableEmpty colSpan={6} title="No hay usuarios registrados" action={<NuevoUsuarioDialog />} />
              ) : (
                usuarios.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="whitespace-normal min-w-[140px]">
                      <div className="flex items-center gap-2">
                        <Avatar className="size-8">
                          <AvatarFallback className="text-xs">{initials(u)}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium">
                          {u.firstName} {u.lastName}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <Badge className={ROLE_BADGE[u.role]}>{ROLE_LABELS[u.role]}</Badge>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge className={STATUS_BADGE[u.isActive ? 'active' : 'inactive']}>
                        {u.isActive ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
                      {formatDate(u.createdAt)}
                    </TableCell>
                    <TableCell>
                      <UserActions usuario={u} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
