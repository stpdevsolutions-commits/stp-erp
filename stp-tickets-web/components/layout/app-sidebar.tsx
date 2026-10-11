'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { NAV, isNavActive } from '@/lib/nav'

export type SidebarProject = { id: string; code: string; name: string; open: number }

export function AppSidebar({ projects }: { projects: SidebarProject[] }) {
  const pathname = usePathname()
  const params = useSearchParams()
  const { isMobile, setOpenMobile } = useSidebar()
  const activeProject = pathname === '/tickets' ? params.get('project') : null

  // En móvil el menú es un panel superpuesto: al elegir una sección debe cerrarse solo.
  function closeOnMobile() {
    if (isMobile) setOpenMobile(false)
  }

  return (
    <Sidebar>
      <SidebarHeader className="border-b px-4 py-3">
        <Link href="/" onClick={closeOnMobile} className="flex items-center gap-2.5">
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
            <span className="text-sm font-semibold">STP Tickets</span>
            <span className="text-xs text-muted-foreground">Bugs, cambios y mejoras</span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {NAV.map((grupo, i) => (
          <SidebarGroup key={grupo.label ?? `g-${i}`}>
            {grupo.label && <SidebarGroupLabel>{grupo.label}</SidebarGroupLabel>}
            <SidebarMenu>
              {grupo.items.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.linkHref ?? item.href} onClick={closeOnMobile} />}
                    isActive={isNavActive(pathname, item.href, item.exact) && !(item.href === '/tickets' && activeProject)}
                  >
                    <item.icon className="size-4" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}

        {projects.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Proyectos</SidebarGroupLabel>
            <SidebarMenu>
              {projects.map((p) => (
                <SidebarMenuItem key={p.id}>
                  <SidebarMenuButton
                    render={<Link href={`/tickets?project=${p.id}`} onClick={closeOnMobile} />}
                    isActive={activeProject === p.id}
                    tooltip={p.name}
                  >
                    <span className="w-9 shrink-0 font-mono text-[11px] text-muted-foreground">{p.code}</span>
                    <span className="truncate">{p.name}</span>
                  </SidebarMenuButton>
                  {p.open > 0 && <SidebarMenuBadge>{p.open}</SidebarMenuBadge>}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t px-4 py-3 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
        Soluciones Técnicas Profesionales
      </SidebarFooter>
    </Sidebar>
  )
}
