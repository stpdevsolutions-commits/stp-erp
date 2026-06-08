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

export function FiltrosGastos() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const category = params.get('category') ?? ''
  const dateFrom = params.get('dateFrom') ?? ''
  const dateTo = params.get('dateTo') ?? ''
  const hasFilters = !!(category || dateFrom || dateTo)

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
