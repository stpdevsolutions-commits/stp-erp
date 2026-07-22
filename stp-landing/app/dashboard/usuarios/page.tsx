﻿import { api, pageError } from '@/lib/api'
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

const ROLE_LABELS = { admin: 'Administrador', manager: 'Gerente', user: 'Usuario' }
const ROLE_VARIANTS: Record<string, 'default' | 'secondary' | 'outline'> = {
  admin: 'default',
  manager: 'secondary',
  user: 'outline',
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
                <TableHead>Correo</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Creado</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {usuarios.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No hay usuarios registrados
                  </TableCell>
                </TableRow>
              ) : (
                usuarios.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="size-8">
                          <AvatarFallback className="text-xs">{initials(u)}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium">
                          {u.firstName} {u.lastName}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <Badge variant={ROLE_VARIANTS[u.role]}>{ROLE_LABELS[u.role]}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.isActive ? 'default' : 'secondary'}>
                        {u.isActive ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(u.createdAt).toLocaleDateString('es-DO')}
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
