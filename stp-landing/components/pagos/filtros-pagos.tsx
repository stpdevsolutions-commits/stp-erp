'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { SelectItem } from '@/components/ui/select'
import { SelectBuscable } from '@/components/ui/select-buscable'
import { Input } from '@/components/ui/input'
import { X } from 'lucide-react'
import type { Client } from '@/lib/types'
import { FiltrosPlegables } from '@/components/ui/filtros-plegables'
import { FiltroFecha } from '@/components/ui/filtro-fecha'

export function FiltrosPagos({ clients }: { clients: Client[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const status = params.get('status') ?? ''
  const method = params.get('method') ?? ''
  const dateFrom = params.get('dateFrom') ?? ''
  const dateTo = params.get('dateTo') ?? ''
  const clientId = params.get('clientId') ?? ''
  const hasFilters = !!(status || method || dateFrom || dateTo || clientId)

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
        <SelectBuscable value={clientId || 'all'} onValueChange={(v) => set('clientId', !v || v === 'all' ? '' : v)} className="w-48" placeholder="Cliente">
            <SelectItem value="all">Todos los clientes</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectBuscable>

        <SelectBuscable value={status || 'all'} onValueChange={(v) => set('status', !v || v === 'all' ? '' : v)} className="w-36" placeholder="Estado">
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="completed">Completado</SelectItem>
            <SelectItem value="pending">Pendiente</SelectItem>
            <SelectItem value="failed">Fallido</SelectItem>
            <SelectItem value="refunded">Reembolsado</SelectItem>
          </SelectBuscable>

        <SelectBuscable value={method || 'all'} onValueChange={(v) => set('method', !v || v === 'all' ? '' : v)} className="w-36" placeholder="Método">
            <SelectItem value="all">Todos los métodos</SelectItem>
            <SelectItem value="cash">Efectivo</SelectItem>
            <SelectItem value="transfer">Transferencia</SelectItem>
            <SelectItem value="check">Cheque</SelectItem>
            <SelectItem value="card">Tarjeta</SelectItem>
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
