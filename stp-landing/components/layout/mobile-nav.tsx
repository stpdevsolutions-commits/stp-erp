'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'
import { useSidebar } from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'
import { NAV, isNavActive, visibleGroups } from '@/lib/nav'

/** Accesos de la barra inferior, en orden de preferencia; se toman los que el rol puede abrir. */
const PREFERRED = [
  '/dashboard/proyectos',
  '/dashboard/tareas',
  '/dashboard/pagos',
  '/dashboard/clientes',
  '/dashboard/cotizaciones',
]

/**
 * Barra de navegación inferior para celular: Inicio + los tres módulos de uso diario que el
 * rol tenga + "Menú" (abre el menú completo). Respeta el área segura del iPhone y de Android.
 * En escritorio no existe: ahí manda el menú lateral.
 */
export function MobileNav({
  role,
  modules,
}: {
  role: string
  modules?: Record<string, string>
}) {
  const pathname = usePathname()
  const { setOpenMobile } = useSidebar()

  const allowed = visibleGroups(role, modules).flatMap((g) => g.items)
  const home = NAV[0].items[0]
  const picks = PREFERRED.map((href) => allowed.find((i) => i.href === href))
    .filter((i): i is NonNullable<typeof i> => !!i)
    .slice(0, 3)

  const tabs = [home, ...picks]

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {tabs.map((item) => {
          const active = isNavActive(pathname, item.match ?? item.href, item.exact)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                <item.icon className="size-5" />
                {item.label}
              </Link>
            </li>
          )
        })}
        {/* Relleno para que "Menú" quede siempre en la última columna */}
        {Array.from({ length: 4 - tabs.length }).map((_, i) => (
          <li key={`pad-${i}`} aria-hidden="true" />
        ))}
        <li>
          <button
            type="button"
            onClick={() => setOpenMobile(true)}
            className="flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground transition-colors"
          >
            <Menu className="size-5" />
            Menú
          </button>
        </li>
      </ul>
    </nav>
  )
}
