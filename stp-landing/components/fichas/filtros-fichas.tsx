'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import type { Client, FichaStatus, FichaType, Project } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { SelectItem } from '@/components/ui/select'
import { SelectBuscable } from '@/components/ui/select-buscable'
import { X } from 'lucide-react'
import { FiltrosPlegables } from '@/components/ui/filtros-plegables'

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

  // Con un cliente elegido, el selector de proyectos ofrece solo los de ese cliente.
  const visibleProjects = clientId ? projects.filter((p) => p.clientId === clientId) : projects

  /** Cambiar de cliente quita el proyecto elegido si no es de ese cliente. */
  function setClient(value: string) {
    const sp = new URLSearchParams(params.toString())
    if (value) sp.set('clientId', value)
    else sp.delete('clientId')
    const current = sp.get('projectId')
    if (value && current && projects.find((p) => p.id === current)?.clientId !== value) sp.delete('projectId')
    sp.delete('page')
    router.push(`${pathname}?${sp.toString()}`)
  }

  function set(key: string, value: string) {
    const sp = new URLSearchParams(params.toString())
    value ? sp.set(key, value) : sp.delete(key)
    router.push(`${pathname}?${sp.toString()}`)
  }

  return (
    <FiltrosPlegables>
      <div className="flex flex-wrap gap-2 max-sm:[&>*]:w-full max-sm:[&_[data-slot=select-trigger]]:w-full max-sm:[&_input]:w-full">
        <SelectBuscable value={clientId || 'all'} onValueChange={(v) => setClient(!v || v === 'all' ? '' : v)} className="w-48" placeholder="Cliente">
            <SelectItem value="all">Todos los clientes</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectBuscable>

        <SelectBuscable value={projectId || 'all'} onValueChange={(v) => set('projectId', !v || v === 'all' ? '' : v)} className="w-56" placeholder="Proyecto">
            <SelectItem value="all">Todos los proyectos</SelectItem>
            {visibleProjects.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>
            ))}
          </SelectBuscable>

        <SelectBuscable value={type || 'all'} onValueChange={(v) => set('type', !v || v === 'all' ? '' : v)} className="w-44" placeholder="Tipo">
            <SelectItem value="all">Todos los tipos</SelectItem>
            {(Object.entries(TYPE_LABEL) as [FichaType, string][]).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectBuscable>

        <SelectBuscable value={status || 'all'} onValueChange={(v) => set('status', !v || v === 'all' ? '' : v)} className="w-40" placeholder="Estado">
            <SelectItem value="all">Todos los estados</SelectItem>
            {(Object.entries(STATUS_LABEL) as [FichaStatus, string][]).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectBuscable>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => router.push(pathname)} className="gap-1">
            <X className="size-4" />
            Limpiar
          </Button>
        )}
      </div>
    </FiltrosPlegables>
  )
}
