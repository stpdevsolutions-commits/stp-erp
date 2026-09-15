'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useRef } from 'react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search } from 'lucide-react'

export function FiltrosColaboradores() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const inputRef = useRef<HTMLInputElement>(null)

  const search = params.get('search') ?? ''
  const status = params.get('status') ?? ''

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

  return (
    <div className="flex flex-wrap gap-2">
      <form key={search} onSubmit={handleSearch} className="relative">
        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          name="search"
          defaultValue={search}
          placeholder="Buscar por nombre, cédula..."
          className="w-64 h-8 pl-8 text-sm"
        />
      </form>

      <Select value={status || 'all'} onValueChange={(v) => set('status', !v || v === 'all' ? '' : v)}>
        <SelectTrigger className="w-40 h-8 text-sm">
          <SelectValue placeholder="Estado" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos los estados</SelectItem>
          <SelectItem value="active">Activo</SelectItem>
          <SelectItem value="inactive">Inactivo</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
