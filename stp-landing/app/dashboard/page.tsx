export const dynamic = 'force-dynamic'

import { api } from '@/lib/api'
import type {
  Project,
  Task,
  Quote,
  PaginatedResponse,
  DashboardReport,
} from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Users,
  FolderKanban,
  CheckSquare,
  FileText,
  Receipt,
  CreditCard,
  TrendingDown,
  AlertCircle,
} from 'lucide-react'

const PROJECT_STATUS_LABELS: Record<Project['status'], string> = {
  draft: 'Pendiente',
  active: 'En curso',
  on_hold: 'En pausa',
  completed: 'Completado',
  cancelled: 'Cancelado',
}

const PRIORITY_VARIANTS: Record<Task['priority'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
  low: 'outline',
  medium: 'secondary',
  high: 'default',
  urgent: 'destructive',
}

const PRIORITY_LABELS: Record<Task['priority'], string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  urgent: 'Urgente',
}

const QUOTE_STATUS_LABELS: Record<Quote['status'], string> = {
  draft: 'Borrador',
  sent: 'Enviada',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  expired: 'Expirada',
}

// Colores semánticos de estado (tinte suave, coherente con la identidad STP)
const QUOTE_STATUS_BADGE: Record<Quote['status'], string> = {
  draft: 'bg-muted text-muted-foreground',
  sent: 'bg-primary/10 text-primary',
  approved: 'bg-green-600/10 text-green-700 dark:text-green-400',
  rejected: 'bg-destructive/10 text-destructive',
  expired: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
}

const DOP = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' })

export default async function DashboardPage() {
  const [drResult, pResult, tResult, qResult] = await Promise.allSettled([
    api.get<DashboardReport>('/reports/dashboard'),
    api.get<PaginatedResponse<Project>>('/projects?limit=20'),
    api.get<PaginatedResponse<Task>>('/tasks?limit=20'),
    api.get<PaginatedResponse<Quote>>('/quotes?limit=5'),
  ])

  const dashReport = drResult.status === 'fulfilled' ? drResult.value : null
  const allProjects = pResult.status === 'fulfilled' ? pResult.value.data : []
  const allTasks = tResult.status === 'fulfilled' ? tResult.value.data : []
  const recentQuotes = qResult.status === 'fulfilled' ? qResult.value.data : []

  const activeProjects = allProjects.filter((p) => p.status === 'active')
  const urgentTasks = allTasks
    .filter(
      (t) =>
        (t.priority === 'urgent' || t.priority === 'high') &&
        (t.status === 'pending' || t.status === 'in_progress' || t.status === 'review'),
    )
    .slice(0, 6)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // KPI values — from report if available, else derived from fetched data
  const totalClientes = dashReport?.clients.total ?? '—'
  const proyectosEnCurso = dashReport?.projects.active ?? activeProjects.length
  const tareasVencidas = dashReport?.tasks.overdue ?? 0
  const cotizAprobadas = dashReport?.quotes.approved?.amount ?? 0
  const gastosEsteMes = dashReport?.expenses.thisMonth ?? 0
  const cobrosEsteMes = dashReport?.payments.thisMonth ?? 0
  const balanceMes = cobrosEsteMes - gastosEsteMes

  const projectStatusCounts: Partial<Record<Project['status'], number>> =
    dashReport?.projects ?? {}

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Resumen</h1>
        <p className="text-muted-foreground text-sm">Vista general del sistema ERP</p>
      </div>

      {/* Primary stat cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Clientes</CardTitle>
            <Users className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalClientes}</div>
            <p className="text-xs text-muted-foreground mt-1">en total</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Proyectos en curso</CardTitle>
            <FolderKanban className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{proyectosEnCurso}</div>
            <p className="text-xs text-muted-foreground mt-1">activos ahora</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Tareas vencidas</CardTitle>
            <CheckSquare className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${tareasVencidas > 0 ? 'text-destructive' : ''}`}>
              {tareasVencidas}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {tareasVencidas > 0 ? (
                <span className="text-destructive">requieren atención</span>
              ) : (
                'sin vencidas'
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Cotizaciones aprobadas</CardTitle>
            <FileText className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold tabular-nums">{DOP.format(cotizAprobadas)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {dashReport?.quotes.approved?.count ?? 0} aprobadas
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Financial snapshot — only shown if report data is available */}
      {dashReport && (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Gastos este mes</CardTitle>
              <Receipt className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums text-destructive">
                {DOP.format(gastosEsteMes)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">egresos del mes actual</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Cobros este mes</CardTitle>
              <CreditCard className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums text-green-600 dark:text-green-400">
                {DOP.format(cobrosEsteMes)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">pagos completados</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Balance del mes</CardTitle>
              {balanceMes >= 0 ? (
                <CreditCard className="size-4 text-muted-foreground" />
              ) : (
                <TrendingDown className="size-4 text-destructive" />
              )}
            </CardHeader>
            <CardContent>
              <div
                className={`text-2xl font-bold tabular-nums ${
                  balanceMes >= 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-destructive'
                }`}
              >
                {DOP.format(balanceMes)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">cobros − gastos</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Projects status breakdown */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-5">
        {(['draft', 'active', 'on_hold', 'completed', 'cancelled'] as const).map((s) => {
          const count =
            projectStatusCounts[s] ??
            allProjects.filter((p) => p.status === s).length
          return (
            <Card key={s} className="text-center">
              <CardContent className="pt-4 pb-3">
                <div className="text-2xl font-bold">{count}</div>
                <p className="text-xs text-muted-foreground mt-0.5">{PROJECT_STATUS_LABELS[s]}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Two-column: active projects + priority tasks */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Proyectos en curso</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            {activeProjects.length === 0 ? (
              <p className="text-sm text-muted-foreground px-6 pb-4">No hay proyectos en curso.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead>Cliente</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeProjects.slice(0, 6).map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-sm py-2">{p.code}</TableCell>
                      <TableCell className="font-medium py-2">{p.name}</TableCell>
                      <TableCell className="text-muted-foreground text-sm py-2">
                        {p.client?.name ?? '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-3">
            <CardTitle className="text-base">Tareas urgentes / alta prioridad</CardTitle>
            {tareasVencidas > 0 && (
              <Badge variant="destructive" className="ml-auto">
                <AlertCircle className="size-3 mr-1" />
                {tareasVencidas} vencidas
              </Badge>
            )}
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            {urgentTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground px-6 pb-4">No hay tareas urgentes activas.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tarea</TableHead>
                    <TableHead>Prioridad</TableHead>
                    <TableHead>Vence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {urgentTasks.map((t) => {
                    const overdue = t.dueDate && new Date(t.dueDate) < today
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="py-2">
                          <div className="font-medium text-sm">{t.title}</div>
                          {t.project && (
                            <div className="text-xs text-muted-foreground">{t.project.code}</div>
                          )}
                        </TableCell>
                        <TableCell className="py-2">
                          <Badge variant={PRIORITY_VARIANTS[t.priority]}>
                            {PRIORITY_LABELS[t.priority]}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-2 text-sm">
                          {t.dueDate ? (
                            <span className={overdue ? 'text-destructive font-medium' : ''}>
                              {new Date(t.dueDate).toLocaleDateString('es-DO')}
                            </span>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent quotes */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Últimas cotizaciones</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {recentQuotes.length === 0 ? (
            <p className="text-sm text-muted-foreground px-6 pb-4">No hay cotizaciones registradas.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentQuotes.map((q) => (
                  <TableRow key={q.id}>
                    <TableCell className="font-mono text-sm py-2">{q.number}</TableCell>
                    <TableCell className="font-medium py-2">{q.title}</TableCell>
                    <TableCell className="text-muted-foreground text-sm py-2">
                      {q.client?.name ?? '—'}
                    </TableCell>
                    <TableCell className="py-2">
                      <Badge className={QUOTE_STATUS_BADGE[q.status]}>
                        {QUOTE_STATUS_LABELS[q.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums py-2">
                      {DOP.format(q.total)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
