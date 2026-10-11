'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { VISITS_KEY } from '@/components/layout/visit-tracker'

type Item = { href: string; label: string }

/**
 * Los módulos que más abre esta persona en este navegador. Aparece solo cuando ya hay
 * costumbre de uso (2+ visitas) y nunca muestra algo que el rol no pueda abrir: `allowed`
 * viene del servidor ya filtrado por permisos.
 */
export function FrequentLinks({ allowed }: { allowed: Item[] }) {
  const [top, setTop] = useState<Item[]>([])

  useEffect(() => {
    try {
      const visits: Record<string, number> = JSON.parse(localStorage.getItem(VISITS_KEY) ?? '{}')
      const picked = allowed
        .filter((i) => (visits[i.href] ?? 0) >= 2)
        .sort((a, b) => (visits[b.href] ?? 0) - (visits[a.href] ?? 0))
        .slice(0, 4)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTop(picked)
    } catch {
      /* sin datos: no se muestra */
    }
  }, [allowed])

  if (top.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">Frecuentes:</span>
      {top.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          className="rounded-full border bg-card px-3 py-1 transition-colors hover:bg-muted"
        >
          {i.label}
        </Link>
      ))}
    </div>
  )
}
