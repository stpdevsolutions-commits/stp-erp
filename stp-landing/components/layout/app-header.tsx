'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { GlobalSearch } from './global-search'
import { NotificationsBell } from './notifications-bell'
import { ThemeToggle } from './theme-toggle'
import { getBreadcrumbs, getPageTitle } from '@/lib/nav'

type HeaderUser = { firstName: string; lastName: string; role: string }

export function AppHeader({
  user,
  modules,
}: {
  user?: HeaderUser
  modules?: Record<string, string>
}) {
  const pathname = usePathname()
  const title = getPageTitle(pathname)
  const crumbs = getBreadcrumbs(pathname)
  const initials = user
    ? `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase()
    : ''

  return (
    <header className="sticky top-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 items-center justify-between gap-4 border-b bg-background px-4 pt-[env(safe-area-inset-top)] sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="h-4" />
        {/* En escritorio: Área › Módulo, para saber dónde se está y volver al módulo desde un detalle */}
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
        <GlobalSearch role={user?.role ?? 'user'} modules={modules} />
        <ThemeToggle />
        <NotificationsBell />

        {user && (
          <Link href="/dashboard/perfil" aria-label="Mi perfil">
            <Avatar>
              <AvatarFallback className="bg-primary font-semibold text-primary-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
          </Link>
        )}
      </div>
    </header>
  )
}
