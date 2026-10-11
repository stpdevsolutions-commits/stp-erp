'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { NAV } from '@/lib/nav'

export const VISITS_KEY = 'stp-visits'

const ITEMS = NAV.flatMap((g) => g.items).filter((i) => i.href !== '/dashboard')

/**
 * Cuenta, solo en este navegador, cuántas veces se abre cada módulo para poder ofrecer
 * "Accesos frecuentes" en Inicio. No sale nada del equipo: es localStorage.
 */
export function VisitTracker() {
  const pathname = usePathname()
  useEffect(() => {
    const hit = ITEMS.filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`)).sort(
      (a, b) => b.href.length - a.href.length,
    )[0]
    if (!hit) return
    try {
      const raw = localStorage.getItem(VISITS_KEY)
      const visits: Record<string, number> = raw ? JSON.parse(raw) : {}
      visits[hit.href] = (visits[hit.href] ?? 0) + 1
      localStorage.setItem(VISITS_KEY, JSON.stringify(visits))
    } catch {
      /* sin almacenamiento: simplemente no hay frecuentes */
    }
  }, [pathname])
  return null
}
