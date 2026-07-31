'use client'

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Collaborator, User } from '@/lib/types'

/**
 * Una tarea se puede asignar a dos cosas distintas: a un **colaborador**
 * (personal de campo, sin cuenta) o a un **usuario del sistema**. Son tablas
 * separadas, así que el valor del select lleva prefijo para saber a cuál va:
 * `col:<id>` o `user:<id>`. `SIN_ASIGNAR` es el valor del "Sin asignar" porque
 * el primitivo no admite un SelectItem con value="".
 */
export const SIN_ASIGNAR = '__none__'

export interface Asignacion {
  assignedToId: string | null
  collaboratorId: string | null
}

/** Traduce el valor del select a las dos columnas del backend. */
export function parseAsignacion(value: string | undefined): Asignacion {
  if (!value || value === SIN_ASIGNAR) return { assignedToId: null, collaboratorId: null }
  if (value.startsWith('col:')) return { assignedToId: null, collaboratorId: value.slice(4) }
  if (value.startsWith('user:')) return { assignedToId: value.slice(5), collaboratorId: null }
  return { assignedToId: null, collaboratorId: null }
}

/** Valor inicial del select a partir de la tarea guardada. */
export function asignacionValue(a: {
  collaboratorId?: string | null
  assignedToId?: string | null
}): string {
  if (a.collaboratorId) return `col:${a.collaboratorId}`
  if (a.assignedToId) return `user:${a.assignedToId}`
  return SIN_ASIGNAR
}

export function AsignadoSelect({
  value,
  onValueChange,
  collaborators,
  users,
  id,
}: {
  value: string
  onValueChange: (value: string) => void
  collaborators: Collaborator[]
  users: User[]
  id?: string
}) {
  const selected = (() => {
    if (value.startsWith('col:')) {
      const c = collaborators.find((c) => c.id === value.slice(4))
      return c ? `${c.firstName} ${c.lastName}` : undefined
    }
    if (value.startsWith('user:')) {
      const u = users.find((u) => u.id === value.slice(5))
      return u ? `${u.firstName} ${u.lastName}` : undefined
    }
    return undefined
  })()

  return (
    <Select value={value} onValueChange={(v) => v && onValueChange(v)}>
      <SelectTrigger className="w-full" id={id}>
        <SelectValue placeholder="Sin asignar">{selected}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={SIN_ASIGNAR}>Sin asignar</SelectItem>

        {collaborators.length > 0 && (
          <>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Colaboradores</SelectLabel>
              {collaborators.map((c) => (
                <SelectItem key={c.id} value={`col:${c.id}`}>
                  {c.firstName} {c.lastName}
                  {c.position ? ` — ${c.position}` : ''}
                </SelectItem>
              ))}
            </SelectGroup>
          </>
        )}

        {users.length > 0 && (
          <>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Usuarios del sistema</SelectLabel>
              {users.map((u) => (
                <SelectItem key={u.id} value={`user:${u.id}`}>
                  {u.firstName} {u.lastName}
                </SelectItem>
              ))}
            </SelectGroup>
          </>
        )}
      </SelectContent>
    </Select>
  )
}
