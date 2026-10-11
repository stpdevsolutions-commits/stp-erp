'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/dashboard/costos/materiales', label: 'Materiales y precios' },
  { href: '/dashboard/costos/acus', label: 'Partidas (ACU)' },
  { href: '/dashboard/costos/importar', label: 'Importar precios' },
  { href: '/dashboard/costos/catalogo', label: 'Unidades y categorías' },
]

/** Pestañas del módulo de Costos: las 4 vistas son hermanas, ninguna es "volver". */
export function CostosTabs() {
  const pathname = usePathname()
  return (
    <div className="grid grid-cols-2 gap-1 border-b md:flex">
      {TABS.map((tab) => {
        const active = pathname === tab.href
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`border-b-2 px-3.5 py-2 text-center text-sm font-medium transition-colors max-md:py-3 md:shrink-0 ${
              active
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
