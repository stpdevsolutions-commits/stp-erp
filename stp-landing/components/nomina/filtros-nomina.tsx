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
import type { Collaborator } from '@/lib/types'

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
    <div className="flex flex-wrap gap-2">
      <Input
        placeholder="Buscar por número, nombre o cédula"
        defaultValue={search}
        onKeyDown={(e) => {
          if (e.key === 'Enter') set('search', (e.target as HTMLInputElement).value.trim())
        }}
        className="w-64"
      />

      <Select
        value={collaboratorId || 'all'}
        onValueChange={(v) => set('collaboratorId', !v || v === 'all' ? '' : v)}
      >
        <SelectTrigger className="w-52">
          <SelectValue placeholder="Colaborador">
            {selected ? `${selected.firstName} ${selected.lastName}` : undefined}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos los colaboradores</SelectItem>
          {collaborators.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.firstName} {c.lastName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={status || 'all'} onValueChange={(v) => set('status', !v || v === 'all' ? '' : v)}>
        <SelectTrigger className="w-36">
          <SelectValue placeholder="Estado" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos los estados</SelectItem>
          <SelectItem value="pending">Pendiente</SelectItem>
          <SelectItem value="paid">Pagado</SelectItem>
          <SelectItem value="cancelled">Anulado</SelectItem>
        </SelectContent>
      </Select>

      <Input
        type="date"
        value={dateFrom}
        onChange={(e) => set('dateFrom', e.target.value)}
        className="w-40"
        title="Período desde"
      />

      <Input
        type="date"
        value={dateTo}
        onChange={(e) => set('dateTo', e.target.value)}
        className="w-40"
        title="Período hasta"
      />

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={() => router.push(pathname)} className="gap-1">
          <X className="size-4" />
          Limpiar
        </Button>
      )}
    </div>
  )
}
