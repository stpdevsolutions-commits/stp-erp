'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarHeader,
  useSidebar,
} from '@/components/ui/sidebar'
import { useMensajesPendientes } from '@/lib/use-mensajes-pendientes'
import { ROLE_LABELS, getPageTitle, isNavActive, visibleGroups } from '@/lib/nav'

// Se reexporta para no romper a quien ya lo importaba desde aquí.
export { getPageTitle }

type SidebarUser = { firstName: string; lastName: string; role: string }

export function AppSidebar({
  role = 'user',
  user,
  modules,
}: {
  role?: string
  user?: SidebarUser
  modules?: Record<string, string>
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { isMobile, setOpenMobile } = useSidebar()

  const initials = user
    ? `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase()
    : ''
  const grupos = visibleGroups(role, modules)
  const mensajesPendientes = useMensajesPendientes(grupos.some((g) => g.items.some((i) => i.module === 'mensajes')))

  // En móvil el menú es un panel superpuesto: al elegir una sección debe cerrarse solo.
  function closeOnMobile() {
    if (isMobile) setOpenMobile(false)
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <Sidebar>
      <SidebarHeader className="border-b px-4 py-3">
        <Link href="/dashboard" onClick={closeOnMobile} className="flex items-center gap-2.5">
          <span className="flex shrink-0 items-center justify-center rounded-md bg-white p-1.5 shadow-sm ring-1 ring-black/5">
            <Image
              src="/logo-stp.png"
              alt="STP — Soluciones Técnicas Profesionales"
              width={242}
              height={151}
              className="h-7 w-auto"
              priority
            />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="font-semibold text-sm">STP ERP</span>
            <span className="text-xs text-muted-foreground">Panel de gestión</span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {grupos.map((grupo, i) => (
          <SidebarGroup key={grupo.label ?? `grupo-${i}`}>
            {grupo.label && <SidebarGroupLabel>{grupo.label}</SidebarGroupLabel>}
            <SidebarMenu>
              {grupo.items.map((item) => {
                const abierto = isNavActive(pathname, item.match ?? item.href, item.exact, item.exclude)
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      render={<Link href={item.href} onClick={closeOnMobile} />}
                      isActive={abierto}
                    >
                      <item.icon className="size-4" />
                      <span>{item.label}</span>
                      {item.module === 'mensajes' && mensajesPendientes > 0 && (
                        <span
                          className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[0.7rem] font-semibold tabular-nums text-primary-foreground"
                          aria-label={`${mensajesPendientes} conversaciones esperan respuesta`}
                        >
                          {mensajesPendientes}
                        </span>
                      )}
                    </SidebarMenuButton>
                    {/* Las subentradas solo aparecen dentro del módulo: fuera de él
                        ocuparían sitio sin aportar contexto. */}
                    {item.children && abierto && (
                      <SidebarMenuSub>
                        {item.children.map((child) => (
                          <SidebarMenuSubItem key={child.href}>
                            <SidebarMenuSubButton
                              render={<Link href={child.href} onClick={closeOnMobile} />}
                              isActive={isNavActive(pathname, child.href)}
                            >
                              <span>{child.label}</span>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    )}
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t p-2">
        {user && (
          <div className="flex items-center gap-2 rounded-md px-2 py-1.5 group-data-[collapsible=icon]:hidden">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">
              {initials}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-medium">
                {user.firstName} {user.lastName}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {ROLE_LABELS[user.role.toLowerCase()] ?? user.role}
              </p>
            </div>
          </div>
        )}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleLogout} className="text-muted-foreground">
              <LogOut className="size-4" />
              <span>Cerrar sesión</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
