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

export function FiltrosPagos() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const status = params.get('status') ?? ''
  const method = params.get('method') ?? ''
  const dateFrom = params.get('dateFrom') ?? ''
  const dateTo = params.get('dateTo') ?? ''
  const hasFilters = !!(status || method || dateFrom || dateTo)

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
      <Select value={status || 'all'} onValueChange={(v) => set('status', !v || v === 'all' ? '' : v)}>
        <SelectTrigger className="w-36">
          <SelectValue placeholder="Estado" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos los estados</SelectItem>
          <SelectItem value="completed">Completado</SelectItem>
          <SelectItem value="pending">Pendiente</SelectItem>
          <SelectItem value="failed">Fallido</SelectItem>
          <SelectItem value="refunded">Reembolsado</SelectItem>
        </SelectContent>
      </Select>

      <Select value={method || 'all'} onValueChange={(v) => set('method', !v || v === 'all' ? '' : v)}>
        <SelectTrigger className="w-36">
          <SelectValue placeholder="Método" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos los métodos</SelectItem>
          <SelectItem value="cash">Efectivo</SelectItem>
          <SelectItem value="transfer">Transferencia</SelectItem>
          <SelectItem value="check">Cheque</SelectItem>
          <SelectItem value="card">Tarjeta</SelectItem>
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
