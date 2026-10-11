'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { SelectItem } from '@/components/ui/select'
import { SelectBuscable } from '@/components/ui/select-buscable'
import { Input } from '@/components/ui/input'
import { X } from 'lucide-react'
import type { Collaborator } from '@/lib/types'
import { FiltrosPlegables } from '@/components/ui/filtros-plegables'
import { FiltroFecha } from '@/components/ui/filtro-fecha'

export function FiltrosNomina({ collaborators }: { collaborators: Collaborator[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const search = params.get('search') ?? ''
  const status = params.get('status') ?? ''
  const collaboratorId = params.get('collaboratorId') ?? ''
  const dateFrom = params.get('dateFrom') ?? ''
  const dateTo = params.get('dateTo') ?? ''
  const hasFilters = !!(search || status || collaboratorId || dateFrom || dateTo)

  function set(key: string, value: string) {
    const sp = new URLSearchParams(params.toString())
    value ? sp.set(key, value) : sp.delete(key)
    sp.delete('page')
    router.push(`${pathname}?${sp.toString()}`)
  }

  const selected = collaborators.find((c) => c.id === collaboratorId)

  return (
    <FiltrosPlegables>
      <div className="flex flex-wrap gap-2 max-sm:[&>*]:w-full max-sm:[&_[data-slot=select-trigger]]:w-full max-sm:[&_input]:w-full">
        <Input
          placeholder="Buscar por número, nombre o cédula"
          defaultValue={search}
          onKeyDown={(e) => {
            if (e.key === 'Enter') set('search', (e.target as HTMLInputElement).value.trim())
          }}
          className="w-64"
        />

        <SelectBuscable value={collaboratorId || 'all'}
          onValueChange={(v) => set('collaboratorId', !v || v === 'all' ? '' : v)} className="w-52" placeholder="Colaborador">
            <SelectItem value="all">Todos los colaboradores</SelectItem>
            {collaborators.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.firstName} {c.lastName}
              </SelectItem>
            ))}
          </SelectBuscable>

        <SelectBuscable value={status || 'all'} onValueChange={(v) => set('status', !v || v === 'all' ? '' : v)} className="w-36" placeholder="Estado">
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="pending">Pendiente</SelectItem>
            <SelectItem value="paid">Pagado</SelectItem>
            <SelectItem value="cancelled">Anulado</SelectItem>
          </SelectBuscable>

        <FiltroFecha label="Desde" value={dateFrom} onChange={(v) => set('dateFrom', v)} />

        <FiltroFecha label="Hasta" value={dateTo} onChange={(v) => set('dateTo', v)} />

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
