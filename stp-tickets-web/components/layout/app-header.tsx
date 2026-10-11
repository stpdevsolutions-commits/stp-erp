'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { GlobalSearch, type SearchableTicket } from './global-search'
import { ThemeToggle } from './theme-toggle'
import { getBreadcrumbs, getPageTitle } from '@/lib/nav'

export function AppHeader({ tickets }: { tickets: SearchableTicket[] }) {
  const pathname = usePathname()
  const title = getPageTitle(pathname)
  const crumbs = getBreadcrumbs(pathname)

  return (
    <header className="sticky top-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 items-center justify-between gap-4 border-b bg-background px-4 pt-[env(safe-area-inset-top)] sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="h-4" />
        {/* En escritorio: Área › Sección, para saber dónde se está y volver desde un ticket */}
        <nav aria-label="Ubicación" className="hidden min-w-0 items-center gap-1.5 text-sm sm:flex">
          {crumbs.length === 0 ? (
            <span className="font-semibold tracking-tight">{title}</span>
          ) : (
            crumbs.map((c, i) => (
              <span key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
                {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" />}
                {c.href ? (
                  <Link href={c.href} className="truncate text-muted-foreground transition-colors hover:text-foreground">
                    {c.label}
                  </Link>
                ) : (
                  <span
                    aria-current={i === crumbs.length - 1 ? 'page' : undefined}
                    className={i === crumbs.length - 1 ? 'truncate font-semibold tracking-tight' : 'truncate text-muted-foreground'}
                  >
                    {c.label}
                  </span>
                )}
              </span>
            ))
          )}
        </nav>
        <span className="truncate text-sm font-semibold tracking-tight sm:hidden">{title}</span>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2">
        <GlobalSearch tickets={tickets} />
        <ThemeToggle />
      </div>
    </header>
  )
}
