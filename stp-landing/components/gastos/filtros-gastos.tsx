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
import { GENERAL_EXPENSE, canUseGeneralExpenses } from '@/lib/general-expense'

export function FiltrosGastos({
  clients,
  projects,
  userRole,
}: {
  clients: Client[]
  projects: Project[]
  userRole?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const category = params.get('category') ?? ''
  const dateFrom = params.get('dateFrom') ?? ''
  const dateTo = params.get('dateTo') ?? ''
  const clientId = params.get('clientId') ?? ''
  const projectId = params.get('projectId') ?? ''
  const general = params.get('general') === '1'
  const hasFilters = !!(category || dateFrom || dateTo || clientId || projectId || general)

  /** "Gastos generales" es un filtro aparte (`general=1`), no un proyecto. */
  function setProject(value: string) {
    const sp = new URLSearchParams(params.toString())
    sp.delete('projectId')
    sp.delete('general')
    if (value === GENERAL_EXPENSE) sp.set('general', '1')
    else if (value) sp.set('projectId', value)
    sp.delete('page')
    router.push(`${pathname}?${sp.toString()}`)
  }

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
    <div className="flex flex-wrap gap-2 max-sm:[&>*]:w-full max-sm:[&_[data-slot=select-trigger]]:w-full max-sm:[&_input]:w-full">
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

      <Select
        value={general ? GENERAL_EXPENSE : projectId || 'all'}
        onValueChange={(v) => setProject(!v || v === 'all' ? '' : v)}
      >
        <SelectTrigger className="w-56">
          <SelectValue placeholder="Proyecto" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos los proyectos</SelectItem>
          {canUseGeneralExpenses(userRole) && (
            <SelectItem value={GENERAL_EXPENSE}>Gastos generales (sin proyecto)</SelectItem>
          )}
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
