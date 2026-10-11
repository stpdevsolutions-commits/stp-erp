'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { SelectItem } from '@/components/ui/select'
import { SelectBuscable } from '@/components/ui/select-buscable'
import { Search, X } from 'lucide-react'
import type { Client, Project } from '@/lib/types'
import { FiltrosPlegables } from '@/components/ui/filtros-plegables'

export function FiltrosTareas({ clients, projects }: { clients: Client[]; projects: Project[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const inputRef = useRef<HTMLInputElement>(null)

  const search = params.get('search') ?? ''
  const status = params.get('status') ?? ''
  const priority = params.get('priority') ?? ''
  const clientId = params.get('clientId') ?? ''
  const projectId = params.get('projectId') ?? ''
  const hasFilters = !!(search || status || priority || clientId || projectId)

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
    sp.delete('page')
    router.push(`${pathname}?${sp.toString()}`)
  }

  function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const val = (new FormData(e.currentTarget).get('search') as string) ?? ''
    set('search', val.trim())
  }

  function clear() {
    router.push(pathname)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <FiltrosPlegables>
      <div className="flex flex-wrap gap-2 max-sm:[&>*]:w-full max-sm:[&_[data-slot=select-trigger]]:w-full max-sm:[&_input]:w-full">
        <form key={search} onSubmit={handleSearch} className="relative">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground pointer-events-none" />
          <Input
            ref={inputRef}
            name="search"
            defaultValue={search}
            placeholder="Buscar tarea..."
            className="pl-8 w-52"
          />
        </form>

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

        <SelectBuscable value={status || 'all'} onValueChange={(v) => set('status', !v || v === 'all' ? '' : v)} className="w-36" placeholder="Estado">
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="pending">Pendiente</SelectItem>
            <SelectItem value="in_progress">En curso</SelectItem>
            <SelectItem value="review">En revisión</SelectItem>
            <SelectItem value="done">Completada</SelectItem>
            <SelectItem value="cancelled">Cancelada</SelectItem>
          </SelectBuscable>

        <SelectBuscable value={priority || 'all'} onValueChange={(v) => set('priority', !v || v === 'all' ? '' : v)} className="w-36" placeholder="Prioridad">
            <SelectItem value="all">Todas las prioridades</SelectItem>
            <SelectItem value="urgent">Urgente</SelectItem>
            <SelectItem value="high">Alta</SelectItem>
            <SelectItem value="medium">Media</SelectItem>
            <SelectItem value="low">Baja</SelectItem>
          </SelectBuscable>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clear} className="gap-1">
            <X className="size-4" />
            Limpiar
          </Button>
        )}
      </div>
    </FiltrosPlegables>
  )
}
