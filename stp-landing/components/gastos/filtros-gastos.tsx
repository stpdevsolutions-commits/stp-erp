'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { SelectItem } from '@/components/ui/select'
import { SelectBuscable } from '@/components/ui/select-buscable'
import { Input } from '@/components/ui/input'
import { X } from 'lucide-react'
import type { Client, Project } from '@/lib/types'
import { GENERAL_EXPENSE, canUseGeneralExpenses } from '@/lib/general-expense'
import { FiltrosPlegables } from '@/components/ui/filtros-plegables'
import { FiltroFecha } from '@/components/ui/filtro-fecha'

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

  // Con un cliente elegido, el selector de proyectos ofrece solo los de ese cliente.
  const visibleProjects = clientId ? projects.filter((p) => p.clientId === clientId) : projects

  /** Cambiar de cliente quita el proyecto elegido si no es de ese cliente. */
  function setClient(value: string) {
    const sp = new URLSearchParams(params.toString())
    if (value) sp.set('clientId', value)
    else sp.delete('clientId')
    const current = sp.get('projectId')
    if (value && current && projects.find((p) => p.id === current)?.clientId !== value) sp.delete('projectId')
    // Los gastos generales no tienen cliente: no combinan con elegir uno.
    if (value) sp.delete('general')
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
    <FiltrosPlegables>
      <div className="flex flex-wrap gap-2 max-sm:[&>*]:w-full max-sm:[&_[data-slot=select-trigger]]:w-full max-sm:[&_input]:w-full">
        <SelectBuscable value={clientId || 'all'} onValueChange={(v) => setClient(!v || v === 'all' ? '' : v)} className="w-48" placeholder="Cliente">
            <SelectItem value="all">Todos los clientes</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectBuscable>

        <SelectBuscable value={general ? GENERAL_EXPENSE : projectId || 'all'}
          onValueChange={(v) => setProject(!v || v === 'all' ? '' : v)} className="w-56" placeholder="Proyecto">
            <SelectItem value="all">Todos los proyectos</SelectItem>
            {canUseGeneralExpenses(userRole) && !clientId && (
              <SelectItem value={GENERAL_EXPENSE}>Gastos generales (sin proyecto)</SelectItem>
            )}
            {visibleProjects.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>
            ))}
          </SelectBuscable>

        <SelectBuscable value={category || 'all'} onValueChange={(v) => set('category', !v || v === 'all' ? '' : v)} className="w-40" placeholder="Categoría">
            <SelectItem value="all">Todas las categorías</SelectItem>
            <SelectItem value="materials">Materiales</SelectItem>
            <SelectItem value="labor">Mano de obra</SelectItem>
            <SelectItem value="equipment">Equipos</SelectItem>
            <SelectItem value="subcontract">Subcontrato</SelectItem>
            <SelectItem value="travel">Transporte</SelectItem>
            <SelectItem value="other">Otro</SelectItem>
          </SelectBuscable>

        <FiltroFecha label="Desde" value={dateFrom} onChange={(v) => set('dateFrom', v)} />

        <FiltroFecha label="Hasta" value={dateTo} onChange={(v) => set('dateTo', v)} />

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
