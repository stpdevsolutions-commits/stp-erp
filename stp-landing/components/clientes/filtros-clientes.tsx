'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { SelectItem } from '@/components/ui/select'
import { SelectBuscable } from '@/components/ui/select-buscable'
import { Search, X } from 'lucide-react'

export function FiltrosClientes() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const inputRef = useRef<HTMLInputElement>(null)

  const search = params.get('search') ?? ''
  const type = params.get('type') ?? ''
  const hasFilters = !!(search || type)

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
    <div className="flex flex-wrap gap-2 max-sm:[&>*]:w-full max-sm:[&_[data-slot=select-trigger]]:w-full max-sm:[&_input]:w-full">
      <form key={search} onSubmit={handleSearch} className="relative">
        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          name="search"
          defaultValue={search}
          placeholder="Buscar cliente..."
          className="pl-8 w-52"
        />
      </form>

      <SelectBuscable value={type || 'all'} onValueChange={(v) => set('type', !v || v === 'all' ? '' : v)} className="w-36" placeholder="Tipo">
          <SelectItem value="all">Todos los tipos</SelectItem>
          <SelectItem value="company">Empresa</SelectItem>
          <SelectItem value="individual">Persona física</SelectItem>
        </SelectBuscable>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clear} className="gap-1">
          <X className="size-4" />
          Limpiar
        </Button>
      )}
    </div>
  )
}
