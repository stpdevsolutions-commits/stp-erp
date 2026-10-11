import { Home, KanbanSquare, Map } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type NavItem = {
  href: string
  label: string
  /** Una línea que explica para qué sirve la sección (se muestra en Inicio y en la búsqueda). */
  description?: string
  icon: LucideIcon
  exact?: boolean
  /** Destino del enlace cuando difiere de `href` (que se usa solo para marcar la sección activa). */
  linkHref?: string
}

export type NavGroup = {
  /** Sin etiqueta el grupo se pinta sin encabezado (Inicio no necesita título). */
  label?: string
  items: NavItem[]
}

/**
 * Fuente única de la navegación: el menú lateral, la pantalla de Inicio, la búsqueda y las migas
 * salen de aquí. Los proyectos (accesos directos a su lista de tickets) son datos reales y se
 * agregan aparte desde la API, no se listan a mano.
 */
export const NAV: NavGroup[] = [
  { items: [{ href: '/', label: 'Inicio', icon: Home, exact: true }] },
  {
    label: 'Trabajo',
    items: [
      {
        href: '/tickets',
        // Los filtros de la lista se recuerdan entre visitas; desde el menú se quiere ver todo.
        linkHref: '/tickets?all=1',
        label: 'Tickets',
        description: 'Bugs, cambios, mejoras y nuevos desarrollos de todos los proyectos',
        icon: KanbanSquare,
      },
      {
        href: '/roadmap',
        label: 'Roadmap',
        description: 'Etapas, línea de tiempo y avance de lo que se está construyendo',
        icon: Map,
      },
    ],
  },
]

export function isNavActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)
}

const FLAT = NAV.flatMap((g) => g.items.map((i) => ({ href: i.href, label: i.label, group: g.label })))

function bestMatch(pathname: string) {
  return FLAT.filter((t) => (t.href === '/' ? pathname === '/' : pathname === t.href || pathname.startsWith(`${t.href}/`))).sort(
    (a, b) => b.href.length - a.href.length,
  )[0]
}

export function getPageTitle(pathname: string): string {
  return bestMatch(pathname)?.label ?? 'STP Tickets'
}

/** Migas: Área › Sección (la sección enlaza cuando la ruta es más profunda, p. ej. un ticket). */
export function getBreadcrumbs(pathname: string): { label: string; href?: string }[] {
  const m = bestMatch(pathname)
  if (!m || pathname === '/') return []
  const trail: { label: string; href?: string }[] = []
  if (m.group) trail.push({ label: m.group })
  trail.push({ label: m.label, href: pathname === m.href ? undefined : m.href })
  if (pathname.startsWith('/tickets/')) trail.push({ label: 'Ticket' })
  return trail
}
