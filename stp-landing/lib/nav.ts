import {
  Users,
  FolderKanban,
  CheckSquare,
  FileText,
  UserCog,
  LayoutDashboard,
  Home,
  Truck,
  Receipt,
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
  FileCheck,
  ReceiptText,
  HandCoins,
  MessageSquare,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type NavItem = {
  href: string
  label: string
  /** Una línea que explica para qué sirve el módulo (se muestra en Inicio y en la búsqueda). */
  description?: string
  icon: LucideIcon
  /** Prefijo por el que se marca activo, si no basta con `href`. */
  match?: string
  /** Prefijo que NO cuenta como activo (p. ej. Facturas recibidas no se marca en /emitidas). */
  exclude?: string
  exact?: boolean
  /** Módulo de la matriz de permisos (module-permissions.ts de la API). */
  module?: string
  /** Rol mínimo, solo para lo que no es un módulo (Usuarios). */
  minRole?: 'MANAGER' | 'ADMIN'
  children?: { href: string; label: string }[]
}

export type NavGroup = {
  /** Sin etiqueta el grupo se pinta sin encabezado (Inicio no necesita título). */
  label?: string
  items: NavItem[]
}

/**
 * El menú, agrupado por el flujo del dinero y del trabajo en STP y no por el orden en
 * que se fueron construyendo los módulos: Ventas (lo que cotizamos, facturamos y nos
 * pagan), la Operación de obra, Compras y gastos (lo que pagamos) y Finanzas (el
 * resultado), con la gente y la configuración detrás.
 *
 * Es la fuente única: el menú lateral, la pantalla de Inicio, la búsqueda de módulos
 * y las migas de pan salen de aquí. Un grupo desaparece entero si el rol no ve ninguna
 * de sus entradas, así que un USER no encuentra encabezados vacíos.
 */
export const NAV: NavGroup[] = [
  {
    items: [
      { href: '/dashboard', label: 'Inicio', icon: Home, exact: true },
      {
        href: '/dashboard/resumen',
        label: 'Resumen',
        // Sus datos salen de /reports: sin permiso de Reportes la pantalla solo daría error.
        module: 'reportes',
        description: 'Indicadores, cartera por cobrar y flujo de caja',
        icon: LayoutDashboard,
      },
    ],
  },
  {
    label: 'Ventas',
    items: [
      { href: '/dashboard/mensajes', module: 'mensajes', label: 'Mensajes', description: 'WhatsApp de STP: conversaciones y seguimiento de clientes potenciales', icon: MessageSquare },
      { href: '/dashboard/clientes', module: 'clientes', label: 'Clientes', description: 'Fichas, contactos y accesos por cliente', icon: Users },
      { href: '/dashboard/cotizaciones', module: 'cotizaciones', label: 'Cotizaciones', description: 'Presupuestos con partidas y PDF', icon: FileText },
      { href: '/dashboard/facturas/emitidas', module: 'facturas', label: 'Facturas emitidas', description: 'Comprobantes fiscales emitidos a clientes', icon: FileCheck },
      { href: '/dashboard/pagos', module: 'pagos', label: 'Cobros', description: 'Pagos recibidos y cobros vencidos', icon: HandCoins },
    ],
  },
  {
    label: 'Operación',
    items: [
      { href: '/dashboard/proyectos', module: 'proyectos', label: 'Proyectos', description: 'Obras, presupuestos y su avance', icon: FolderKanban },
      { href: '/dashboard/cronograma', module: 'cronograma', label: 'Cronograma', description: 'Planificación semanal por proyecto', icon: GanttChartSquare },
      { href: '/dashboard/tareas', module: 'tareas', label: 'Tareas', description: 'Asignación y seguimiento del trabajo', icon: CheckSquare },
      { href: '/dashboard/fichas', module: 'fichas', label: 'Fichas de campo', description: 'Levantamientos e informes técnicos', icon: ClipboardList },
      { href: '/dashboard/archivos', module: 'archivos', label: 'Archivos', description: 'Documentos por cliente y proyecto', icon: FolderOpen },
    ],
  },
  {
    label: 'Compras y gastos',
    items: [
      { href: '/dashboard/proveedores', module: 'proveedores', label: 'Proveedores', description: 'Directorio y datos de contacto', icon: Truck },
      {
        href: '/dashboard/facturas',
        module: 'facturas',
        exclude: '/dashboard/facturas/emitidas',
        label: 'Facturas recibidas',
        description: 'Facturas fiscales de compras y su conciliación',
        icon: ReceiptText,
      },
      { href: '/dashboard/gastos', module: 'gastos', label: 'Gastos', description: 'Egresos por proyecto con su comprobante', icon: Receipt },
      {
        // Costos tiene cuatro vistas y sigue con subentradas desplegables: como grupo
        // propio ocuparía cuatro filas siempre, incluso mientras se trabaja en otra cosa.
        // Orden: primero lo que se usa a diario, y al final los datos maestros.
        href: '/dashboard/costos/materiales',
        module: 'costos',
        match: '/dashboard/costos',
        label: 'Costos',
        description: 'Materiales, precios y análisis de costos (ACU)',
        icon: Calculator,
        children: [
          { href: '/dashboard/costos/materiales', label: 'Materiales y precios' },
          { href: '/dashboard/costos/acus', label: 'Partidas (ACU)' },
          { href: '/dashboard/costos/importar', label: 'Importar precios' },
          { href: '/dashboard/costos/catalogo', label: 'Unidades y categorías' },
        ],
      },
      { href: '/dashboard/inventario', module: 'inventario', label: 'Inventario', description: 'Equipos y su ubicación', icon: Package },
    ],
  },
  {
    label: 'Finanzas',
    items: [
      { href: '/dashboard/nomina', module: 'nomina', label: 'Nómina', description: 'Pagos a colaboradores y préstamos', icon: Wallet },
      { href: '/dashboard/reportes', module: 'reportes', label: 'Reportes', description: 'Análisis por proyecto, cliente y periodo', icon: BarChart3 },
    ],
  },
  {
    label: 'Equipo',
    items: [{ href: '/dashboard/colaboradores', module: 'colaboradores', label: 'Colaboradores', description: 'Personal fijo, contratistas y temporeros', icon: HardHat }],
  },
  {
    label: 'Administración',
    items: [
      { href: '/dashboard/usuarios', label: 'Usuarios', description: 'Cuentas y roles de acceso', icon: UserCog, minRole: 'ADMIN' },
      { href: '/dashboard/configuracion', module: 'configuracion', label: 'Configuración', description: 'Datos de la empresa, logo y términos', icon: Settings },
    ],
  },
  {
    label: 'Cuenta',
    items: [{ href: '/dashboard/perfil', label: 'Mi perfil', description: 'Tus datos y tu contraseña', icon: CircleUser }],
  },
]

export const ROLE_RANK: Record<string, number> = { readonly: 0, user: 1, finanza: 2, manager: 2, admin: 3 }

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  manager: 'Gerente',
  finanza: 'Finanzas',
  readonly: 'Solo lectura (agente)',
  user: 'Usuario',
}

/**
 * Los grupos que el rol puede abrir. Sin `modules` (API vieja o caída) se muestra todo
 * lo que el rol mínimo permite; con ellos, solo lo que no daría un 403.
 */
export function visibleGroups(role: string, modules?: Record<string, string>): NavGroup[] {
  const rank = ROLE_RANK[role.toLowerCase()] ?? 1
  return NAV.map((grupo) => ({
    ...grupo,
    items: grupo.items.filter((item) => {
      if (item.minRole && rank < (ROLE_RANK[item.minRole.toLowerCase()] ?? 1)) return false
      if (item.module && modules) return (modules[item.module] ?? 'none') !== 'none'
      return true
    }),
  })).filter((grupo) => grupo.items.length > 0)
}

export function isNavActive(pathname: string, href: string, exact?: boolean, exclude?: string) {
  if (exclude && pathname.startsWith(exclude)) return false
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)
}

const FLAT: { href: string; label: string; group?: string }[] = NAV.flatMap((grupo) =>
  grupo.items.flatMap((item) => [
    { href: item.href, label: item.label, group: grupo.label },
    ...(item.children ?? []).map((c) => ({ ...c, group: item.label })),
  ]),
)

function bestMatch(pathname: string) {
  return FLAT.filter((t) => pathname === t.href || pathname.startsWith(`${t.href}/`)).sort(
    (a, b) => b.href.length - a.href.length,
  )[0]
}

/** Título de la sección para el header, a partir de la misma lista de navegación. */
export function getPageTitle(pathname: string): string {
  return bestMatch(pathname)?.label ?? 'STP ERP'
}

/** Migas: Área › Módulo (el módulo enlaza si la ruta es más profunda, p. ej. un detalle). */
export function getBreadcrumbs(pathname: string): { label: string; href?: string }[] {
  const m = bestMatch(pathname)
  if (!m || pathname === '/dashboard') return []
  const trail: { label: string; href?: string }[] = []
  if (m.group) trail.push({ label: m.group })
  trail.push({ label: m.label, href: pathname === m.href ? undefined : m.href })
  return trail
}
