'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Search, Bell } from 'lucide-react'
import { getPageTitle } from './app-sidebar'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'

type HeaderUser = { firstName: string; lastName: string; role: string }

export function AppHeader({ user }: { user?: HeaderUser }) {
  const pathname = usePathname()
  const title = getPageTitle(pathname)
  const initials = user
    ? `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase()
    : ''

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-4 border-b bg-background px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="h-4" />
        <span className="truncate text-sm font-semibold tracking-tight">{title}</span>
      </div>

      <div className="flex items-center gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={
                <span
                  role="button"
                  aria-disabled="true"
                  className="hidden w-56 cursor-not-allowed items-center gap-2 rounded-md border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground select-none sm:flex"
                >
                  <Search className="size-3.5 shrink-0" />
                  <span className="truncate">Buscar en el ERP…</span>
                </span>
              }
            />
            <TooltipContent>Próximamente</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <span
                  role="button"
                  aria-disabled="true"
                  className="flex size-8 cursor-not-allowed items-center justify-center rounded-md border text-muted-foreground select-none"
                >
                  <Bell className="size-4" />
                </span>
              }
            />
            <TooltipContent>Próximamente</TooltipContent>
          </Tooltip>
        </TooltipProvider>

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
