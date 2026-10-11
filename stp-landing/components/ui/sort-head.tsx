'use client'

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { TableHead } from '@/components/ui/table'
import { cn } from '@/lib/utils'

/**
 * Encabezado de columna ordenable. El orden vive en la URL (`?sort=campo&dir=asc|desc`) para que
 * se pueda compartir y sobreviva a recargar; cada clic recorre ascendente → descendente → orden
 * por defecto, y siempre vuelve a la primera página. El servidor solo acepta campos de su lista
 * blanca, así que un valor inventado en la URL no rompe nada.
 */
export function SortHead({
  field,
  children,
  className,
}: {
  field: string
  children: React.ReactNode
  className?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const active = params.get('sort') === field
  const dir = params.get('dir') === 'desc' ? 'desc' : 'asc'

  function toggle() {
    const next = new URLSearchParams(params.toString())
    next.delete('page')
    if (!active) {
      next.set('sort', field)
      next.set('dir', 'asc')
    } else if (dir === 'asc') {
      next.set('dir', 'desc')
    } else {
      next.delete('sort')
      next.delete('dir')
    }
    const qs = next.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  const Icon = !active ? ChevronsUpDown : dir === 'asc' ? ArrowUp : ArrowDown

  return (
    <TableHead
      className={className}
      aria-sort={!active ? 'none' : dir === 'asc' ? 'ascending' : 'descending'}
    >
      <button
        type="button"
        onClick={toggle}
        className={cn(
          '-mx-1.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 max-md:py-2.5 transition-colors hover:bg-primary/10 hover:text-foreground',
          active && 'text-foreground',
        )}
      >
        {children}
        <Icon className={cn('size-3.5 shrink-0', active ? 'opacity-100' : 'opacity-40')} />
      </button>
    </TableHead>
  )
}
