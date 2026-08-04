'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import {
  Users,
  FolderKanban,
  CheckSquare,
  FileText,
  UserCog,
  LayoutDashboard,
  LogOut,
  Truck,
  Receipt,
  CreditCard,
  BarChart3,
  FolderOpen,
  CircleUser,
  Package,
  HardHat,
  Settings,
  ClipboardList,
  Calculator,
  Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
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
} from '@/components/ui/sidebar'

type NavItem = {
  href: string
  label: string
  icon: LucideIcon
  /** Prefijo por el que se marca activo, si no basta con `href`. */
  match?: string
  exact?: boolean
  children?: { href: string; label: string }[]
}

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Resumen', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/clientes', label: 'Clientes', icon: Users },
  { href: '/dashboard/proyectos', label: 'Proyectos', icon: FolderKanban },
  { href: '/dashboard/tareas', label: 'Tareas', icon: CheckSquare },
  { href: '/dashboard/cotizaciones', label: 'Cotizaciones', icon: FileText },
  { href: '/dashboard/gastos', label: 'Gastos', icon: Receipt },
  { href: '/dashboard/pagos', label: 'Pagos', icon: CreditCard },
  { href: '/dashboard/proveedores', label: 'Proveedores', icon: Truck },
  { href: '/dashboard/inventario', label: 'Inventario', icon: Package },
  {
    // Costos es el único módulo con tres vistas distintas (precios, catálogo, ACU).
    // En vez de una cuarta entrada de primer nivel, se despliegan como subentradas
    // cuando estás dentro del módulo: el ACU se ve sin robarle sitio al resto.
    href: '/dashboard/costos/materiales',
    match: '/dashboard/costos',
    label: 'Costos',
    icon: Calculator,
    children: [
      { href: '/dashboard/costos/materiales', label: 'Materiales' },
      { href: '/dashboard/costos/catalogo', label: 'Catálogo' },
      { href: '/dashboard/costos/acus', label: 'Partidas (ACU)' },
      { href: '/dashboard/costos/importar', label: 'Importar' },
    ],
  },
  { href: '/dashboard/colaboradores', label: 'Colaboradores', icon: HardHat },
  { href: '/dashboard/fichas', label: 'Fichas de campo', icon: ClipboardList },
  { href: '/dashboard/archivos', label: 'Archivos', icon: FolderOpen },
]

const adminItems = [
  // Nómina expone sueldos: el módulo entero es MANAGER+ también en lectura.
  { href: '/dashboard/nomina', label: 'Nómina', icon: Wallet, minRole: 'MANAGER' },
  { href: '/dashboard/reportes', label: 'Reportes', icon: BarChart3, minRole: 'MANAGER' },
  { href: '/dashboard/usuarios', label: 'Usuarios', icon: UserCog, minRole: 'ADMIN' },
  { href: '/dashboard/configuracion', label: 'Configuración', icon: Settings, minRole: 'ADMIN' },
]

const accountItems = [
  { href: '/dashboard/perfil', label: 'Mi perfil', icon: CircleUser },
]

const ROLE_RANK: Record<string, number> = { user: 1, manager: 2, admin: 3 }

export function AppSidebar({ role = 'user' }: { role?: string }) {
  const pathname = usePathname()
  const router = useRouter()

  const normalizedRole = role.toLowerCase()
  const visibleAdminItems = adminItems.filter(
    (item) => (ROLE_RANK[normalizedRole] ?? 1) >= (ROLE_RANK[item.minRole.toLowerCase()] ?? 1),
  )

  function isActive(href: string, exact?: boolean) {
    return exact ? pathname === href : pathname.startsWith(href)
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <Sidebar>
      <SidebarHeader className="border-b px-4 py-3">
        <Link href="/dashboard" className="flex items-center gap-2.5">
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
        <SidebarGroup>
          <SidebarGroupLabel>Módulos</SidebarGroupLabel>
          <SidebarMenu>
            {navItems.map((item) => {
              const open = isActive(item.match ?? item.href, item.exact)
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={open}
                  >
                    <item.icon className="size-4" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                  {/* Las subentradas solo aparecen dentro del módulo: fuera de él
                      ocuparían sitio sin aportar contexto. */}
                  {item.children && open && (
                    <SidebarMenuSub>
                      {item.children.map((child) => (
                        <SidebarMenuSubItem key={child.href}>
                          <SidebarMenuSubButton
                            render={<Link href={child.href} />}
                            isActive={isActive(child.href)}
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

        {visibleAdminItems.length > 0 && (
        <SidebarGroup>
          <SidebarGroupLabel>Administración</SidebarGroupLabel>
          <SidebarMenu>
            {visibleAdminItems.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  render={<Link href={item.href} />}
                  isActive={isActive(item.href)}
                >
                  <item.icon className="size-4" />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
        )}

        <SidebarGroup>
          <SidebarGroupLabel>Cuenta</SidebarGroupLabel>
          <SidebarMenu>
            {accountItems.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  render={<Link href={item.href} />}
                  isActive={isActive(item.href)}
                >
                  <item.icon className="size-4" />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t p-2">
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
