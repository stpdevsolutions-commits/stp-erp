'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import type { Client, FichaStatus, FichaType, Project } from '@/lib/types'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { X } from 'lucide-react'

const TYPE_LABEL: Record<FichaType, string> = {
  electrico: 'Eléctrico',
  civil: 'Civil',
  electromecanico: 'Electromecánico',
  levantamiento: 'Levantamiento',
  domotica: 'Domótica',
  evaluacion_danos: 'Evaluación de daños',
}

const STATUS_LABEL: Record<FichaStatus, string> = {
  borrador: 'Borrador',
  en_progreso: 'En progreso',
  enviada: 'Enviada',
}

export function FiltrosFichas({ clients, projects }: { clients: Client[]; projects: Project[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const clientId = params.get('clientId') ?? ''
  const projectId = params.get('projectId') ?? ''
  const type = params.get('type') ?? ''
  const status = params.get('status') ?? ''
  const hasFilters = !!(clientId || projectId || type || status)

  function set(key: string, value: string) {
    const sp = new URLSearchParams(params.toString())
    value ? sp.set(key, value) : sp.delete(key)
    router.push(`${pathname}?${sp.toString()}`)
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Select value={clientId || 'all'} onValueChange={(v) => set('clientId', !v || v === 'all' ? '' : v)}>
        <SelectTrigger className="w-48">
          <SelectValue placeholder="Cliente" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos los clientes</SelectItem>
          {clients.map((c) => (
            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={projectId || 'all'} onValueChange={(v) => set('projectId', !v || v === 'all' ? '' : v)}>
        <SelectTrigger className="w-56">
          <SelectValue placeholder="Proyecto" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos los proyectos</SelectItem>
          {projects.map((p) => (
            <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={type || 'all'} onValueChange={(v) => set('type', !v || v === 'all' ? '' : v)}>
        <SelectTrigger className="w-44">
          <SelectValue placeholder="Tipo" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos los tipos</SelectItem>
          {(Object.entries(TYPE_LABEL) as [FichaType, string][]).map(([v, l]) => (
            <SelectItem key={v} value={v}>{l}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={status || 'all'} onValueChange={(v) => set('status', !v || v === 'all' ? '' : v)}>
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Estado" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos los estados</SelectItem>
          {(Object.entries(STATUS_LABEL) as [FichaStatus, string][]).map(([v, l]) => (
            <SelectItem key={v} value={v}>{l}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={() => router.push(pathname)} className="gap-1">
          <X className="size-4" />
          Limpiar
        </Button>
      )}
    </div>
  )
}
