'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { X } from 'lucide-react'
import type { Client, Project } from '@/lib/types'

export function FiltrosGastos({ clients, projects }: { clients: Client[]; projects: Project[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const category = params.get('category') ?? ''
  const dateFrom = params.get('dateFrom') ?? ''
  const dateTo = params.get('dateTo') ?? ''
  const clientId = params.get('clientId') ?? ''
  const projectId = params.get('projectId') ?? ''
  const hasFilters = !!(category || dateFrom || dateTo || clientId || projectId)

  function set(key: string, value: string) {
    const sp = new URLSearchParams(params.toString())
    value ? sp.set(key, value) : sp.delete(key)
    sp.delete('page')
    router.push(`${pathname}?${sp.toString()}`)
  }

  function clear() {
    router.push(pathname)
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

      <Select value={category || 'all'} onValueChange={(v) => set('category', !v || v === 'all' ? '' : v)}>
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Categoría" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas las categorías</SelectItem>
          <SelectItem value="materials">Materiales</SelectItem>
          <SelectItem value="labor">Mano de obra</SelectItem>
          <SelectItem value="equipment">Equipos</SelectItem>
          <SelectItem value="subcontract">Subcontrato</SelectItem>
          <SelectItem value="travel">Transporte</SelectItem>
          <SelectItem value="other">Otro</SelectItem>
        </SelectContent>
      </Select>

      <Input
        type="date"
        value={dateFrom}
        onChange={(e) => set('dateFrom', e.target.value)}
        className="w-40"
        title="Desde"
      />

      <Input
        type="date"
        value={dateTo}
        onChange={(e) => set('dateTo', e.target.value)}
        className="w-40"
        title="Hasta"
      />

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clear} className="gap-1">
          <X className="size-4" />
          Limpiar
        </Button>
      )}
    </div>
  )
}
