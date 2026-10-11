'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'
import { useSidebar } from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'
import { NAV, isNavActive } from '@/lib/nav'

/**
 * Barra de navegación inferior para celular: Inicio, Tickets, Roadmap y "Menú" (abre el panel
 * completo con los proyectos). Respeta el área segura del iPhone y de Android. En escritorio no
 * existe: ahí manda el menú lateral.
 */
export function MobileNav() {
  const pathname = usePathname()
  const { setOpenMobile } = useSidebar()
  const tabs = NAV.flatMap((g) => g.items)

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-4">
        {tabs.map((item) => {
          const active = isNavActive(pathname, item.href, item.exact)
          return (
            <li key={item.href}>
              <Link
                href={item.linkHref ?? item.href}
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
