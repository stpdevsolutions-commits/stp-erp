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
  GanttChartSquare,
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
  /** Módulo de la matriz de permisos (module-permissions.ts de la API). */
  module?: string
  /** Rol mínimo, solo para lo que no es un módulo (Usuarios). */
  minRole?: 'MANAGER' | 'ADMIN'
  children?: { href: string; label: string }[]
}

type NavGroup = {
  /** Sin etiqueta el grupo se pinta sin encabezado (el Resumen no necesita título). */
  label?: string
  items: NavItem[]
}

/**
 * El menú, agrupado por el flujo de trabajo real de STP y no por el orden en que
 * se fueron construyendo los módulos: se cotiza a un cliente, la obra se ejecuta,
 * cuesta dinero, entra dinero, y hay gente y configuración detrás.
 *
 * Un grupo desaparece entero si el rol no ve ninguna de sus entradas, así que un
 * USER no encuentra encabezados vacíos.
 */
const NAV: NavGroup[] = [
  {
    items: [{ href: '/dashboard', label: 'Resumen', icon: LayoutDashboard, exact: true }],
  },
  {
    label: 'Comercial',
    items: [{ href: '/dashboard/clientes', module: 'clientes', label: 'Clientes', icon: Users }],
  },
  {
    label: 'Operación',
    items: [
      { href: '/dashboard/proyectos', module: 'proyectos', label: 'Proyectos', icon: FolderKanban },
      { href: '/dashboard/cronograma', module: 'cronograma', label: 'Cronograma', icon: GanttChartSquare },
      { href: '/dashboard/tareas', module: 'tareas', label: 'Tareas', icon: CheckSquare },
      { href: '/dashboard/fichas', module: 'fichas', label: 'Fichas de campo', icon: ClipboardList },
      { href: '/dashboard/archivos', module: 'archivos', label: 'Archivos', icon: FolderOpen },
    ],
  },
  {
    label: 'Costos y compras',
    items: [
      {
        // Costos tiene cuatro vistas y sigue con subentradas desplegables: como grupo
        // propio ocuparía cuatro filas siempre, incluso mientras se trabaja en otra cosa.
        // Orden: primero lo que se usa a diario, y al final los datos maestros.
        href: '/dashboard/costos/materiales',
        module: 'costos',
        match: '/dashboard/costos',
        label: 'Costos',
        icon: Calculator,
        children: [
          { href: '/dashboard/costos/materiales', label: 'Materiales y precios' },
          { href: '/dashboard/costos/acus', label: 'Partidas (ACU)' },
          { href: '/dashboard/costos/importar', label: 'Importar precios' },
          { href: '/dashboard/costos/catalogo', label: 'Unidades y categorías' },
        ],
      },
      { href: '/dashboard/proveedores', module: 'proveedores', label: 'Proveedores', icon: Truck },
      { href: '/dashboard/inventario', module: 'inventario', label: 'Inventario', icon: Package },
    ],
  },
  {
    label: 'Finanzas',
    items: [
      { href: '/dashboard/cotizaciones', module: 'cotizaciones', label: 'Cotizaciones', icon: FileText },
      { href: '/dashboard/pagos', module: 'pagos', label: 'Pagos', icon: CreditCard },
      { href: '/dashboard/gastos', module: 'gastos', label: 'Gastos', icon: Receipt },
      { href: '/dashboard/nomina', module: 'nomina', label: 'Nómina', icon: Wallet },
      { href: '/dashboard/reportes', module: 'reportes', label: 'Reportes', icon: BarChart3 },
    ],
  },
  {
    label: 'Equipo',
    items: [{ href: '/dashboard/colaboradores', module: 'colaboradores', label: 'Colaboradores', icon: HardHat }],
  },
  {
    label: 'Administración',
    items: [
      { href: '/dashboard/usuarios', label: 'Usuarios', icon: UserCog, minRole: 'ADMIN' },
      { href: '/dashboard/configuracion', module: 'configuracion', label: 'Configuración', icon: Settings },
    ],
  },
  {
    label: 'Cuenta',
    items: [{ href: '/dashboard/perfil', label: 'Mi perfil', icon: CircleUser }],
  },
]

const FLAT_TITLES: { href: string; label: string }[] = NAV.flatMap((grupo) =>
  grupo.items.flatMap((item) => [
    { href: item.href, label: item.label },
    ...(item.children ?? []),
  ]),
)

/** Título de la sección para el header, a partir de la misma lista de navegación. */
export function getPageTitle(pathname: string): string {
  const match = FLAT_TITLES.filter(
    (t) => pathname === t.href || pathname.startsWith(`${t.href}/`),
  ).sort((a, b) => b.href.length - a.href.length)[0]
  return match?.label ?? 'STP ERP'
}

const ROLE_RANK: Record<string, number> = { user: 1, finanza: 2, manager: 2, admin: 3 }

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  manager: 'Gerente',
  finanza: 'Finanzas',
  user: 'Usuario',
}

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

  const rank = ROLE_RANK[role.toLowerCase()] ?? 1
  const initials = user
    ? `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase()
    : ''
  const grupos = NAV.map((grupo) => ({
    ...grupo,
    items: grupo.items.filter((item) => {
      if (item.minRole && rank < (ROLE_RANK[item.minRole.toLowerCase()] ?? 1)) return false
      // Sin módulos (API vieja o caída) se muestra como antes; con ellos, solo lo
      // que el rol puede abrir sin recibir un 403.
      if (item.module && modules) return (modules[item.module] ?? 'none') !== 'none'
      return true
    }),
  })).filter((grupo) => grupo.items.length > 0)

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
        {grupos.map((grupo, i) => (
          <SidebarGroup key={grupo.label ?? `grupo-${i}`}>
            {grupo.label && <SidebarGroupLabel>{grupo.label}</SidebarGroupLabel>}
            <SidebarMenu>
              {grupo.items.map((item) => {
                const abierto = isActive(item.match ?? item.href, item.exact)
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton render={<Link href={item.href} />} isActive={abierto}>
                      <item.icon className="size-4" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                    {/* Las subentradas solo aparecen dentro del módulo: fuera de él
                        ocuparían sitio sin aportar contexto. */}
                    {item.children && abierto && (
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
