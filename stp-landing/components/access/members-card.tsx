'use client'

import { useState, useTransition } from 'react'
import { ShieldCheck, Trash2, UserPlus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { User } from '@/lib/types'
import {
  addClientMember,
  addProjectMember,
  removeClientMember,
  removeProjectMember,
  type Member,
} from '@/lib/actions/memberships'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  manager: 'Gerente',
  user: 'Usuario',
}

/**
 * Panel de accesos (solo ADMIN): asigna usuarios a un proyecto o a un cliente.
 * Sin asignación, un usuario con rol "Usuario" no ve los datos de ese
 * proyecto/cliente. Administradores y gerentes ven todo sin necesidad de estar
 * asignados.
 */
export function MembersCard({
  scope,
  resourceId,
  members,
  users,
}: {
  scope: 'project' | 'client'
  resourceId: string
  members: Member[]
  users: User[]
}) {
  const [selected, setSelected] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const assignedIds = new Set(members.map((m) => m.userId))
  const candidates = users.filter((u) => u.isActive && !assignedIds.has(u.id))

  function handleAdd() {
    if (!selected) return
    setError(null)
    startTransition(async () => {
      const action = scope === 'project' ? addProjectMember : addClientMember
      const result = await action(resourceId, selected)
      if (!result.ok) setError(result.error ?? 'Error al asignar el usuario')
      else setSelected('')
    })
  }

  function handleRemove(userId: string) {
    setError(null)
    startTransition(async () => {
      const action = scope === 'project' ? removeProjectMember : removeClientMember
      const result = await action(resourceId, userId)
      if (!result.ok) setError(result.error ?? 'Error al quitar el acceso')
    })
  }

  return (
    <Card>
      <CardContent className="pt-4 pb-4 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-muted-foreground" />
          <h2 className="font-medium text-sm">Accesos</h2>
        </div>

        <p className="text-xs text-muted-foreground">
          {scope === 'project'
            ? 'Usuarios que pueden ver este proyecto y sus archivos, gastos, pagos y fichas. Administradores y gerentes tienen acceso a todo sin necesidad de asignación.'
            : 'Usuarios que pueden ver este cliente y todo lo suyo: proyectos, cotizaciones, pagos y documentos. Administradores y gerentes tienen acceso a todo sin necesidad de asignación.'}
        </p>

        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nadie asignado todavía. Solo administradores y gerentes tienen acceso.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {members.map((m) => (
              <li key={m.userId} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {m.firstName} {m.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline">{ROLE_LABELS[m.role] ?? m.role}</Badge>
                  {m.implicit ? (
                    <Badge variant="secondary" title="Responsable del proyecto">
                      Responsable
                    </Badge>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => handleRemove(m.userId)}
                      aria-label={`Quitar acceso a ${m.firstName} ${m.lastName}`}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Select value={selected} onValueChange={(v) => setSelected(v ?? '')}>
            <SelectTrigger className="min-w-56 flex-1">
              <SelectValue placeholder="Selecciona un usuario…" />
            </SelectTrigger>
            <SelectContent>
              {candidates.length === 0 ? (
                <p className="px-3 py-2 text-sm text-muted-foreground">
                  No quedan usuarios por asignar
                </p>
              ) : (
                candidates.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.firstName} {u.lastName} — {ROLE_LABELS[u.role] ?? u.role}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={handleAdd} disabled={!selected || pending}>
            <UserPlus className="size-4 mr-1" />
            {pending ? 'Guardando…' : 'Dar acceso'}
          </Button>
        </div>

        {error && (
          <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">{error}</p>
        )}
      </CardContent>
    </Card>
  )
}
