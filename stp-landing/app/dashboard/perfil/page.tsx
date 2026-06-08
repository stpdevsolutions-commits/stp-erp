import { api } from '@/lib/api'
import type { User } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { UserCircle } from 'lucide-react'
import { EditarPerfilDialog } from '@/components/profile/editar-perfil-dialog'
import { CambiarPasswordDialog } from '@/components/profile/cambiar-password-dialog'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  manager: 'Gerente',
  user: 'Usuario',
}

export default async function PerfilPage() {
  let user: User | null = null
  let error: string | null = null

  try {
    user = await api.get<User>('/users/me')
  } catch (e) {
    error = e instanceof Error ? e.message : 'Error al cargar el perfil'
  }

  if (error || !user) {
    return (
      <div className="rounded-md bg-destructive/10 text-destructive px-4 py-3 text-sm">
        {error ?? 'No se pudo cargar el perfil'}
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mi perfil</h1>
        <p className="text-muted-foreground text-sm">Información de tu cuenta</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-3 pb-4">
          <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center">
            <UserCircle className="size-7 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">
              {user.firstName} {user.lastName}
            </CardTitle>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Nombre</p>
              <p className="font-medium">{user.firstName}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Apellido</p>
              <p className="font-medium">{user.lastName}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Correo electrónico</p>
              <p className="font-medium">{user.email}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Rol</p>
              <Badge variant="outline">{ROLE_LABELS[user.role] ?? user.role}</Badge>
            </div>
            <div>
              <p className="text-muted-foreground">Estado</p>
              <Badge variant={user.isActive ? 'default' : 'secondary'}>
                {user.isActive ? 'Activo' : 'Inactivo'}
              </Badge>
            </div>
            <div>
              <p className="text-muted-foreground">Miembro desde</p>
              <p className="font-medium">{new Date(user.createdAt).toLocaleDateString('es-DO')}</p>
            </div>
          </div>

          <div className="flex gap-2 pt-2 border-t">
            <EditarPerfilDialog user={user} />
            <CambiarPasswordDialog />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
