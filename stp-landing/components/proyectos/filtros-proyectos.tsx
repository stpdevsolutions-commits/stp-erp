'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, X } from 'lucide-react'

export function FiltrosProyectos() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const inputRef = useRef<HTMLInputElement>(null)

  const search = params.get('search') ?? ''
  const status = params.get('status') ?? ''
  const hasFilters = !!(search || status)

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

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clear} className="gap-1">
          <X className="size-4" />
          Limpiar
        </Button>
      )}
    </div>
  )
}
