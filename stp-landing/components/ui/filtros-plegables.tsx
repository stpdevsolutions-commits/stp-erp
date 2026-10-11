'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ChevronDown, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Parámetros de la URL que no son filtros. */
const NO_FILTRO = new Set(['page', 'limit', 'sort', 'dir', 'tab', 'view'])

/**
 * Agrupa los filtros de un listado. En celular quedan plegados detrás de un botón "Filtros"
 * (con el número de filtros activos) y se despliegan al tocarlo; en pantallas grandes se ven
 * siempre, como antes.
 */
export function FiltrosPlegables({ children }: { children: React.ReactNode }) {
  const params = useSearchParams()
  const [open, setOpen] = useState(false)
  let activos = 0
  params.forEach((value, key) => {
    if (value && !NO_FILTRO.has(key)) activos++
  })

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 w-full items-center gap-2 rounded-lg border bg-card px-3 text-sm font-medium md:hidden"
      >
        <SlidersHorizontal className="size-4 text-primary" />
        Filtros
        {activos > 0 && (
          <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">{activos}</span>
        )}
        <ChevronDown className={cn('ml-auto size-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      <div className={cn('mt-2 md:mt-0 md:block', open ? 'block' : 'hidden')}>{children}</div>
    </div>
  )
}
