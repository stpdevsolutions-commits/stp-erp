'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useMemo, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { BuscadorSelect } from '@/components/ui/buscador-select'
import type { Client } from '@/lib/types'
import { Search, X } from 'lucide-react'

export function FiltrosProyectos({ clients = [] }: { clients?: Client[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const inputRef = useRef<HTMLInputElement>(null)

  const search = params.get('search') ?? ''
  const status = params.get('status') ?? ''
  const clientId = params.get('clientId') ?? ''
  const hasFilters = !!(search || status || clientId)

  // La lista de clientes puede ser larga: se usa el selector con buscador en vez
  // de un Select, que obligaría a recorrer decenas de nombres a ojo.
  const opcionesClientes = useMemo(
    () => clients.map((c) => ({ value: c.id, label: c.name, hint: c.rnc || undefined })),
    [clients],
  )
  const clienteActual = clients.find((c) => c.id === clientId)

  function set(key: string, value: string) {
    const sp = new URLSearchParams(params.toString())
    value ? sp.set(key, value) : sp.delete(key)
    // Al cambiar cualquier filtro se vuelve a la página 1: la página 3 del
    // listado anterior casi nunca existe en el nuevo.
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
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <form key={search} onSubmit={handleSearch} className="relative">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground pointer-events-none" />
          <Input
            ref={inputRef}
            name="search"
            defaultValue={search}
            placeholder="Buscar proyecto..."
            className="pl-8 w-52"
          />
        </form>

        <Select value={status || 'all'} onValueChange={(v) => set('status', !v || v === 'all' ? '' : v)}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="draft">Pendiente</SelectItem>
            <SelectItem value="active">En curso</SelectItem>
            <SelectItem value="on_hold">En pausa</SelectItem>
            <SelectItem value="completed">Completado</SelectItem>
            <SelectItem value="cancelled">Cancelado</SelectItem>
          </SelectContent>
        </Select>

        <BuscadorSelect
          opciones={opcionesClientes}
          value={clientId}
          onValueChange={(v) => set('clientId', v)}
          placeholder="Todos los clientes"
          vacio="Sin clientes"
          className="w-56"
        />

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clear} className="gap-1">
            <X className="size-4" />
            Limpiar
          </Button>
        )}
      </div>

      {clientId && (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            Cliente: {clienteActual?.name ?? 'seleccionado'}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => set('clientId', '')}
            className="h-6 gap-1 px-2 text-xs"
          >
            <X className="size-3" />
            Quitar filtro de cliente
          </Button>
        </div>
      )}
    </div>
  )
}
